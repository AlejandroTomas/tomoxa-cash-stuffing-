import { createAsyncThunkWithErrorHandling } from "@/store/utils/createAsyncThunkWithErrorHandling";
import type { LedgerBackup } from "../domain/backup";
import type { StartMode } from "../domain/seed";
import type { AccountInput } from "../domain/accounts";
import type { Account, Envelope, LedgerSettings, Movement } from "../domain/types";
import type { MovementDraft } from "../domain/validation";
import type { LedgerData } from "../repositories/ledger.repository";
import { ledgerService } from "../services/ledger.service";

/**
 * actions/: thunks delgados, uno por método del servicio. Privados: otros
 * módulos los importan desde `ledgerSlice`, que los reexporta.
 */
/** `null` = nunca se empezó en este dispositivo (la interfaz pregunta cómo empezar). */
export const loadLedger = createAsyncThunkWithErrorHandling<LedgerData | null>("ledger/load", () => ledgerService.open());

export const exportLedger = createAsyncThunkWithErrorHandling<LedgerBackup>("ledger/export", () => ledgerService.exportBackup());

export const importLedger = createAsyncThunkWithErrorHandling<LedgerData, string>("ledger/import", (text) => ledgerService.importBackup(text));

/** Empieza (o vuelve a empezar) de cero o con los datos de ejemplo. */
export const startLedger = createAsyncThunkWithErrorHandling<LedgerData, StartMode>("ledger/start", (mode) => ledgerService.start(mode));

export const recordMovement = createAsyncThunkWithErrorHandling<Movement, MovementDraft>("ledger/record", (draft) => ledgerService.record(draft));

/** Un gasto pagado con varias formas: todas las partes juntas. */
export const recordSplitExpense = createAsyncThunkWithErrorHandling<Movement[], MovementDraft[]>("ledger/recordSplit", (parts) => ledgerService.recordSplit(parts));

/** Devuelve las cancelaciones (varias si era un pago dividido). */
export const cancelMovement = createAsyncThunkWithErrorHandling<Movement[], { movementId: string; date: string }>("ledger/cancel", ({ movementId, date }) =>
  ledgerService.cancel(movementId, date),
);

export const saveEnvelope = createAsyncThunkWithErrorHandling<Envelope, Envelope>("ledger/saveEnvelope", (envelope) => ledgerService.saveEnvelope(envelope));

export const archiveEnvelope = createAsyncThunkWithErrorHandling<Envelope, string>("ledger/archiveEnvelope", (envelopeId) =>
  ledgerService.archiveEnvelope(envelopeId),
);

export const saveAccount = createAsyncThunkWithErrorHandling<{ account: Account; envelope: Envelope | null }, AccountInput>("ledger/saveAccount", (input) =>
  ledgerService.saveAccount(input),
);

export const archiveAccount = createAsyncThunkWithErrorHandling<{ account: Account; envelope: Envelope | null }, string>("ledger/archiveAccount", (accountId) =>
  ledgerService.archiveAccount(accountId),
);

export const saveLedgerSettings = createAsyncThunkWithErrorHandling<LedgerSettings, LedgerSettings>("ledger/saveSettings", (settings) =>
  ledgerService.saveSettings(settings),
);
