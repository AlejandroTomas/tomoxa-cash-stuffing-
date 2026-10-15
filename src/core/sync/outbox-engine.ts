import { ValidationError } from "@/core/errors";
import { reportError } from "@/core/logger";

import type { RemoteGateway } from "./gateway";
import { classifySyncError, type SyncErrorInfo } from "./classify-error";
import { describeDifferences, diffSentVsStored } from "./compare-record";
import type { SyncEntityRegistry } from "./entities";
import type { Connectivity, Identity, RunLock } from "./environment";
import { SyncConfigError, SyncEntryBlockedError } from "./errors";
import { syncLog } from "./sync-log";
import type { OutboxStore } from "./outbox-store";
import { entityKey, isRunnable, nextAttemptDelay, planEnqueue } from "./queue-rules";
import type {
  NewOutboxEntry,
  OutboxEntry,
  OutboxEntryPatch,
  OutboxOperation,
  OutboxRef,
  OutboxSummary,
  RemoteRecord,
  SyncErrorKind,
  SyncRunResult,
} from "./types";

export interface OutboxEngineConfig {
  /** Fallos que cuentan (conflicto, desconocido) antes de pasar a BLOCKED. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Cada cuánto se revisa la cola por si hay reintentos vencidos. */
  pollIntervalMs: number;
  /** Cuánto se guarda una entrada ya confirmada antes de purgarla. */
  retainConfirmedMs: number;
  /** Cada cuánto se purgan las confirmadas viejas en una pestaña que sigue abierta. */
  purgeIntervalMs: number;
}

const DEFAULT_CONFIG: OutboxEngineConfig = {
  maxAttempts: 8,
  baseDelayMs: 5_000,
  maxDelayMs: 10 * 60_000,
  pollIntervalMs: 30_000,
  retainConfirmedMs: 30 * 24 * 60 * 60_000,
  purgeIntervalMs: 24 * 60 * 60_000,
};

export interface OutboxEngineDeps {
  store: OutboxStore;
  gateway: RemoteGateway;
  connectivity: Connectivity;
  identity: Identity;
  lock: RunLock;
  entities: SyncEntityRegistry;
  config?: Partial<OutboxEngineConfig>;
  now?: () => number;
  random?: () => number;
  generateId?: () => string;
}

export interface EnqueueOptions {
  /** Entidades que deben estar confirmadas en el servidor antes de mandar esta. */
  dependsOn?: OutboxRef[];
}

/** Junta varias operaciones para guardarlas en una sola transacción. */
export interface OutboxBatch {
  /** Agrega una operación al lote y devuelve el id de la entidad (generado si el CREATE no trae). */
  add: (
    entityName: string,
    operation: OutboxOperation,
    payload: Record<string, unknown>,
    options?: EnqueueOptions
  ) => string;
}

/** Resultado no exitoso que decide el propio motor (no viene del servidor). */
class OutcomeError extends Error {
  constructor(readonly kind: SyncErrorKind, message: string) {
    super(message);
  }
}

/** Metadatos del motor que no viajan en el cuerpo de la petición. */
const SYSTEM_KEYS = new Set(["__typename", "_deleted", "_version"]);

function defaultGenerateId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/** Errores que no gastan intentos: se arreglan solos (vuelve la red, se renueva la sesión). */
const TRANSIENT_KIND_LIST: SyncErrorKind[] = ["transient", "unauthenticated"];
const TRANSIENT_KINDS = new Set<SyncErrorKind>(TRANSIENT_KIND_LIST);
/** Lo que termina en FAILED (se reintenta solo). Un envío manual lo adelanta. */
const RETRYABLE_KIND_LIST: SyncErrorKind[] = ["transient", "unauthenticated", "conflict", "unknown"];
/** Errores que no se van a arreglar reintentando igual. */
const BLOCKING_KINDS = new Set<SyncErrorKind>([
  "validation",
  "permission",
  "notFound",
  "alreadyExists",
  "divergent",
]);

