import { defineEntity, type SyncEntityRegistry } from "./entities";

/**
 * ─── Entidades que este proyecto sincroniza con el outbox ───────────────────
 *
 * Vacío = el outbox está apagado (no se abre IndexedDB ni corre el motor).
 * Para usarlo, agrega una línea por modelo:
 *
 *   Order: defineEntity<CreateOrderDto, UpdateOrderDto>({
 *     endpoint: "/api/orders",
 *     versionField: "version",           // opcional: concurrencia optimista
 *     local: { indexes: ["customerId"] }, // opcional: tabla local para leer sin red
 *   }),
 *
 * Y súbele `SYNC_SCHEMA_VERSION` cada vez que agregues o quites una tabla local
 * en una app que ya está en producción.
 *
 * Si el proyecto no necesita trabajar sin conexión, borra `core/sync`,
 * `<OutboxBootstrap />` y `dexie` (ver AGENTS.md).
 */
export const SYNC_ENTITIES = {
  // Order: defineEntity<CreateOrderDto, UpdateOrderDto>({ endpoint: "/api/orders" }),
} satisfies SyncEntityRegistry;

export const SYNC_SCHEMA_VERSION = 1;

/** Nombre de la base de IndexedDB de la app. Ninguna limpieza local debe borrarla. */
export const SYNC_DATABASE_NAME = "app_sync";

// Se reexporta para que agregar una entidad no requiera tocar imports.
export { defineEntity };
