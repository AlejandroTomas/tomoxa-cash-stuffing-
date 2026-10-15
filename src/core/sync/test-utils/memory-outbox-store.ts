import { emptySummary, type OutboxStore } from "../outbox-store";
import type { EnqueuePlan } from "../queue-rules";
import type {
  NewOutboxEntry,
  OutboxEntry,
  OutboxEntryPatch,
  OutboxSummary,
  RemoteRecord,
  SyncErrorKind,
} from "../types";

/** Cola en memoria con la misma semántica que la de Dexie. Solo para tests. */
export class MemoryOutboxStore implements OutboxStore {
  readonly confirmedRecords = new Map<string, RemoteRecord>();
  private rows: OutboxEntry[] = [];
  private nextSeq = 1;

  /**
   * Hace fallar el lote cuando se intente guardar la entrada número `n` (desde 1),
   * para probar que un lote es todo o nada.
   */
  failOnEntry: number | null = null;

  /** Copia de todo lo guardado, incluidas las entradas DONE. */
  all(): OutboxEntry[] {
    return this.rows.map((row) => structuredClone(row));
  }

  async enqueue(
    entries: NewOutboxEntry[],
    plan: (entry: NewOutboxEntry, entityEntries: OutboxEntry[]) => EnqueuePlan
  ): Promise<OutboxEntry[]> {
    // Se trabaja sobre una copia y se confirma al final: igual que una transacción.
    const draft = this.rows.map((row) => structuredClone(row));
    let nextSeq = this.nextSeq;
    const saved: OutboxEntry[] = [];

    entries.forEach((entry, index) => {
      if (this.failOnEntry === index + 1) {
        throw new Error("Falla simulada de IndexedDB");
      }

      const entityEntries = draft
        .filter(
          (row) =>
            row.entityName === entry.entityName &&
            row.entityId === entry.entityId &&
            row.status !== "DONE"
        )
        .sort((x, y) => x.seq - y.seq)
        .map((row) => structuredClone(row));

      const decision = plan(entry, entityEntries);
      const target =
        decision.kind === "merge" ? draft.find((row) => row.seq === decision.seq) : undefined;

      if (decision.kind === "merge" && target) {
        target.operation = decision.operation;
        target.payload = structuredClone(decision.payload);
        target.updatedAt = entry.updatedAt;
        saved.push(structuredClone(target));
        return;
      }

      const row: OutboxEntry = { ...structuredClone(entry), seq: nextSeq++ };
      draft.push(row);
      saved.push(structuredClone(row));
    });

    this.rows = draft;
    this.nextSeq = nextSeq;
    return saved;
  }

  async claim(seq: number, now: number): Promise<OutboxEntry | null> {
    const target = this.rows.find((row) => row.seq === seq);
    if (!target || (target.status !== "PENDING" && target.status !== "FAILED")) {
      return null;
    }
    target.status = "SYNCING";
    target.sendCount += 1;
    target.updatedAt = now;
    return structuredClone(target);
  }

  async expediteRetries(now: number, kinds: SyncErrorKind[]): Promise<number> {
    const due = this.rows.filter(
      (row) =>
        row.status === "FAILED" &&
        row.lastErrorKind !== undefined &&
        kinds.includes(row.lastErrorKind)
    );
    due.forEach((row) => {
      row.nextAttemptAt = now;
    });
    return due.length;
  }

  async listByEntity(entityName: string): Promise<OutboxEntry[]> {
    return this.rows
      .filter((row) => row.entityName === entityName)
      .sort((a, b) => a.seq - b.seq)
      .map((row) => structuredClone(row));
  }

  async listOutstanding(): Promise<OutboxEntry[]> {
    return this.rows
      .filter((row) => row.status !== "DONE")
      .sort((a, b) => a.seq - b.seq)
      .map((row) => structuredClone(row));
  }

  async update(seq: number, patch: OutboxEntryPatch): Promise<void> {
    const target = this.rows.find((row) => row.seq === seq);
    if (!target) return;
    // Igual que Dexie: una clave con `undefined` se elimina del registro.
    Object.entries(patch).forEach(([key, value]) => {
      const record = target as unknown as Record<string, unknown>;
      if (value === undefined) {
        Reflect.deleteProperty(record, key);
      } else {
        record[key] = structuredClone(value);
      }
    });
  }

  async resetInFlight(now: number): Promise<number> {
    const inFlight = this.rows.filter((row) => row.status === "SYNCING");
    inFlight.forEach((row) => {
      row.status = "PENDING";
      row.nextAttemptAt = now;
      row.updatedAt = now;
    });
    return inFlight.length;
  }

  async confirm(entry: OutboxEntry, patch: OutboxEntryPatch, remote: RemoteRecord | null): Promise<void> {
    this.confirmedRecords.set(`${entry.entityName}#${entry.entityId}`, structuredClone(remote ?? { id: entry.entityId, _deleted: true }));
    await this.update(entry.seq, patch);
  }

  async releaseBlocked(now: number, seq?: number): Promise<number> {
    const blocked = this.rows.filter(
      (row) => row.status === "BLOCKED" && (seq === undefined || row.seq === seq)
    );
    blocked.forEach((row) => {
      row.status = "PENDING";
      row.attempts = 0;
      row.transientFailures = 0;
      row.nextAttemptAt = now;
      row.updatedAt = now;
    });
    return blocked.length;
  }

  async reassignEnqueuedBy(enqueuedBy: string, now: number, seq?: number): Promise<number> {
    const targets = this.rows.filter(
      (row) =>
        row.status !== "DONE" &&
        (seq === undefined || row.seq === seq) &&
        row.enqueuedBy != null &&
        row.enqueuedBy !== enqueuedBy
    );
    targets.forEach((row) => {
      row.enqueuedBy = enqueuedBy;
      row.updatedAt = now;
    });
    return targets.length;
  }

  async purgeConfirmed(confirmedBefore: number): Promise<number> {
    const before = this.rows.length;
    this.rows = this.rows.filter(
      (row) => !(row.status === "DONE" && (row.syncedAt ?? Infinity) < confirmedBefore)
    );
    return before - this.rows.length;
  }

  async summary(): Promise<OutboxSummary> {
    const result = emptySummary();
    this.rows.forEach((row) => {
      result[row.status] += 1;
    });
    return result;
  }
}
