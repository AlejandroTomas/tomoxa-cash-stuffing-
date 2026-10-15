import type { OutboxOperation, RemoteRecord } from "./types";

/**
 * Lo único que el motor necesita del servidor. La plantilla trae una
 * implementación REST (`rest-gateway.ts`); para GraphQL, Firebase o un SDK
 * propio se escribe otra con esta misma forma.
 *
 * Reglas para cualquier implementación:
 * - Devolver registros normalizados (`id`, `_version`, `_deleted`; ver `RemoteRecord`).
 * - Fallar con los `AppError` tipados de `core/errors` (`NetworkError`,
 *   `NotFoundError`, `ConflictError`…): el motor decide qué hacer según el tipo.
 */
export interface RemoteGateway {
  /**
   * Ejecuta la operación. Devuelve el registro como quedó en el servidor, o
   * `null` si la API no lo regresa (p. ej. un 204). En UPDATE/DELETE con
   * versión, `input._version` trae la versión leída antes.
   */
  mutate: (entityName: string, operation: OutboxOperation, input: Record<string, unknown>) => Promise<RemoteRecord | null>;
  /** El registro completo, o `null` si no existe. Lanza si no se pudo preguntar. */
  fetch: (entityName: string, id: string) => Promise<RemoteRecord | null>;
  /** ¿La entidad usa concurrencia optimista? Decide si se lee la versión antes de escribir. */
  usesVersioning: (entityName: string) => boolean;
}