export class OutboxEngine {
  private readonly config: OutboxEngineConfig;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly generateId: () => string;
  private readonly listeners = new Set<() => void>();
  private activeRun: Promise<SyncRunResult> | null = null;
  private rerunRequested = false;
  private stopCallbacks: Array<() => void> = [];
  private lastPurgeAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly deps: OutboxEngineDeps) {
    this.config = { ...DEFAULT_CONFIG, ...deps.config };
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.generateId = deps.generateId ?? defaultGenerateId;
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  /**
   * Guarda la operación en la cola local y dispara un envío en segundo plano.
   * Cuando la promesa resuelve, la operación ya está en disco: aunque la app se
   * cierre o no haya red, se va a mandar después.
   */
  async enqueue(
    entityName: string,
    operation: OutboxOperation,
    payload: Record<string, unknown>,
    options: EnqueueOptions = {}
  ): Promise<OutboxEntry> {
    const [saved] = await this.batch((batch) => {
      batch.add(entityName, operation, payload, options);
    });
    return saved;
  }

  /**
   * Guarda varias operaciones **todas o ninguna**: un pedido con sus partidas y
   * su pago no puede quedar a medias si la app se cierra en medio. Si `build`
   * lanza (p. ej. un modelo que no está en el registro), no se guarda nada.
   *
   * ```ts
   * await engine.batch((batch) => {
   *   const orderId = batch.add("Order", "CREATE", order);
   *   items.forEach((item) => batch.add("OrderItem", "CREATE", { ...item, orderID: orderId }));
   * });
   * ```
   */
  async batch(build: (batch: OutboxBatch) => void): Promise<OutboxEntry[]> {
    const enqueuedBy = await this.deps.identity.currentUserId();
    const now = this.now();
    const prepared: NewOutboxEntry[] = [];

    build({
      add: (entityName, operation, payload, options = {}) => {
        const entry = this.prepare(entityName, operation, payload, options, enqueuedBy, now);
        prepared.push(entry);
        return entry.entityId;
      },
    });

    if (prepared.length === 0) {
      return [];
    }

    const saved = await this.deps.store.enqueue(prepared, (entry, entityEntries) =>
      planEnqueue(entityEntries, entry)
    );

    // Llega aquí desde `outbox.create/update/delete/batch` (core/sync/index.ts),
    // que a su vez llaman los repositorios (p. ej. payment-outbox.repository.create).
    saved.forEach((entry, index) => {
      const merged = entry.createdAt !== now || saved.slice(0, index).some((other) => other.seq === entry.seq);
      syncLog(
        "motor",
        "outbox-engine.ts › batch",
        merged
          ? `${prepared[index].operation} ${entry.entityName} ${entry.entityId} fusionado en la entrada #${entry.seq} (aún no se mandaba)`
          : `${entry.operation} ${entry.entityName} ${entry.entityId} guardado en la cola como #${entry.seq}; ya no se pierde aunque se cierre la app`,
        { enqueuedBy, dependsOn: entry.dependsOn, payload: entry.payload }
      );
    });

    this.notify();
    this.trigger();

    return saved;
  }

  /**
   * Procesa la cola ahora. Si ya hay un ciclo corriendo, pide otro al terminar
   * y devuelve el que está en curso.
   */
  async syncNow(): Promise<SyncRunResult> {
    if (this.activeRun) {
      this.rerunRequested = true;
      return await this.activeRun;
    }

    this.activeRun = this.runCycle().finally(() => {
      this.activeRun = null;
      this.notify();
      if (this.rerunRequested) {
        this.rerunRequested = false;
        this.trigger();
      }
    });

    this.notify();
    return await this.activeRun;
  }

  /**
   * Envío pedido por una persona ("Sincronizar ahora"): lo que espera un
   * reintento sale ya, sin respetar el backoff acumulado. Lo `BLOCKED` no se
   * toca: eso necesita `retryBlocked`, porque reintentarlo igual volvería a fallar.
   */
  async retryNow(): Promise<SyncRunResult> {
    const expedited = await this.deps.store.expediteRetries(this.now(), RETRYABLE_KIND_LIST);
    syncLog("motor", "outbox-engine.ts › retryNow", `Sincronización manual: ${expedited} reintento(s) adelantado(s)`);
    return await this.syncNow();
  }

  /** Devuelve a la cola lo bloqueado (todo, o solo una entrada) y lo intenta de nuevo. */
  async retryBlocked(seq?: number): Promise<number> {
    const released = await this.deps.store.releaseBlocked(this.now(), seq);
    syncLog("motor", "outbox-engine.ts › retryBlocked", `${released} entrada(s) bloqueada(s) vuelven a la cola`, { seq });
    this.notify();
    if (released > 0) {
      this.trigger();
    }
    return released;
  }

  /**
   * Pasa a la sesión actual entradas que creó otro usuario en este equipo (todas,
   * o solo `seq`), para que se manden. Es una decisión de una persona: el motor
   * nunca lo hace solo.
   */
  async adoptEntries(seq?: number): Promise<number> {
    const currentUser = await this.deps.identity.currentUserId();
    if (!currentUser) {
      throw new ValidationError("Inicia sesión para enviar estos registros.", {
        debugMessage: "adoptEntries sin sesión",
      });
    }
    const adopted = await this.deps.store.reassignEnqueuedBy(currentUser, this.now(), seq);
    syncLog("motor", "outbox-engine.ts › adoptEntries", `${adopted} entrada(s) de otro usuario pasan a la sesión actual`, { currentUser, seq });
    this.notify();
    if (adopted > 0) {
      this.trigger();
    }
    return adopted;
  }

  /** Usuario con sesión en el equipo, o `null`. */
  async currentUserId(): Promise<string | null> {
    return await this.deps.identity.currentUserId();
  }

  /**
   * Arranca los disparadores: al volver la red, al iniciar sesión, cada
   * `pollIntervalMs`, y una vez ahora.
   */
  start(): void {
    if (this.stopCallbacks.length > 0) {
      return;
    }
    // Lo llama startOutbox() (core/sync/index.ts), desde <OutboxBootstrap /> en los providers.
    syncLog("motor", "outbox-engine.ts › start", "Motor arrancado: envía al encolar, al volver la red, al iniciar sesión y cada ciclo", {
      pollIntervalMs: this.config.pollIntervalMs,
    });

    // Al volver la red o entrar a la sesión, lo que esperaba por eso sale ya,
    // sin esperar el backoff que acumuló mientras no se podía.
    this.stopCallbacks.push(
      this.deps.connectivity.onOnline(() => {
        this.expediteAndTrigger();
      }),
      this.deps.identity.onSignIn(() => {
        this.expediteAndTrigger();
      })
    );

    const timer = setInterval(() => {
      this.purgeIfDue();
      this.trigger();
    }, this.config.pollIntervalMs);
    this.stopCallbacks.push(() => {
      clearInterval(timer);
    });

    this.purgeIfDue();
    this.trigger();
  }

  stop(): void {
    this.stopCallbacks.forEach((callback) => {
      callback();
    });
    this.stopCallbacks = [];
  }

  isSyncing(): boolean {
    return this.activeRun !== null;
  }

  /** Resuelve cuando no queda ningún ciclo corriendo ni pedido. */
  async whenIdle(): Promise<void> {
    while (this.activeRun) {
      await this.activeRun;
    }
  }

  async summary(): Promise<OutboxSummary> {
    return await this.deps.store.summary();
  }

  async listOutstanding(): Promise<OutboxEntry[]> {
    return await this.deps.store.listOutstanding();
  }

  /** Todas las entradas de un modelo, en cualquier estado (incluye las confirmadas). */
  async listEntries(entityName: string): Promise<OutboxEntry[]> {
    return await this.deps.store.listByEntity(entityName);
  }

  /** Avisa cuando cambia algo de la cola. Devuelve la función para desuscribirse. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─── Disparadores ─────────────────────────────────────────────────────────

  /** Dispara un ciclo sin esperarlo. `runCycle` no rechaza, pero por si acaso. */
  private trigger(): void {
    this.syncNow().catch((error: unknown) => {
      reportError(error, { context: "sync.outbox.trigger" });
    });
  }

  private expediteAndTrigger(): void {
    syncLog("motor", "outbox-engine.ts › expediteAndTrigger", "Volvió la red o se inició sesión: lo que esperaba por eso sale ya, sin backoff");
    this.deps.store
      .expediteRetries(this.now(), TRANSIENT_KIND_LIST)
      .catch((error: unknown) => {
        reportError(error, { context: "sync.outbox.expedite" });
      })
      .finally(() => {
        this.trigger();
      });
  }

  private purgeIfDue(): void {
    const now = this.now();
    if (now - this.lastPurgeAt < this.config.purgeIntervalMs) {
      return;
    }
    this.lastPurgeAt = now;
    this.deps.store
      .purgeConfirmed(now - this.config.retainConfirmedMs)
      .then((purged) => {
        if (purged > 0) {
          syncLog("motor", "outbox-engine.ts › purgeIfDue", `${purged} entrada(s) confirmadas hace más de 30 días se borraron (solo DONE)`);
        }
      })
      .catch((error: unknown) => {
        reportError(error, { context: "sync.outbox.purgeConfirmed" });
      });
  }

  // ─── Encolado ─────────────────────────────────────────────────────────────

  private prepare(
    entityName: string,
    operation: OutboxOperation,
    payload: Record<string, unknown>,
    options: EnqueueOptions,
    enqueuedBy: string | null,
    now: number
  ): NewOutboxEntry {
    if (!Object.prototype.hasOwnProperty.call(this.deps.entities, entityName)) {
      throw new ValidationError("No se pudo guardar el registro para sincronizar.", {
        debugMessage: `El modelo ${entityName} no está en el registro de sincronización`,
      });
    }

    const payloadId = typeof payload.id === "string" && payload.id ? payload.id : undefined;

    if (!payloadId && operation !== "CREATE") {
      throw new ValidationError("No se pudo guardar el registro para sincronizar.", {
        debugMessage: `${operation} de ${entityName} sin id`,
      });
    }

    const entityId = payloadId ?? this.generateId();

    return {
      entityName,
      entityId,
      operation,
      payload: { ...payload, id: entityId },
      enqueuedBy,
      dependsOn: options.dependsOn ?? [],
      status: "PENDING",
      attempts: 0,
      transientFailures: 0,
      sendCount: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  // ─── Ciclo de envío ───────────────────────────────────────────────────────

  private async runCycle(): Promise<SyncRunResult> {
    const result: SyncRunResult = { synced: 0, failed: 0, blocked: 0, skipped: false };

    if (!this.deps.connectivity.isOnline()) {
      syncLog("motor", "outbox-engine.ts › runCycle", "Ciclo omitido: el navegador dice que no hay red");
      return { ...result, skipped: true };
    }

    try {
      // Sin nadie con sesión no hay con qué mandar: se espera sin gastar reintentos.
      const currentUser = await this.deps.identity.currentUserId();
      if (!currentUser) {
        syncLog("motor", "outbox-engine.ts › runCycle", "Ciclo omitido: no hay sesión (environment.ts › currentUserId)");
        return { ...result, skipped: true };
      }

      const acquired = await this.deps.lock.runExclusive(async () => {
        // Con el lock tomado nadie más está enviando: todo SYNCING es un envío
        // interrumpido (pestaña cerrada, app muerta). Se reenvía; el id propio
        // hace que reenviar no duplique.
        await this.deps.store.resetInFlight(this.now());

        const outstanding = await this.deps.store.listOutstanding();
        if (outstanding.length > 0) {
          syncLog("motor", "outbox-engine.ts › runCycle", `Ciclo: ${outstanding.length} entrada(s) sin confirmar en la cola`, {
            currentUser,
            entradas: outstanding.map((entry) => `#${entry.seq} ${entry.operation} ${entry.entityName} [${entry.status}]`),
          });
        }
        // Entidades con algo anterior sin confirmar: lo que sigue de ellas espera.
        const unresolvedKeys = new Set<string>();
        // Una dependencia también puede aparecer después en el lote.
        const remaining = new Map<string, number>();
        outstanding.forEach((entry) => {
          const key = entityKey(entry);
          remaining.set(key, (remaining.get(key) ?? 0) + 1);
        });
        // El jitter estira la espera hasta +25 %; más allá de esto, el reloj se atrasó.
        const maxWaitMs = this.config.maxDelayMs * 2;

        for (const snapshot of outstanding) {
          const key = entityKey(snapshot);
          // `!= null` cubre entradas sin `enqueuedBy` guardado: las manda cualquier sesión.
          const enqueuedByOther = snapshot.enqueuedBy != null && snapshot.enqueuedBy !== currentUser;
          const waitingDependency = snapshot.dependsOn.some((ref) => (remaining.get(entityKey(ref)) ?? 0) > 0);

          if (enqueuedByOther || waitingDependency || !isRunnable(snapshot, unresolvedKeys, this.now(), maxWaitMs)) {
            unresolvedKeys.add(key);
            if (snapshot.status !== "BLOCKED") {
              syncLog("motor", "outbox-engine.ts › runCycle", `#${snapshot.seq} espera: ${
                enqueuedByOther
                  ? `la encoló otra sesión (${snapshot.enqueuedBy ?? ""})`
                  : snapshot.status === "FAILED"
                    ? `reintento programado a las ${new Date(snapshot.nextAttemptAt).toLocaleTimeString()}`
                    : "hay algo anterior del mismo registro o de una dependencia sin confirmar (queue-rules.ts › isRunnable)"
              }`);
            }
            continue;
          }

          // Se relee al tomarla: si mientras esperaba turno se le fusionó una
          // edición, se manda la versión con la edición, no la del snapshot.
          const entry = await this.deps.store.claim(snapshot.seq, this.now());
          if (!entry) {
            unresolvedKeys.add(key);
            continue;
          }
          syncLog("motor", "outbox-engine.ts › runCycle", `#${entry.seq} tomada para enviar (intento ${entry.sendCount}); se releyó de disco por si se le fusionó una edición`);

          const patch = await this.send(entry);
          this.notify();

          if (patch.status === "DONE") {
            remaining.set(key, (remaining.get(key) ?? 1) - 1);
            result.synced += 1;
            continue;
          }

          unresolvedKeys.add(key);

          if (patch.status === "BLOCKED") {
            result.blocked += 1;
          } else {
            result.failed += 1;
            // Sin red o sin sesión, lo que sigue va a fallar igual: se corta el ciclo.
            if (patch.lastErrorKind && TRANSIENT_KINDS.has(patch.lastErrorKind)) {
              break;
            }
          }
        }
      });

      result.skipped = !acquired;
      if (!acquired) {
        syncLog("motor", "outbox-engine.ts › runCycle", "Ciclo omitido: otra pestaña está enviando (environment.ts › createBrowserRunLock)");
      } else if (result.synced + result.failed + result.blocked > 0) {
        syncLog("motor", "outbox-engine.ts › runCycle", "Fin del ciclo", { ...result });
      }
    } catch (error) {
      // Falla de IndexedDB u otra cosa fuera de lo previsto. La entrada en curso
      // quedó en SYNCING y se recupera en el siguiente ciclo.
      reportError(error, { context: "sync.outbox.runCycle" });
      result.skipped = true;
    }

    return result;
  }

  /** Manda una entrada ya tomada (`SYNCING`) y guarda el resultado. */
  private async send(entry: OutboxEntry): Promise<OutboxEntryPatch> {
    let patch: OutboxEntryPatch;
    let remote: RemoteRecord | null = null;

    try {
      remote = await this.perform(entry);
      patch = {
        status: "DONE",
        syncedAt: this.now(),
        updatedAt: this.now(),
        remoteVersion: remote?._version ?? undefined,
        lastError: undefined,
        lastErrorKind: undefined,
      };
    } catch (error) {
      patch = this.failurePatch(entry, error);
    }

    if (patch.status === "DONE") {
      await this.deps.store.confirm(entry, patch, remote);
    } else {
      await this.deps.store.update(entry.seq, patch);
    }
    syncLog(
      "motor",
      "outbox-engine.ts › send",
      patch.status === "DONE"
        ? `#${entry.seq} ${entry.entityName} ${entry.entityId} CONFIRMADO por el servidor`
        : patch.status === "BLOCKED"
          ? `#${entry.seq} BLOQUEADO [${patch.lastErrorKind ?? ""}]: queda guardado, requiere atención`
          : `#${entry.seq} FALLÓ [${patch.lastErrorKind ?? ""}]: reintenta a las ${new Date(patch.nextAttemptAt ?? 0).toLocaleTimeString()}`,
      patch.status === "DONE" ? { remoteVersion: patch.remoteVersion } : { lastError: patch.lastError }
    );
    return patch;
  }

  /**
   * Hace la operación y devuelve el registro remoto que la confirma (o `null` si
   * la API no regresa cuerpo). Solo resuelve si el servidor confirmó; cualquier
   * duda termina en error.
   */
  private async perform(entry: OutboxEntry): Promise<RemoteRecord | null> {
    const { gateway } = this.deps;
    const { entityName, entityId } = entry;
    const versioned = gateway.usesVersioning(entityName);

    switch (entry.operation) {
      case "CREATE": {
        const input = this.toInput(entry, "CREATE");
        let stored: RemoteRecord | null;
        try {
          stored = await gateway.mutate(entityName, "CREATE", input);
          syncLog("motor", "outbox-engine.ts › perform", `CREATE ${entityName} aceptado por el servidor`, { input });
        } catch (error) {
          syncLog("motor", "outbox-engine.ts › perform", `CREATE ${entityName} rechazado [${classifySyncError(error).kind}]; se confirma si sí quedó guardado`, { input });
          stored = await this.confirmCreated(entry, error);
        }
        // Sin cuerpo en la respuesta: se lee para poder comparar lo que quedó guardado.
        stored ??= await gateway.fetch(entityName, entityId);
        if (!stored) {
          throw new OutcomeError("unknown", `${entityName} ${entityId}: el servidor aceptó el CREATE pero no se encontró al leerlo`);
        }
        // Que el servidor tenga el id no basta: tiene que tener lo que se mandó.
        const differences = diffSentVsStored(input, stored);
        syncLog(
          "motor",
          "outbox-engine.ts › perform",
          differences.length === 0
            ? "Lo que tiene el servidor coincide con lo enviado"
            : `Lo que tiene el servidor NO coincide → ${describeDifferences(differences)}`,
        );
        if (stored.id !== entityId || stored._deleted === true || differences.length > 0) {
          throw new OutcomeError(
            "divergent",
            `${entityName} ${entityId} ya existe en el servidor con otros datos (${describeDifferences(differences)}). Si era una edición, debía ir como UPDATE.`,
          );
        }
        return stored;
      }

      case "UPDATE": {
        const changes = { ...this.toInput(entry, "UPDATE"), id: entityId };
        let input: Record<string, unknown> = changes;
        if (versioned) {
          // Se pide la versión actual justo antes de mandar: si alguien más cambió
          // el registro entre medio, el servidor rechaza con ConflictError.
          const remote = await gateway.fetch(entityName, entityId);
          syncLog("motor", "outbox-engine.ts › perform", `UPDATE ${entityName} ${entityId}: versión actual ${String(remote?._version ?? "— (no existe)")}`);
          if (!remote || remote._deleted) {
            throw new OutcomeError("notFound", `${entityName} ${entityId} no existe en el servidor (o fue borrado); no hay qué actualizar`);
          }
          input = { ...changes, _version: remote._version };
        }
        const stored = await gateway.mutate(entityName, "UPDATE", input);
        // La API no regresa el registro: su respuesta 2xx es la confirmación.
        if (!stored) return null;
        const differences = diffSentVsStored(changes, stored);
        for (const [field, sent] of Object.entries(changes)) {
          if (sent === null && stored[field] != null) {
            differences.push({ field, sent, stored: stored[field] });
          }
        }
        if (stored.id !== entityId || stored._deleted === true || differences.length > 0) {
          throw new OutcomeError("conflict", `${entityName} ${entityId}: la actualización no quedó aplicada (${describeDifferences(differences)})`);
        }
        return stored;
      }

      case "DELETE": {
        if (!versioned) {
          try {
            return await gateway.mutate(entityName, "DELETE", { id: entityId });
          } catch (error) {
            // Ya no está en el servidor: lo que pedía esta entrada ya se cumple.
            if (classifySyncError(error).kind === "notFound") return null;
            throw error;
          }
        }
        const remote = await gateway.fetch(entityName, entityId);
        if (!remote || remote._deleted) return remote;
        const stored = await gateway.mutate(entityName, "DELETE", { id: entityId, _version: remote._version });
        // Con borrado lógico el servidor lo devuelve marcado; sin cuerpo, su 2xx confirma.
        if (stored && (stored.id !== entityId || stored._deleted === false)) {
          throw new OutcomeError("conflict", `${entityName} ${entityId}: el servidor no confirmó el borrado`);
        }
        return stored;
      }
    }
  }

  /**
   * El CREATE fue rechazado, pero el servidor pudo haberlo guardado igual: se
   * perdió la respuesta de un envío anterior ("ya existe"), hubo un conflicto de
   * versión, o falló un campo anidado de la respuesta. Se lee el registro para
   * saberlo. Si no está, decide el error original; un "ya existe" que no aparece
   * queda bloqueado para revisión, nunca confirmado.
   */
  private async confirmCreated(entry: OutboxEntry, error: unknown): Promise<RemoteRecord> {
    const { entityName, entityId } = entry;
    const { kind } = classifySyncError(error);

    if (TRANSIENT_KINDS.has(kind) || error instanceof SyncConfigError) {
      throw error;
    }

    const remote = await this.deps.gateway.fetch(entityName, entityId);
    syncLog(
      "motor",
      "outbox-engine.ts › confirmCreated",
      remote && !remote._deleted
        ? `${entityName} ${entityId} SÍ está en el servidor (p. ej. se perdió la respuesta de un envío anterior)`
        : `${entityName} ${entityId} ${remote ? "está borrado" : "NO está"} en el servidor`
    );

    if (remote && !remote._deleted) {
      return remote;
    }

    if (remote) {
      throw new OutcomeError(
        "alreadyExists",
        `${entityName} ${entityId} existe en el servidor pero está marcado como borrado`
      );
    }

    if (kind === "alreadyExists") {
      throw new OutcomeError(
        "alreadyExists",
        `El servidor dice que ${entityName} ${entityId} ya existe, pero no se encontró al consultarlo`
      );
    }

    throw error;
  }

  private toInput(entry: OutboxEntry, operation: OutboxOperation): Record<string, unknown> {
    const definition = this.deps.entities[entry.entityName];

    if (definition?.toInput) {
      return { ...definition.toInput(entry.payload, operation), id: entry.entityId };
    }

    const input = Object.fromEntries(
      Object.entries(entry.payload).filter(
        ([key]) => !SYSTEM_KEYS.has(key)
      )
    );

    return { ...input, id: entry.entityId };
  }

  // ─── Fallos ───────────────────────────────────────────────────────────────

  private describeFailure(entry: OutboxEntry, error: unknown): SyncErrorInfo {
    if (error instanceof OutcomeError) {
      return { kind: error.kind, message: error.message };
    }
    if (error instanceof SyncConfigError) {
      return { kind: "validation", message: error.debugMessage ?? error.message };
    }

    const info = classifySyncError(error);

    // En un UPDATE/DELETE, un ConflictError es choque de versión, no "ya existe".
    if (info.kind === "alreadyExists" && entry.operation !== "CREATE") {
      return { ...info, kind: "conflict" };
    }

    return info;
  }

  private failurePatch(entry: OutboxEntry, error: unknown): OutboxEntryPatch {
    const { kind, message } = this.describeFailure(entry, error);
    const now = this.now();
    const base = { lastError: message, lastErrorKind: kind, updatedAt: now };

    if (TRANSIENT_KINDS.has(kind)) {
      const transientFailures = entry.transientFailures + 1;
      return {
        ...base,
        status: "FAILED",
        transientFailures,
        nextAttemptAt: now + nextAttemptDelay(transientFailures, this.config, this.random),
      };
    }

    const attempts = entry.attempts + 1;

    if (BLOCKING_KINDS.has(kind) || attempts >= this.config.maxAttempts) {
      reportError(
        new SyncEntryBlockedError("Hay registros que no se pudieron sincronizar.", {
          debugMessage: `${entry.entityName} ${entry.entityId} (${entry.operation}) bloqueado [${kind}]: ${message}`,
          cause: error,
        }),
        { context: "sync.outbox" }
      );
      return { ...base, status: "BLOCKED", attempts, transientFailures: 0 };
    }

    return {
      ...base,
      status: "FAILED",
      attempts,
      transientFailures: 0,
      nextAttemptAt: now + nextAttemptDelay(attempts, this.config, this.random),
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        reportError(error, { context: "sync.outbox.listener" });
      }
    });
  }
}
