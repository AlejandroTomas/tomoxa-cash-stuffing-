import { SYNC_DATABASE_NAME, SYNC_ENTITIES, SYNC_SCHEMA_VERSION } from "./registry";
import { createSyncRuntime } from "./runtime";

/**
 * Outbox: escrituras que se guardan primero en el equipo (IndexedDB) y se
 * mandan al servidor en segundo plano, en orden, con reintentos, y sin perder
 * nada si se cierra la app o se va la red.
 *
 * **La regla que manda sobre todo: un registro que no llegó al servidor no se
 * borra nunca.** Puede quedarse reintentando o bloqueado esperando atención,
 * pero sigue en la cola hasta que el servidor confirme.
 *
 * Guía completa: `core/sync/README.md`.
 */
const appRuntime = createSyncRuntime({
  databaseName: SYNC_DATABASE_NAME,
  registry: SYNC_ENTITIES,
  schemaVersion: SYNC_SCHEMA_VERSION,
});

/** Operaciones tipadas por entidad. Úsalo solo desde `repositories/`. */
export const outbox = appRuntime.outbox;
/** El motor de la app (uno por pestaña). Para la UI de estado y pruebas. */
export const getOutbox = appRuntime.getEngine;
export const getLocalStore = appRuntime.getLocalStore;
/** Lo llama `<OutboxBootstrap />`. Sin entidades registradas no hace nada. */
export const startOutbox = appRuntime.start;

export { createSyncRuntime, type SyncRuntime, type SyncRuntimeOptions, type TypedOutboxBatch } from "./runtime";
export { createRestGateway } from "./rest-gateway";
export { defineEntity, type SyncEntityDefinition, type SyncEntityRegistry } from "./entities";
export { SYNC_DATABASE_NAME, SYNC_ENTITIES } from "./registry";
export { syncErrorMessage } from "./messages";
export { LocalStore, type ApplyRemoteResult, type LocalRecord, type SyncState } from "./local-store";
export type { RemoteGateway } from "./gateway";
export type { Connectivity, Identity } from "./environment";
export type { OutboxEngine, EnqueueOptions } from "./outbox-engine";
export type {
  OutboxEntry,
  OutboxOperation,
  OutboxRef,
  OutboxStatus,
  OutboxSummary,
  PendingInfo,
  RemoteRecord,
  SyncErrorKind,
  SyncRunResult,
} from "./types";
