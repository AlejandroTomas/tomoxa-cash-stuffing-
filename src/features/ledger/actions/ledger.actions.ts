import { createAsyncThunkWithErrorHandling } from "@/store/utils/createAsyncThunkWithErrorHandling";
import type { Envelope, LedgerSettings, Movement } from "../domain/types";
import type { MovementDraft } from "../domain/validation";
import type { LedgerData } from "../repositories/ledger.repository";
import { ledgerService } from "../services/ledger.service";

/**
 * actions/: thunks delgados, uno por método del servicio. Privados: otros
 * módulos los importan desde `ledgerSlice`, que los reexporta.
 */
export const loadLedger = createAsyncThunkWithErrorHandling<LedgerData>("ledger/load", () => ledgerService.load());

export const recordMovement = createAsyncThunkWithErrorHandling<Movement, MovementDraft>("ledger/record", (draft) => ledgerService.record(draft));

export const cancelMovement = createAsyncThunkWithErrorHandling<Movement, { movementId: string; date: string }>("ledger/cancel", ({ movementId, date }) =>
  ledgerService.cancel(movementId, date),
);

export const saveEnvelope = createAsyncThunkWithErrorHandling<Envelope, Envelope>("ledger/saveEnvelope", (envelope) => ledgerService.saveEnvelope(envelope));

export const archiveEnvelope = createAsyncThunkWithErrorHandling<Envelope, string>("ledger/archiveEnvelope", (envelopeId) =>
  ledgerService.archiveEnvelope(envelopeId),
);

export const saveLedgerSettings = createAsyncThunkWithErrorHandling<LedgerSettings, LedgerSettings>("ledger/saveSettings", (settings) =>
  ledgerService.saveSettings(settings),
);
