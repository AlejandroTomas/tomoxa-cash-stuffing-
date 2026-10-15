import Dexie, { type EntityTable } from "dexie";

import { localEntities, localTableName, type SyncEntityRegistry } from "./entities";
import { LocalStore } from "./local-store";
import { emptySummary, type OutboxStore } from "./outbox-store";
import type { EnqueuePlan } from "./queue-rules";
import type {
  NewOutboxEntry,
  OutboxEntry,
  OutboxEntryPatch,
  OutboxStatus,
  OutboxSummary,
  RemoteRecord,
  SyncErrorKind,
} from "./types";

/** Base de la cola en IndexedDB. Una por nombre: la outbox y las tablas locales la comparten. */
export interface SyncDatabaseOptions {
  name: string;
  registry: SyncEntityRegistry;
  /**
   * Versión del esquema de IndexedDB. Súbela cada vez que agregues o quites una
   * entidad con `local` (o cambies sus índices) en una app ya desplegada.
   */
  schemaVersion: number;
}

function schema(registry: SyncEntityRegistry): Record<string, string> {
  const stores: Record<string, string> = {
    outbox: "++seq, status, [entityName+entityId], entityName, syncedAt",
    syncState: "key",
  };
  for (const { entityName, indexes } of localEntities(registry)) {
    stores[localTableName(entityName)] = ["id", ...indexes].join(", ");
  }
  return stores;
}

export class SyncDatabase extends Dexie {
  outbox!: EntityTable<OutboxEntry, "seq">;

  constructor({ name, registry, schemaVersion }: SyncDatabaseOptions) {
    super(name);
    this.version(schemaVersion).stores(schema(registry));
  }
}

const databases = new Map<string, SyncDatabase>();

/** La conexión a una base de sincronización (una por nombre, se abre al primer uso). */
export function openSyncDatabase(options: SyncDatabaseOptions): SyncDatabase {
  let database = databases.get(options.name);
  if (!database) {
    database = new SyncDatabase(options);
    databases.set(options.name, database);
  }
  return database;
}

export class DexieOutboxStore implements OutboxStore {
  constructor(private readonly options: SyncDatabaseOptions) {}

  /** Se abre al primer uso: importar el módulo en el servidor (SSR) no toca IndexedDB. */
  private get db(): SyncDatabase {
    return openSyncDatabase(this.options);
  }

  async enqueue(
    entries: NewOutboxEntry[],
    plan: (entry: NewOutboxEntry, entityEntries: OutboxEntry[]) => EnqueuePlan
  ): Promise<OutboxEntry[]> {
    const { db } = this;
    const local = new LocalStore(this.options);
    const tableNames = new Set(
      entries.map((entry) => localTableName(entry.entityName))
    );
    const tables = db.tables.filter((table) => tableNames.has(table.name));

    return await db.transaction("rw", [db.outbox, ...tables], async () => {
      const saved: OutboxEntry[] = [];

      for (const entry of entries) {
        const entityEntries = (
          await db.outbox
            .where("[entityName+entityId]")
            .equals([entry.entityName, entry.entityId])
            .toArray()
        )
          .filter((existing) => existing.status !== "DONE")
          .sort((a, b) => a.seq - b.seq);

        const decision = plan(entry, entityEntries);
        if (
          tables.some(
            (table) => table.name === localTableName(entry.entityName)
          )
        ) {
          await local.applyLocal(
            entry.entityName,
            entry.entityId,
            entry.operation,
            entry.payload
          );
        }

        if (decision.kind === "merge") {
          await db.outbox.update(decision.seq, {
            operation: decision.operation,
            payload: decision.payload,
            updatedAt: entry.updatedAt,
          });
          const merged = await db.outbox.get(decision.seq);
          if (merged) {
            saved.push(merged);
            continue;
          }
        }

        // `seq` lo asigna Dexie (++seq).
        const seq = await db.outbox.add(entry);
        saved.push({ ...entry, seq });
      }

      return saved;
    });
  }

