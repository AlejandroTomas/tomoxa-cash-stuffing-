import type { Account, Envelope, LedgerSettings, Movement } from "../domain/types";
import { ledgerDatabase, type LedgerDatabase } from "./ledgerDatabase";

/** Todo el libro tal como está guardado. */
export interface LedgerData {
  accounts: Account[];
  envelopes: Envelope[];
  movements: Movement[];
  settings: LedgerSettings | null;
}

/**
 * Acceso al libro en el dispositivo. Solo lectura y escritura: las reglas
 * viven en el servicio. Los movimientos solo se agregan (nunca se editan ni
 * se borran); corregir es agregar una cancelación. `replaceAll` es la única
 * excepción: empezar (de cero o con el ejemplo) o importar un respaldo.
 */
export function createLedgerRepository(database: () => LedgerDatabase = ledgerDatabase) {
  return {
    /** Lee todo (movimientos en orden cronológico de registro). */
    async loadAll(): Promise<LedgerData> {
      const db = database();
      const [accounts, envelopes, movements, settings] = await Promise.all([
        db.accounts.toArray(),
        db.envelopes.orderBy("order").toArray(),
        db.movements.orderBy("createdAt").toArray(),
        db.meta.get("settings"),
      ]);
      return { accounts, envelopes, movements, settings: (settings?.value as LedgerSettings | undefined) ?? null };
    },

    /** ¿Ya se empezó el libro en este dispositivo? (La marca se llama `seededAt` por compatibilidad.) */
    async isStarted(): Promise<boolean> {
      return Boolean(await database().meta.get("seededAt"));
    },

    /** Reemplaza todo el libro (empezar, importar o restablecer). Todo o nada. */
    async replaceAll(data: Omit<LedgerData, "settings"> & { settings: LedgerSettings }, at: string): Promise<void> {
      const db = database();
      await db.transaction("rw", [db.accounts, db.envelopes, db.movements, db.meta], async () => {
        await Promise.all([db.accounts.clear(), db.envelopes.clear(), db.movements.clear(), db.meta.clear()]);
        await db.accounts.bulkPut(data.accounts);
        await db.envelopes.bulkPut(data.envelopes);
        await db.movements.bulkPut(data.movements);
        await db.meta.put({ key: "settings", value: data.settings });
        await db.meta.put({ key: "seededAt", value: at });
      });
    },

    async addMovement(movement: Movement): Promise<void> {
      await database().movements.add(movement);
    },

    async putEnvelope(envelope: Envelope): Promise<void> {
      await database().envelopes.put(envelope);
    },

    async putAccount(account: Account): Promise<void> {
      await database().accounts.put(account);
    },

    async saveSettings(settings: LedgerSettings): Promise<void> {
      await database().meta.put({ key: "settings", value: settings });
    },
  };
}

export type LedgerRepository = ReturnType<typeof createLedgerRepository>;

export const ledgerRepository = createLedgerRepository();
