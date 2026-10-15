import type { EnqueuePlan } from "./queue-rules";
import type {
  NewOutboxEntry,
  OutboxEntry,
  OutboxEntryPatch,
  OutboxSummary,
  RemoteRecord,
  SyncErrorKind,
} from "./types";

/**
 * Persistencia de la cola. La implementación real es Dexie (`dexie-outbox-store.ts`);
 * los tests usan una en memoria.
 *
 * Contrato que el motor da por hecho: **nada sale de la cola salvo por
 * `purgeConfirmed`, y esa solo toca entradas `DONE`.** No hay método para
 * borrar una entrada pendiente, fallida o bloqueada.
 */
export interface OutboxStore {
  /**
   * Agrega o fusiona cada entrada según `plan`, **todas en una sola
   * transacción**: o quedan guardadas todas, o ninguna. Cada entrada se planea
   * viendo también las del mismo lote que ya se agregaron. Para entidades
   * con tabla local, sus datos se escriben en esa misma transacción.
   */
  enqueue: (
    entries: NewOutboxEntry[],
    plan: (entry: NewOutboxEntry, entityEntries: OutboxEntry[]) => EnqueuePlan
  ) => Promise<OutboxEntry[]>;
  /** Todas las entradas de un modelo, en cualquier estado (incluye `DONE`), por `seq`. */
  listByEntity: (entityName: string) => Promise<OutboxEntry[]>;
  /** Todo lo que no está `DONE`, ordenado por `seq`. */
  listOutstanding: () => Promise<OutboxEntry[]>;
  /**
   * Toma la entrada para enviarla: en una transacción relee su versión actual,
   * comprueba que siga `PENDING` o `FAILED`, y la pasa a `SYNCING`. Devuelve lo
   * que hay en disco (con las ediciones fusionadas mientras esperaba), o `null`
   * si ya no se puede enviar.
   */
  claim: (seq: number, now: number) => Promise<OutboxEntry | null>;
  update: (seq: number, patch: OutboxEntryPatch) => Promise<void>;
  /** Confirma la operación y actualiza sus datos locales en una sola transacción. */
  confirm: (
    entry: OutboxEntry,
    patch: OutboxEntryPatch,
    remote: RemoteRecord | null
  ) => Promise<void>;
  /** Devuelve a `PENDING` lo que quedó en `SYNCING` por un cierre a medio envío. */
  resetInFlight: (now: number) => Promise<number>;
  /** Adelanta a `now` los `FAILED` cuyo último error fue de alguno de estos tipos. */
  expediteRetries: (now: number, kinds: SyncErrorKind[]) => Promise<number>;
  /** Devuelve a la cola lo `BLOCKED` (todo, o solo `seq`), con los intentos en cero. */
  releaseBlocked: (now: number, seq?: number) => Promise<number>;
  /**
   * Pasa a la sesión `enqueuedBy` las entradas sin confirmar que encoló otro
   * usuario (todas, o solo `seq`), para que esta sesión las mande.
   */
  reassignEnqueuedBy: (
    enqueuedBy: string,
    now: number,
    seq?: number
  ) => Promise<number>;
  /** Borra entradas `DONE` confirmadas antes de `confirmedBefore`. Nunca toca otro estado. */
  purgeConfirmed: (confirmedBefore: number) => Promise<number>;
  summary: () => Promise<OutboxSummary>;
}

export function emptySummary(): OutboxSummary {
  return { PENDING: 0, SYNCING: 0, FAILED: 0, BLOCKED: 0, DONE: 0 };
}