  async claim(seq: number, now: number): Promise<OutboxEntry | null> {
    const { db } = this;

    return await db.transaction("rw", db.outbox, async () => {
      const current = await db.outbox.get(seq);

      if (
        !current ||
        (current.status !== "PENDING" && current.status !== "FAILED")
      ) {
        return null;
      }

      const claimed: OutboxEntry = {
        ...current,
        status: "SYNCING",
        sendCount: current.sendCount + 1,
        updatedAt: now,
      };
      await db.outbox.put(claimed);
      return claimed;
    });
  }

  async listByEntity(entityName: string): Promise<OutboxEntry[]> {
    const entries = await this.db.outbox
      .where("entityName")
      .equals(entityName)
      .toArray();
    return entries.sort((a, b) => a.seq - b.seq);
  }

  async listOutstanding(): Promise<OutboxEntry[]> {
    const entries = await this.db.outbox
      .where("status")
      .notEqual("DONE")
      .toArray();
    return entries.sort((a, b) => a.seq - b.seq);
  }

  async update(seq: number, patch: OutboxEntryPatch): Promise<void> {
    await this.db.outbox.update(seq, patch);
  }

  /** Aplica la confirmación remota y DONE juntos, respetando operaciones posteriores. */
  async confirm(
    entry: OutboxEntry,
    patch: OutboxEntryPatch,
    remote: RemoteRecord | null
  ): Promise<void> {
    const tableName = localTableName(entry.entityName);
    const hasLocalTable = this.db.tables.some(
      (table) => table.name === tableName
    );
    if (!hasLocalTable) {
      await this.update(entry.seq, patch);
      return;
    }
    await this.db.transaction(
      "rw",
      this.db.outbox,
      this.db.table(tableName),
      async () => {
        const [current] = await new LocalStore(this.options).listByIds(
          entry.entityName,
          [entry.entityId]
        );
        const record = remote ?? {
          ...current,
          id: entry.entityId,
          _deleted: true,
        };
        // Excluye esta operación de los campos pendientes; si falla aplicar la
        // respuesta, la transacción revierte también este DONE.
        await this.db.outbox.update(entry.seq, patch);
        await new LocalStore(this.options).applyRemote(entry.entityName, [record]);
      }
    );
  }

  async resetInFlight(now: number): Promise<number> {
    return await this.db.outbox
      .where("status")
      .equals("SYNCING")
      .modify({ status: "PENDING", nextAttemptAt: now, updatedAt: now });
  }

  async expediteRetries(now: number, kinds: SyncErrorKind[]): Promise<number> {
    return await this.db.outbox
      .where("status")
      .equals("FAILED")
      .and(
        (entry) =>
          entry.lastErrorKind !== undefined &&
          kinds.includes(entry.lastErrorKind)
      )
      .modify({ nextAttemptAt: now });
  }

  async releaseBlocked(now: number, seq?: number): Promise<number> {
    const collection =
      seq === undefined
        ? this.db.outbox.where("status").equals("BLOCKED")
        : this.db.outbox
            .where("seq")
            .equals(seq)
            .and((entry) => entry.status === "BLOCKED");

    return await collection.modify({
      status: "PENDING",
      attempts: 0,
      transientFailures: 0,
      nextAttemptAt: now,
      updatedAt: now,
    });
  }

  async reassignEnqueuedBy(
    enqueuedBy: string,
    now: number,
    seq?: number
  ): Promise<number> {
    return await this.db.outbox
      .where("status")
      .notEqual("DONE")
      .and(
        (entry) =>
          (seq === undefined || entry.seq === seq) &&
          entry.enqueuedBy != null &&
          entry.enqueuedBy !== enqueuedBy
      )
      .modify({ enqueuedBy, updatedAt: now });
  }

  async purgeConfirmed(confirmedBefore: number): Promise<number> {
    return await this.db.outbox
      .where("syncedAt")
      .below(confirmedBefore)
      .and((entry) => entry.status === "DONE")
      .delete();
  }

  async summary(): Promise<OutboxSummary> {
    const result = emptySummary();
    const statuses = Object.keys(result) as OutboxStatus[];

    await Promise.all(
      statuses.map(async (status) => {
        result[status] = await this.db.outbox
          .where("status")
          .equals(status)
          .count();
      })
    );

    return result;
  }
}
