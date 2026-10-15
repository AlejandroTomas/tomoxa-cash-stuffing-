import { NotFoundError } from "@/core/errors";
import { http, type HttpClient } from "@/core/http";
import type { SyncEntityRegistry } from "./entities";
import { SyncConfigError } from "./errors";
import type { RemoteGateway } from "./gateway";
import type { RemoteRecord } from "./types";

/**
 * Gateway REST sobre `core/http`. Rutas por entidad (ver `SyncEntityDefinition`):
 *
 *   CREATE → POST   {endpoint}           cuerpo con el `id` del cliente
 *   UPDATE → PATCH  {endpoint}/{id}      (o PUT)
 *   DELETE → DELETE {endpoint}/{id}      `?version=` si la entidad tiene versión
 *   fetch  → GET    {endpoint}/{id}      404 = no existe
 *
 * Si tu API usa otras rutas, cambia `endpoint` o escribe otro gateway.
 */
export function createRestGateway(
  registry: SyncEntityRegistry,
  client: HttpClient = http,
): RemoteGateway {
  const definitionOf = (entityName: string) => {
    const definition = registry[entityName];
    if (!definition?.endpoint) {
      throw new SyncConfigError("No se pudo sincronizar el registro.", {
        debugMessage: `La entidad ${entityName} no tiene endpoint en el registro de sincronización`,
      });
    }
    return definition;
  };

  const itemUrl = (endpoint: string, id: string) => `${endpoint.replace(/\/$/, "")}/${encodeURIComponent(id)}`;

  /** Traduce los campos de versión/borrado de la API a `_version`/`_deleted`. */
  const normalize = (entityName: string, body: unknown): RemoteRecord | null => {
    if (body === null || typeof body !== "object") return null;
    const record = body as Record<string, unknown>;
    if (typeof record.id !== "string") return null;
    const { versionField, deletedField } = definitionOf(entityName);
    const version = versionField ? record[versionField] : undefined;
    const deleted = deletedField ? record[deletedField] : undefined;
    return {
      ...record,
      id: record.id,
      ...(typeof version === "number" ? { _version: version } : {}),
      // `deletedAt` con fecha también cuenta como borrado.
      ...(deleted !== undefined ? { _deleted: Boolean(deleted) } : {}),
    };
  };

  /** Pasa `_version` del motor al campo de versión de la API. */
  const toBody = (entityName: string, input: Record<string, unknown>) => {
    const { versionField } = definitionOf(entityName);
    const { _version, _deleted: _ignored, ...rest } = input;
    return versionField && _version !== undefined ? { ...rest, [versionField]: _version } : rest;
  };

  return {
    usesVersioning: (entityName) => Boolean(definitionOf(entityName).versionField),

    async mutate(entityName, operation, input) {
      const { endpoint, updateMethod = "PATCH" } = definitionOf(entityName);
      const id = String(input.id);
      switch (operation) {
        case "CREATE":
          return normalize(entityName, await client.post(endpoint, toBody(entityName, input)));
        case "UPDATE": {
          const body = toBody(entityName, input);
          const response =
            updateMethod === "PUT"
              ? await client.put(itemUrl(endpoint, id), body)
              : await client.patch(itemUrl(endpoint, id), body);
          return normalize(entityName, response);
        }
        case "DELETE": {
          const params = input._version !== undefined ? { version: input._version } : undefined;
          return normalize(entityName, await client.delete(itemUrl(endpoint, id), { params }));
        }
      }
    },

    async fetch(entityName, id) {
      const { endpoint } = definitionOf(entityName);
      try {
        return normalize(entityName, await client.get(itemUrl(endpoint, id)));
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },
  };
}
