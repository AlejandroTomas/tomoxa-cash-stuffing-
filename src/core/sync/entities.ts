import type { OutboxOperation } from "./types";

/**
 * Cómo se sincroniza un modelo. Es configuración, no reglas de negocio: si un
 * modelo necesita una regla propia al guardar, va en el service de su feature.
 */
export interface SyncEntityDefinition<TCreate = Record<string, unknown>, TUpdate = Partial<TCreate>> {
  /**
   * Ruta REST del recurso: `"/api/orders"`. El gateway REST usa
   * `POST {endpoint}`, `PATCH|PUT {endpoint}/{id}`, `DELETE {endpoint}/{id}` y
   * `GET {endpoint}/{id}`. **La API debe aceptar el `id` que manda el cliente**:
   * es lo que hace que reenviar no duplique.
   */
  readonly endpoint: string;
  /** Default `PATCH` (solo los campos que cambiaron). */
  readonly updateMethod?: "PATCH" | "PUT";
  /**
   * Campo de versión del servidor (`"version"`, `"_version"`…). Con él se usa
   * concurrencia optimista: antes de un UPDATE/DELETE se lee la versión actual y
   * se manda junto al cambio. Sin él, el UPDATE va directo.
   */
  readonly versionField?: string;
  /** Campo de borrado lógico del servidor, si lo hay (`"deleted"`, `"_deleted"`). */
  readonly deletedField?: string;
  /**
   * Ajusta el payload guardado al cuerpo que espera la API. Por default se manda
   * el payload sin los metadatos del motor (`_version`, `_deleted`).
   */
  readonly toInput?: (payload: Record<string, unknown>, operation: OutboxOperation) => Record<string, unknown>;
  /**
   * Guardar también una copia en una tabla local (lectura sin red). `indexes` son
   * los campos por los que se consulta. Agregar o quitar una tabla local exige
   * subir `schemaVersion` del motor.
   */
  readonly local?: { readonly indexes: readonly string[] };
  /** Solo para inferir tipos. Siempre `undefined` en runtime. */
  readonly inputTypes?: { create: TCreate; update: TUpdate };
}

/**
 * Declara una entidad con sus tipos de entrada:
 *
 * ```ts
 * Order: defineEntity<CreateOrderDto, UpdateOrderDto>({ endpoint: "/api/orders", versionField: "version" }),
 * ```
 */
export function defineEntity<TCreate = Record<string, unknown>, TUpdate = Partial<TCreate>>(
  config: Omit<SyncEntityDefinition<TCreate, TUpdate>, "inputTypes">,
): SyncEntityDefinition<TCreate, TUpdate> {
  return config;
}

export type SyncEntityRegistry = Record<string, SyncEntityDefinition<unknown, unknown>>;

type InputTypesOf<R extends SyncEntityRegistry, N extends keyof R> = NonNullable<R[N]["inputTypes"]>;
export type CreateInputOf<R extends SyncEntityRegistry, N extends keyof R> = InputTypesOf<R, N>["create"];
export type UpdateInputOf<R extends SyncEntityRegistry, N extends keyof R> = InputTypesOf<R, N>["update"] & { id: string };

/** Nombre de la tabla local de un modelo en IndexedDB. */
export const localTableName = (entityName: string) => `local_${entityName}`;

/** Modelos con tabla local. */
export function localEntities(registry: SyncEntityRegistry): Array<{ entityName: string; indexes: readonly string[] }> {
  return Object.entries(registry).flatMap(([entityName, definition]) =>
    definition.local ? [{ entityName, ...definition.local }] : [],
  );
}
