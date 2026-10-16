import { createAsyncThunkWithErrorHandling } from "@/store/utils/createAsyncThunkWithErrorHandling";
import type { LedgerBackup } from "../domain/backup";
import type { StartMode } from "../domain/seed";
import type { Account, CardSettings, Envelope, LedgerSettings, Movement } from "../domain/types";
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

export const cancelMovement = createAsyncThunkWithErrorHandling<Movement, { movementId: string; date: string }>("ledger/cancel", ({ movementId, date }) =>
  ledgerService.cancel(movementId, date),
);

export const saveEnvelope = createAsyncThunkWithErrorHandling<Envelope, Envelope>("ledger/saveEnvelope", (envelope) => ledgerService.saveEnvelope(envelope));

export const archiveEnvelope = createAsyncThunkWithErrorHandling<Envelope, string>("ledger/archiveEnvelope", (envelopeId) =>
  ledgerService.archiveEnvelope(envelopeId),
);

export const saveCardSettings = createAsyncThunkWithErrorHandling<Account, { accountId: string; card: Pick<CardSettings, "cutoffDay" | "paymentDays"> }>(
  "ledger/saveCardSettings",
  ({ accountId, card }) => ledgerService.saveCardSettings(accountId, card),
);

export const saveLedgerSettings = createAsyncThunkWithErrorHandling<LedgerSettings, LedgerSettings>("ledger/saveSettings", (settings) =>
  ledgerService.saveSettings(settings),
);
