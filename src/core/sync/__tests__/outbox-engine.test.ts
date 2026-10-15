import {
  ConflictError,
  NetworkError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "@/core/errors";
import type { RemoteGateway } from "@/core/sync/gateway";
import { OutboxEngine, type OutboxEngineConfig } from "@/core/sync/outbox-engine";
import { MemoryOutboxStore } from "@/core/sync/test-utils/memory-outbox-store";
import { TEST_REGISTRY } from "@/core/sync/test-utils/test-registry";
import type { OutboxOperation, RemoteRecord } from "@/core/sync/types";

jest.mock("@/core/logger", () => ({ reportError: jest.fn(() => "mensaje seguro") }));

// ─── Errores tal como los lanza core/http (o cualquier gateway) ─────────────

const NETWORK_ERROR = new NetworkError();
/** CREATE con un id que ya existe (409). */
const ALREADY_EXISTS_ERROR = new ConflictError();
const VALIDATION_ERROR = new ValidationError("Datos inválidos", { fieldErrors: { foo: "no existe" } });
const UNKNOWN_ERROR = new Error("Algo inesperado del servidor");
/** El registro se escribió, pero la respuesta falló por permisos sobre un campo relacionado. */
const NESTED_PERMISSION_ERROR = new PermissionDeniedError();
/** Choque de versión. */
const CONFLICT_ERROR = new ConflictError("Choque de versión");

// ─── Servidor falso ──────────────────────────────────────────────────────────

type Behavior = "ok" | { throw: unknown } | { writeThenThrow: unknown };

interface MutateCall {
  entityName: string;
  operation: OutboxOperation;
  input: Record<string, unknown>;
}

class FakeGateway implements RemoteGateway {
  readonly remote = new Map<string, RemoteRecord & Record<string, unknown>>();
  readonly mutateCalls: MutateCall[] = [];
  readonly fetchCalls: string[] = [];
  readonly mutateBehaviors: Behavior[] = [];
  /** Concurrencia optimista por versión (como AppSync o una API con `version`). */
  versioned = true;
  /** La API responde 204 sin cuerpo a UPDATE/DELETE (y a CREATE). */
  emptyResponses = false;
  /** Si está, `fetch` devuelve null aunque el registro exista (p. ej. una regla de dueño). */
  hideOnGet = false;
  /** Servidor que ante un id repetido fusiona en vez de rechazar: responde OK con lo que ya tenía. */
  mergeOnDuplicateCreate = false;
  private gate: { release: Promise<void>; reached: () => void } | null = null;

  /** Deja colgado el siguiente `mutate` hasta llamar a `release`. */
  pauseNext(): { reached: Promise<void>; release: () => void } {
    let release: () => void = () => undefined;
    let markReached: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      markReached = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.gate = { release: released, reached: markReached };
    return { reached, release };
  }

  private key(entityName: string, id: string): string {
    return `${entityName}#${id}`;
  }

  usesVersioning(): boolean {
    return this.versioned;
  }

  async mutate(entityName: string, operation: OutboxOperation, input: Record<string, unknown>): Promise<RemoteRecord | null> {
    this.mutateCalls.push({ entityName, operation, input: structuredClone(input) });
    const behavior = this.mutateBehaviors.shift() ?? "ok";

    if (this.gate) {
      const gate = this.gate;
      this.gate = null;
      gate.reached();
      await gate.release;
    }

    if (typeof behavior === "object" && "throw" in behavior) throw behavior.throw;

    const id = String(input.id);
    const key = this.key(entityName, id);
    const existing = this.remote.get(key);
    let record: RemoteRecord & Record<string, unknown>;

    if (operation === "CREATE") {
      if (existing && this.mergeOnDuplicateCreate) return existing;
      if (existing) throw ALREADY_EXISTS_ERROR;
      record = { ...input, id, _version: 1, _deleted: false };
    } else if (!existing && !this.versioned) {
      // Sin versión el motor no lee antes: la API responde 404.
      throw new NotFoundError();
    } else if (operation === "UPDATE") {
      const { _version: _sent, ...changes } = input;
      record = { ...existing, ...changes, id, _version: (existing?._version ?? 0) + 1 };
    } else {
      record = { ...existing, id, _deleted: true, _version: (existing?._version ?? 0) + 1 };
    }

    this.remote.set(key, record);

    if (typeof behavior === "object" && "writeThenThrow" in behavior) throw behavior.writeThenThrow;

    return this.emptyResponses ? null : record;
  }

  async fetch(entityName: string, id: string): Promise<RemoteRecord | null> {
    this.fetchCalls.push(id);
    if (this.hideOnGet) return null;
    return this.remote.get(this.key(entityName, id)) ?? null;
  }

  createCount(entityName: string): number {
    return [...this.remote.keys()].filter((key) => key.startsWith(`${entityName}#`)).length;
  }
}

// ─── Armado ──────────────────────────────────────────────────────────────────

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(config: Partial<OutboxEngineConfig> = {}) {
  const store = new MemoryOutboxStore();
  const gateway = new FakeGateway();
  let now = 1_000_000;
  let online = true;
  let idCounter = 0;
  let user: string | null = "asesor-1";
  const onlineListeners: Array<() => void> = [];
  const signInListeners: Array<() => void> = [];

  const engine = new OutboxEngine({
    store,
    gateway,
    connectivity: {
      isOnline: () => online,
      onOnline: (listener) => {
        onlineListeners.push(listener);
        return () => undefined;
      },
    },
    identity: {
      currentUserId: async () => user,
      onSignIn: (listener) => {
        signInListeners.push(listener);
        return () => undefined;
      },
    },
    lock: {
      runExclusive: async (task) => {
        await task();
        return true;
      },
    },
    entities: TEST_REGISTRY,
    config: { baseDelayMs: 1_000, maxDelayMs: 60_000, ...config },
    now: () => now,
    random: () => 0,
    generateId: () => `gen-${++idCounter}`,
  });

  return {
    store,
    gateway,
    engine,
    advance: (ms: number) => {
      now += ms;
    },
    setOnline: (value: boolean) => {
      online = value;
    },
    setUser: (value: string | null) => {
      user = value;
    },
    /** Simula el evento del navegador y espera a que termine lo que dispara. */
    async emitOnline() {
      onlineListeners.forEach((listener) => {
        listener();
      });
      await flush();
      await engine.whenIdle();
    },
    async emitSignIn() {
      signInListeners.forEach((listener) => {
        listener();
      });
      await flush();
      await engine.whenIdle();
    },
    /** Encola y espera a que termine el envío que dispara. */
    async run() {
      await engine.whenIdle();
      await engine.syncNow();
      await engine.whenIdle();
    },
  };
}

describe("OutboxEngine", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it("manda un CREATE y lo marca confirmado con la versión del servidor", async () => {
    const entry = await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 100 });
    await ctx.engine.whenIdle();

    const [saved] = ctx.store.all();
    expect(saved.seq).toBe(entry.seq);
    expect(saved.status).toBe("DONE");
    expect(saved.remoteVersion).toBe(1);
    expect(ctx.gateway.remote.get("Payment#p1")).toMatchObject({ amount: 100 });
  });

  it("genera el id si el CREATE no lo trae, y es el mismo que se manda", async () => {
    const entry = await ctx.engine.enqueue("Payment", "CREATE", { amount: 5 });
    await ctx.engine.whenIdle();

    expect(entry.entityId).toBe("gen-1");
    expect(ctx.gateway.mutateCalls[0].input.id).toBe("gen-1");
  });

  it("guarda la operación aunque no haya red, y la manda cuando vuelve", async () => {
    ctx.setOnline(false);
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 100 });
    await ctx.engine.whenIdle();

    expect(ctx.gateway.mutateCalls).toHaveLength(0);
    expect(ctx.store.all()[0].status).toBe("PENDING");

    ctx.setOnline(true);
    await ctx.run();

    expect(ctx.store.all()[0].status).toBe("DONE");
  });

  it("un error de red no gasta intentos ni borra nada, y espera antes de reintentar", async () => {
    ctx.gateway.mutateBehaviors.push(
      { throw: NETWORK_ERROR },
      { throw: NETWORK_ERROR },
      { throw: NETWORK_ERROR }
    );
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1" });
    await ctx.engine.whenIdle();

    for (let i = 0; i < 2; i++) {
      ctx.advance(120_000);
      await ctx.run();
    }

    const [entry] = ctx.store.all();
    expect(entry.status).toBe("FAILED");
    expect(entry.attempts).toBe(0);
    expect(entry.transientFailures).toBe(3);
    expect(entry.lastErrorKind).toBe("transient");

    // Antes de que venza la espera no se reintenta.
    await ctx.run();
    expect(ctx.gateway.mutateCalls).toHaveLength(3);

    ctx.advance(120_000);
    await ctx.run();
    expect(ctx.store.all()[0].status).toBe("DONE");
  });

  it("si el servidor lo guardó pero la respuesta se perdió, el reenvío lo confirma sin duplicar", async () => {
    ctx.gateway.mutateBehaviors.push({ writeThenThrow: NETWORK_ERROR });
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 100 });
    await ctx.engine.whenIdle();
    expect(ctx.store.all()[0].status).toBe("FAILED");

    ctx.advance(60_000);
    await ctx.run();

    expect(ctx.store.all()[0].status).toBe("DONE");
    expect(ctx.gateway.createCount("Payment")).toBe(1);
  });

  it("si dice que ya existe pero no aparece al consultarlo, queda bloqueado y NUNCA confirmado", async () => {
    ctx.gateway.mutateBehaviors.push({ throw: ALREADY_EXISTS_ERROR });
    ctx.gateway.hideOnGet = true;
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 100 });
    await ctx.engine.whenIdle();

    const [entry] = ctx.store.all();
    expect(entry.status).toBe("BLOCKED");
    expect(entry.lastErrorKind).toBe("alreadyExists");
    expect(entry.payload).toMatchObject({ id: "p1", amount: 100 });
  });

  it("un input rechazado queda bloqueado con su payload intacto y se puede reintentar", async () => {
    ctx.gateway.mutateBehaviors.push({ throw: VALIDATION_ERROR });
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 100 });
    await ctx.engine.whenIdle();

    expect(ctx.store.all()[0]).toMatchObject({
      status: "BLOCKED",
      lastErrorKind: "validation",
      payload: { id: "p1", amount: 100 },
    });

    // Bloqueado no se reintenta solo, por más tiempo que pase.
    ctx.advance(24 * 60 * 60_000);
    await ctx.run();
    expect(ctx.gateway.mutateCalls).toHaveLength(1);

    await ctx.engine.retryBlocked();
    await ctx.engine.whenIdle();
    expect(ctx.store.all()[0].status).toBe("DONE");
  });

  it("errores desconocidos repetidos terminan bloqueados, no borrados", async () => {
    ctx = setup({ maxAttempts: 3 });
    ctx.gateway.mutateBehaviors.push(
      { throw: UNKNOWN_ERROR },
      { throw: UNKNOWN_ERROR },
      { throw: UNKNOWN_ERROR }
    );
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1" });
    await ctx.engine.whenIdle();
    for (let i = 0; i < 2; i++) {
      ctx.advance(120_000);
      await ctx.run();
    }

    expect(ctx.store.all()).toHaveLength(1);
    expect(ctx.store.all()[0]).toMatchObject({ status: "BLOCKED", attempts: 3 });
  });

  it("una edición antes del primer envío se fusiona en el CREATE", async () => {
    ctx.setOnline(false);
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 100, notes: "a" });
    await ctx.engine.enqueue("Payment", "UPDATE", { id: "p1", amount: 150 });
    ctx.setOnline(true);
    await ctx.run();

    expect(ctx.store.all()).toHaveLength(1);
    expect(ctx.gateway.mutateCalls).toHaveLength(1);
    expect(ctx.gateway.mutateCalls[0]).toMatchObject({
      operation: "CREATE",
      input: { id: "p1", amount: 150, notes: "a" },
    });
  });

  it("un UPDATE no sale mientras el CREATE de la misma entidad no esté confirmado", async () => {
    ctx.gateway.mutateBehaviors.push({ throw: VALIDATION_ERROR });
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 100 });
    await ctx.engine.whenIdle();
    await ctx.engine.enqueue("Payment", "UPDATE", { id: "p1", amount: 150 });
    await ctx.engine.whenIdle();

    expect(ctx.store.all()).toHaveLength(2);
    expect(ctx.gateway.mutateCalls.map((call) => call.operation)).toEqual(["CREATE"]);

    await ctx.engine.retryBlocked();
    await ctx.engine.whenIdle();

    expect(ctx.gateway.mutateCalls.map((call) => call.operation)).toEqual([
      "CREATE",
      "CREATE",
      "UPDATE",
    ]);
    expect(ctx.gateway.remote.get("Payment#p1")).toMatchObject({ amount: 150 });
  });

  it("un pago que depende de un pedido espera a que el pedido se confirme", async () => {
    ctx.gateway.mutateBehaviors.push({ throw: VALIDATION_ERROR });
    await ctx.engine.enqueue("Order", "CREATE", { id: "o1" });
    await ctx.engine.whenIdle();
    await ctx.engine.enqueue(
      "Payment",
      "CREATE",
      { id: "p1", orderId: "o1" },
      { dependsOn: [{ entityName: "Order", entityId: "o1" }] }
    );
    await ctx.engine.whenIdle();

    expect(ctx.gateway.mutateCalls.map((call) => call.entityName)).toEqual(["Order"]);

    await ctx.engine.retryBlocked();
    await ctx.engine.whenIdle();

    expect(ctx.gateway.mutateCalls.map((call) => call.entityName)).toEqual([
      "Order",
      "Order",
      "Payment",
    ]);
    expect(ctx.store.all().every((entry) => entry.status === "DONE")).toBe(true);
  });

  it("espera una dependencia aunque se encoló después del pago", async () => {
    ctx.setOnline(false);
    await ctx.engine.batch((batch) => {
      batch.add("Payment", "CREATE", { id: "p1", amount: 100 }, { dependsOn: [{ entityName: "Order", entityId: "o1" }] });
      batch.add("Order", "CREATE", { id: "o1" });
    });
    await ctx.engine.whenIdle();
    ctx.setOnline(true);
    await ctx.engine.syncNow();
    expect(ctx.gateway.mutateCalls.map((call) => call.entityName)).toEqual(["Order"]);
    await ctx.engine.syncNow();
    expect(ctx.gateway.mutateCalls.map((call) => call.entityName)).toEqual(["Order", "Payment"]);
  });

  it("un UPDATE con versión manda la versión actual del servidor", async () => {
    ctx.gateway.remote.set("Payment#p1", { id: "p1", amount: 1, _version: 7 });
    await ctx.engine.enqueue("Payment", "UPDATE", { id: "p1", amount: 2 });
    await ctx.engine.whenIdle();

    expect(ctx.gateway.mutateCalls[0].input).toMatchObject({ id: "p1", amount: 2, _version: 7 });
    expect(ctx.store.all()[0]).toMatchObject({ status: "DONE", remoteVersion: 8 });
  });

  it("un UPDATE que el servidor dejó sin aplicar no se confirma", async () => {
    const current = { id: "p1", amount: 100, _version: 7 };
    ctx.gateway.remote.set("Payment#p1", current);
    jest.spyOn(ctx.gateway, "mutate").mockResolvedValue({ ...current, _version: 8 });
    await ctx.engine.enqueue("Payment", "UPDATE", { id: "p1", amount: 150 });
    await ctx.engine.whenIdle();
    expect(ctx.store.all()[0]).toMatchObject({ status: "FAILED", lastErrorKind: "conflict" });
    expect(ctx.store.confirmedRecords.size).toBe(0);
  });

  it("un DELETE cuya respuesta sigue viva no se confirma", async () => {
    const current = { id: "p1", amount: 100, _version: 7 };
    ctx.gateway.remote.set("Payment#p1", current);
    jest.spyOn(ctx.gateway, "mutate").mockResolvedValue({ ...current, _version: 8, _deleted: false });
    await ctx.engine.enqueue("Payment", "DELETE", { id: "p1" });
    await ctx.engine.whenIdle();
    expect(ctx.store.all()[0]).toMatchObject({ status: "FAILED", lastErrorKind: "conflict" });
  });

  it("un UPDATE que intenta vaciar un campo tampoco confirma si el servidor lo conservó", async () => {
    const current = { id: "p1", printDate: "2026-10-12T10:00:00.000Z", _version: 7 };
    ctx.gateway.remote.set("Payment#p1", current);
    jest.spyOn(ctx.gateway, "mutate").mockResolvedValue({ ...current, _version: 8 });
    await ctx.engine.enqueue("Payment", "UPDATE", { id: "p1", printDate: null });
    await ctx.engine.whenIdle();
    expect(ctx.store.all()[0]).toMatchObject({ status: "FAILED", lastErrorKind: "conflict" });
  });

  it("un UPDATE de algo que no existe en el servidor se bloquea, no se descarta", async () => {
    await ctx.engine.enqueue("Payment", "UPDATE", { id: "nope", amount: 2 });
    await ctx.engine.whenIdle();

    expect(ctx.gateway.mutateCalls).toHaveLength(0);
    expect(ctx.store.all()[0]).toMatchObject({ status: "BLOCKED", lastErrorKind: "notFound" });
  });

  it("un DELETE de algo que ya no está en el servidor se da por cumplido", async () => {
    await ctx.engine.enqueue("Payment", "DELETE", { id: "gone" });
    await ctx.engine.whenIdle();

    expect(ctx.gateway.mutateCalls).toHaveLength(0);
    expect(ctx.store.all()[0].status).toBe("DONE");
  });

  it("un envío interrumpido (SYNCING huérfano) se reenvía al siguiente ciclo", async () => {
    ctx.setOnline(false);
    const entry = await ctx.engine.enqueue("Payment", "CREATE", { id: "p1" });
    await ctx.store.update(entry.seq, { status: "SYNCING", sendCount: 1 });
    ctx.setOnline(true);
    await ctx.run();

    expect(ctx.store.all()[0].status).toBe("DONE");
  });

  it("no manda los metadatos del motor en el input", async () => {
    await ctx.engine.enqueue("Payment", "CREATE", {
      id: "p1",
      amount: 1,
      __typename: "Payment",
      _deleted: false,
      _version: 4,
    });
    await ctx.engine.whenIdle();

    expect(ctx.gateway.mutateCalls[0].input).toEqual({ id: "p1", amount: 1 });
  });

  it("la purga solo borra lo confirmado hace tiempo; lo pendiente se queda", async () => {
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1" });
    await ctx.engine.whenIdle();
    ctx.setOnline(false);
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p2" });

    ctx.advance(31 * 24 * 60 * 60_000);
    ctx.engine.start();
    ctx.engine.stop();
    await ctx.engine.whenIdle();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ctx.store.all().map((entry) => [entry.entityId, entry.status])).toEqual([
      ["p2", "PENDING"],
    ]);
  });

  it("rechaza un modelo que no está en el registro, sin guardar nada", async () => {
    await expect(ctx.engine.enqueue("Nope", "CREATE", { id: "x" })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(ctx.store.all()).toHaveLength(0);
  });

  it("rechaza un UPDATE sin id", async () => {
    await expect(ctx.engine.enqueue("Payment", "UPDATE", { amount: 1 })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  // ─── Hallazgos de la auditoría ────────────────────────────────────────────

  it("una edición fusionada mientras el ciclo estaba ocupado se manda con la edición", async () => {
    ctx.setOnline(false);
    await ctx.engine.enqueue("Order", "CREATE", { id: "o1" });
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 100 });
    ctx.setOnline(true);

    // El ciclo toma su lista con p1 adentro y se queda esperando la respuesta de o1.
    const { reached, release } = ctx.gateway.pauseNext();
    const cycle = ctx.engine.syncNow();
    await reached;

    // p1 todavía no se ha mandado: la edición se fusiona en su CREATE.
    await ctx.engine.enqueue("Payment", "UPDATE", { id: "p1", amount: 150 });
    expect(ctx.store.all().filter((entry) => entry.entityId === "p1")).toHaveLength(1);

    release();
    await cycle;
    await ctx.engine.whenIdle();

    expect(ctx.gateway.remote.get("Payment#p1")).toMatchObject({ amount: 150 });
    expect(ctx.store.all().every((entry) => entry.status === "DONE")).toBe(true);
  });

  it("un lote se guarda completo o no se guarda", async () => {
    ctx.store.failOnEntry = 3;
    await expect(
      ctx.engine.batch((batch) => {
        const orderId = batch.add("Order", "CREATE", { id: "o1" });
        batch.add("OrderItem", "CREATE", { id: "i1", orderID: orderId });
        batch.add("OrderItem", "CREATE", { id: "i2", orderID: orderId });
      })
    ).rejects.toThrow();

    expect(ctx.store.all()).toHaveLength(0);
    expect(ctx.gateway.mutateCalls).toHaveLength(0);
  });

  it("si un lote trae un modelo que no existe, no se guarda nada del lote", async () => {
    await expect(
      ctx.engine.batch((batch) => {
        batch.add("Order", "CREATE", { id: "o1" });
        batch.add("Nope", "CREATE", { id: "x" });
      })
    ).rejects.toBeInstanceOf(ValidationError);

    expect(ctx.store.all()).toHaveLength(0);
  });

  it("un lote sale en orden y devuelve ids para enlazar dependencias", async () => {
    let orderId = "";
    await ctx.engine.batch((batch) => {
      orderId = batch.add("Order", "CREATE", { total: 10 });
      batch.add("OrderItem", "CREATE", { orderID: orderId });
      batch.add(
        "Payment",
        "CREATE",
        { orderId },
        { dependsOn: [{ entityName: "Order", entityId: orderId }] }
      );
    });
    await ctx.engine.whenIdle();

    expect(orderId).toBe("gen-1");
    expect(ctx.gateway.mutateCalls.map((call) => call.entityName)).toEqual([
      "Order",
      "OrderItem",
      "Payment",
    ]);
    expect(ctx.gateway.mutateCalls[2].input).toMatchObject({ orderId: "gen-1" });
  });

  it("no manda lo de otro usuario con la sesión actual; lo manda cuando vuelve quien lo encoló", async () => {
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1" });
    await ctx.engine.whenIdle();
    expect(ctx.store.all()[0].enqueuedBy).toBe("asesor-1");

    ctx.setOnline(false);
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p2" });
    ctx.setUser("asesor-2");
    ctx.setOnline(true);
    await ctx.run();

    expect(ctx.gateway.mutateCalls.map((call) => call.input.id)).toEqual(["p1"]);
    expect(ctx.store.all()[1]).toMatchObject({ status: "PENDING", attempts: 0 });

    ctx.setUser("asesor-1");
    ctx.engine.start();
    await ctx.emitSignIn();
    ctx.engine.stop();
    expect(ctx.store.all()[1].status).toBe("DONE");
  });

  it("sin sesión no intenta mandar ni gasta reintentos", async () => {
    ctx.setUser(null);
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1" });
    await ctx.run();

    expect(ctx.gateway.mutateCalls).toHaveLength(0);
    expect(ctx.store.all()[0]).toMatchObject({
      status: "PENDING",
      attempts: 0,
      transientFailures: 0,
      enqueuedBy: null,
    });
  });

  it("al volver la red manda de inmediato, sin esperar el backoff acumulado", async () => {
    ctx.gateway.mutateBehaviors.push(
      { throw: NETWORK_ERROR },
      { throw: NETWORK_ERROR },
      { throw: NETWORK_ERROR }
    );
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1" });
    await ctx.engine.whenIdle();
    for (let i = 0; i < 2; i++) {
      ctx.advance(120_000);
      await ctx.run();
    }

    // La espera acumulada todavía no vence, pero vuelve la red.
    ctx.engine.start();
    await ctx.engine.whenIdle();
    expect(ctx.store.all()[0].status).toBe("FAILED");
    await ctx.emitOnline();
    ctx.engine.stop();

    expect(ctx.store.all()[0].status).toBe("DONE");
  });

  it("retryNow adelanta lo que espera reintento, pero no lo bloqueado", async () => {
    ctx.gateway.mutateBehaviors.push({ throw: NETWORK_ERROR }, { throw: VALIDATION_ERROR });
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1" });
    await ctx.engine.whenIdle();
    await ctx.engine.enqueue("Order", "CREATE", { id: "o1" });
    await ctx.engine.whenIdle();
    expect(ctx.store.all().map((entry) => entry.status)).toEqual(["FAILED", "BLOCKED"]);

    // Sin avanzar el reloj: el backoff todavía no vence, pero lo pidió una persona.
    await ctx.engine.syncNow();
    expect(ctx.store.all()[0].status).toBe("FAILED");
    await ctx.engine.retryNow();

    expect(ctx.store.all().map((entry) => entry.status)).toEqual(["DONE", "BLOCKED"]);
  });

  it("si el reloj del equipo se atrasa, lo que falló no se congela", async () => {
    ctx.gateway.mutateBehaviors.push({ throw: NETWORK_ERROR });
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1" });
    await ctx.engine.whenIdle();
    expect(ctx.store.all()[0].status).toBe("FAILED");

    ctx.advance(-3 * 24 * 60 * 60_000);
    await ctx.run();

    expect(ctx.store.all()[0].status).toBe("DONE");
  });

  // ─── Segunda vuelta: confirmar un CREATE por sus datos, no solo por el id ─

  it("un CREATE sobre un id que ya existe con otros datos se bloquea, no se confirma", async () => {
    ctx.gateway.remote.set("Payment#p1", { id: "p1", amount: 100, _version: 3 });
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 150 });
    await ctx.engine.whenIdle();

    expect(ctx.store.all()[0]).toMatchObject({
      status: "BLOCKED",
      lastErrorKind: "divergent",
      payload: { id: "p1", amount: 150 },
    });
    expect(ctx.store.all()[0].lastError).toContain("amount");
  });

  it("si el servidor fusiona en silencio un id repetido, también se bloquea", async () => {
    ctx.gateway.mergeOnDuplicateCreate = true;
    ctx.gateway.remote.set("Payment#p1", { id: "p1", amount: 100, _version: 3 });
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 150 });
    await ctx.engine.whenIdle();

    expect(ctx.store.all()[0]).toMatchObject({ status: "BLOCKED", lastErrorKind: "divergent" });
  });

  it("si se escribió pero falló un campo anidado de la respuesta, se confirma leyéndolo", async () => {
    ctx.gateway.mutateBehaviors.push({ writeThenThrow: NESTED_PERMISSION_ERROR });
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 100 });
    await ctx.engine.whenIdle();

    expect(ctx.store.all()[0].status).toBe("DONE");
  });

  it("un conflicto de versión en un CREATE que sí quedó guardado se confirma", async () => {
    ctx.gateway.mutateBehaviors.push({ writeThenThrow: CONFLICT_ERROR });
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 100 });
    await ctx.engine.whenIdle();

    expect(ctx.store.all()[0].status).toBe("DONE");
  });

  it("lo de otro usuario se puede mandar con la sesión actual, si alguien lo decide", async () => {
    ctx.setOnline(false);
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1" });
    ctx.setUser("asesor-2");
    ctx.setOnline(true);
    await ctx.run();
    expect(ctx.gateway.mutateCalls).toHaveLength(0);

    await expect(ctx.engine.adoptEntries()).resolves.toBe(1);
    await ctx.engine.whenIdle();

    expect(ctx.store.all()[0]).toMatchObject({ status: "DONE", enqueuedBy: "asesor-2" });
  });

  it("no deja adoptar entradas sin sesión", async () => {
    ctx.setUser(null);
    await expect(ctx.engine.adoptEntries()).rejects.toBeInstanceOf(ValidationError);
  });

  // ─── API sin versión ni cuerpo de respuesta (REST común) ───────────────────

  describe("entidad sin control de versión", () => {
    beforeEach(() => {
      ctx.gateway.versioned = false;
    });

    it("un UPDATE va directo, sin leer antes ni mandar versión", async () => {
      ctx.gateway.remote.set("Payment#p1", { id: "p1", amount: 1 });
      await ctx.engine.enqueue("Payment", "UPDATE", { id: "p1", amount: 2 });
      await ctx.engine.whenIdle();

      expect(ctx.gateway.fetchCalls).toHaveLength(0);
      expect(ctx.gateway.mutateCalls[0].input).toEqual({ id: "p1", amount: 2 });
      expect(ctx.store.all()[0].status).toBe("DONE");
    });

    it("un UPDATE de algo que no existe (404) se bloquea", async () => {
      await ctx.engine.enqueue("Payment", "UPDATE", { id: "nope", amount: 2 });
      await ctx.engine.whenIdle();
      expect(ctx.store.all()[0]).toMatchObject({ status: "BLOCKED", lastErrorKind: "notFound" });
    });

    it("un DELETE que recibe 404 se da por cumplido", async () => {
      await ctx.engine.enqueue("Payment", "DELETE", { id: "gone" });
      await ctx.engine.whenIdle();
      expect(ctx.gateway.mutateCalls).toHaveLength(1);
      expect(ctx.store.all()[0].status).toBe("DONE");
    });

    it("un choque de versión en UPDATE es conflicto y se reintenta, no 'ya existe'", async () => {
      ctx.gateway.remote.set("Payment#p1", { id: "p1", amount: 1 });
      ctx.gateway.mutateBehaviors.push({ throw: CONFLICT_ERROR });
      await ctx.engine.enqueue("Payment", "UPDATE", { id: "p1", amount: 2 });
      await ctx.engine.whenIdle();
      expect(ctx.store.all()[0]).toMatchObject({ status: "FAILED", lastErrorKind: "conflict" });
    });
  });

  describe("API que responde 204 sin cuerpo", () => {
    beforeEach(() => {
      ctx.gateway.emptyResponses = true;
    });

    it("un CREATE sin cuerpo se confirma leyendo el registro", async () => {
      await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 100 });
      await ctx.engine.whenIdle();
      expect(ctx.gateway.fetchCalls).toEqual(["p1"]);
      expect(ctx.store.all()[0].status).toBe("DONE");
    });

    it("un UPDATE sin cuerpo se confirma con la respuesta 2xx", async () => {
      ctx.gateway.remote.set("Payment#p1", { id: "p1", amount: 1, _version: 1 });
      await ctx.engine.enqueue("Payment", "UPDATE", { id: "p1", amount: 2 });
      await ctx.engine.whenIdle();
      expect(ctx.store.all()[0].status).toBe("DONE");
    });
  });
});
