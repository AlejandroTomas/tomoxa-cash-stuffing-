import Dexie, { type EntityTable } from "dexie";
import type { Account, Envelope, LedgerSettings, Movement } from "../domain/types";

interface MetaRow {
  key: "seededAt" | "settings";
  value: string | LedgerSettings;
}

/**
 * Base del libro en el dispositivo (IndexedDB). Sube `SCHEMA_VERSION` y agrega
 * un `.version(n)` nuevo (con su `upgrade` si hace falta) al cambiar tablas o
 * índices: nunca edites una versión ya publicada.
 */
export class LedgerDatabase extends Dexie {
  accounts!: EntityTable<Account, "id">;
  envelopes!: EntityTable<Envelope, "id">;
  movements!: EntityTable<Movement, "id">;
  meta!: EntityTable<MetaRow, "key">;

  constructor(name = LEDGER_DB_NAME) {
    super(name);
    this.version(1).stores({
      accounts: "id, kind",
      envelopes: "id, order",
      movements: "id, date, createdAt, kind, accountId, toAccountId, envelopeId, toEnvelopeId, reversalOf",
      meta: "key",
    });
  }
}

export const LEDGER_DB_NAME = "aurora-ledger";

let instance: LedgerDatabase | null = null;

/** La conexión de la app (se abre al primer uso). */
export function ledgerDatabase(): LedgerDatabase {
  instance ??= new LedgerDatabase();
  return instance;
}
