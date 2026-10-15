import type { Table } from "dexie";

import { openSyncDatabase, type SyncDatabase, type SyncDatabaseOptions } from "./dexie-outbox-store";
import { localTableName } from "./entities";
import type { OutboxEntry, OutboxOperation, RemoteRecord } from "./types";

/**
 * Datos de la aplicación en el equipo, incluidos los cambios pendientes.
 * La outbox conserva las operaciones de sincronización; las pantallas leen
 * sus datos desde estas tablas. Las respuestas remotas respetan los campos
 * que tienen cambios locales aún sin confirmar.
 */

export type LocalRecord = RemoteRecord;

export interface ApplyRemoteResult {
  saved: number;
  deleted: number;
  /** Llegaron más viejos (`_version` menor) que lo que ya había: no se tocaron. */
  stale: number;
}

/** Hasta dónde va la descarga de un modelo (para traer solo lo que cambió). */
export interface SyncState {
  /** p. ej. `Order#<userId>`. */
  key: string;
  /** Instante (ms) en que arrancó la última descarga que terminó bien. */
  lastSyncAt: number | null;
  /** Cursor o marca que devuelva tu API para la siguiente página de cambios. */
  cursor?: string | null;
}

function withoutTypename(record: RemoteRecord): LocalRecord {
  const { __typename: _typename, ...rest } = record;
  return rest as LocalRecord;
}

/** Campos que no se aceptan del payload local; _deleted se deriva de la operación. */
const SERVER_FIELDS = new Set([
  "__typename",
  "_version",
  "_lastChangedAt",
  "_deleted",
  "createdAt",
  "updatedAt",
]);

function preservePendingFields(
  remote: LocalRecord,
  current: LocalRecord | undefined,
  entries: OutboxEntry[]
): LocalRecord {
  if (!current || entries.length === 0) return remote;
  const fields = new Set<string>();
  for (const entry of entries) {
    for (const [field, value] of Object.entries(entry.payload)) {
      if (field !== "id" && !SERVER_FIELDS.has(field) && value !== undefined)
        fields.add(field);
    }
    if (entry.operation === "CREATE" || entry.operation === "DELETE")
      fields.add("_deleted");
  }
  const record = { ...remote };
  // Los valores salen de la tabla local. La cola solo identifica los campos
  // que siguen pendientes, para no pisarlos al aplicar una respuesta anterior.
  for (const field of fields) {
    if (field in current) record[field] = current[field];
  }
  return record;
}

export class LocalStore {
  constructor(private readonly options: SyncDatabaseOptions) {}

  private get db(): SyncDatabase {
    return openSyncDatabase(this.options);
  }

  private table(entityName: string): Table<LocalRecord, string> {
    return this.db.table(localTableName(entityName));
  }

  /** Se llama junto al encolado, dentro de la misma transacción de Dexie. */
  async applyLocal(
    entityName: string,
    id: string,
    operation: OutboxOperation,
    payload: Record<string, unknown>
  ): Promise<void> {
    const table = this.table(entityName);
    await this.db.transaction("rw", table, async () => {
      const current = await table.get(id);
      const fields = Object.fromEntries(
        Object.entries(payload).filter(
          ([field, value]) => !SERVER_FIELDS.has(field) && value !== undefined
        )
      );
      const record: LocalRecord =
        operation === "DELETE"
          ? { ...current, id, _deleted: true }
          : {
              ...current,
              ...fields,
              id,
              ...(operation === "CREATE" ? { _deleted: false } : {}),
            };
      await table.put(record);
    });
  }

  /**
   * Guarda lo que llegó del servidor. Nunca pisa un registro con uno más viejo
   * (compara `_version`). Los borrados conservan su versión, pero se ocultan
   * en todas las lecturas de la aplicación.
   */
  async applyRemote(
    entityName: string,
    records: RemoteRecord[]
  ): Promise<ApplyRemoteResult> {
    const result: ApplyRemoteResult = { saved: 0, deleted: 0, stale: 0 };
    if (records.length === 0) return result;

    const table = this.table(entityName);

    await this.db.transaction("rw", table, this.db.outbox, async () => {
      const pending = await this.db.outbox
        .where("entityName")
        .equals(entityName)
        .and((entry) => entry.status !== "DONE")
        .toArray();
      const pendingById = new Map<string, OutboxEntry[]>();
      pending.forEach((entry) => {
        const entries = pendingById.get(entry.entityId) ?? [];
        entries.push(entry);
        pendingById.set(entry.entityId, entries);
      });
      const existing = new Map(
        (await table.bulkGet(records.map((record) => record.id)))
          .filter((record): record is LocalRecord => record !== undefined)
          .map((record) => [record.id, record])
      );

      for (const record of records) {
        const current = existing.get(record.id);
        const changes = pendingById.get(record.id) ?? [];
        const hasLocalDeletion = changes.some(
          (entry) => entry.operation === "DELETE"
        );

        if (
          current &&
          ((current._version ?? 0) > (record._version ?? 0) ||
            (current._deleted === true &&
              !hasLocalDeletion &&
              record._deleted !== true &&
              (current._version ?? 0) === (record._version ?? 0)))
        ) {
          result.stale += 1;
          continue;
        }

        const applied = preservePendingFields(
          { ...current, ...withoutTypename(record) },
          current,
          changes
        );
        await table.put(applied);
        existing.set(record.id, applied);
        // Conserva la versión del borrado: ni una descarga atrasada ni el
        // CREATE original de la outbox deben resucitarlo.
        if (applied._deleted === true) {
          if (current && current._deleted !== true) result.deleted += 1;
        } else {
          result.saved += 1;
        }
      }
    });

    return result;
  }

  async get(entityName: string, id: string): Promise<LocalRecord | undefined> {
    const record = await this.table(entityName).get(id);
    return record?._deleted === true ? undefined : record;
  }

  /** Registros por id, incluidas las marcas de borrado para el motor. */
  async listByIds(entityName: string, ids: string[]): Promise<LocalRecord[]> {
    return (await this.table(entityName).bulkGet(ids)).filter(
      (record): record is LocalRecord => record !== undefined
    );
  }

  async listAll(entityName: string): Promise<LocalRecord[]> {
    return await this.table(entityName)
      .filter((record) => record._deleted !== true)
      .toArray();
  }

  /** Registros cuyo `index` vale cualquiera de `values`. */
  async listWhereAnyOf(
    entityName: string,
    index: string,
    values: string[]
  ): Promise<LocalRecord[]> {
    if (values.length === 0) return [];
    return await this.table(entityName)
      .where(index)
      .anyOf(values)
      .and((record) => record._deleted !== true)
      .toArray();
  }

  /** Registros con `index` entre `lower` y `upper`, incluidos los extremos. */
  async listBetween(
    entityName: string,
    index: string,
    lower: string,
    upper: string
  ): Promise<LocalRecord[]> {
    return await this.table(entityName)
      .where(index)
      .between(lower, upper, true, true)
      .and((record) => record._deleted !== true)
      .toArray();
  }

  async count(entityName: string): Promise<number> {
    return await this.table(entityName)
      .filter((record) => record._deleted !== true)
      .count();
  }

  async getSyncState(key: string): Promise<SyncState | undefined> {
    return await this.db.table<SyncState, string>("syncState").get(key);
  }

  async saveSyncState(state: SyncState): Promise<void> {
    await this.db.table<SyncState, string>("syncState").put(state);
  }
}
