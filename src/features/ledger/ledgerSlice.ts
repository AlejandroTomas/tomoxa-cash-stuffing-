import { createSlice } from "@reduxjs/toolkit";

import { archiveEnvelope, cancelMovement, exportLedger, importLedger, loadLedger, startLedger, recordMovement, saveCardSettings, saveEnvelope, saveLedgerSettings } from "./actions/ledger.actions";
import { DEFAULT_SETTINGS } from "./domain/seed";
import type { Account, Envelope, LedgerSettings, Movement } from "./domain/types";
import type { LedgerData } from "./repositories/ledger.repository";

/**
 * El libro en memoria (copia de lo guardado en el dispositivo). Solo datos:
 * los saldos se derivan en `selector.ts`; carga y errores viven en loadingSlice.
 */
interface LedgerState {
  loaded: boolean;
  /** Primera vez en este dispositivo: falta elegir cómo empezar (de cero o con el ejemplo). */
  needsStart: boolean;
  accounts: Account[];
  envelopes: Envelope[];
  movements: Movement[];
  settings: LedgerSettings;
}

const initialState: LedgerState = { loaded: false, needsStart: false, accounts: [], envelopes: [], movements: [], settings: DEFAULT_SETTINGS };

const upsert = (items: Envelope[], envelope: Envelope) =>
  items.some((item) => item.id === envelope.id) ? items.map((item) => (item.id === envelope.id ? envelope : item)) : [...items, envelope];

function replace(state: LedgerState, payload: LedgerData) {
  state.loaded = true;
  state.needsStart = false;
  state.accounts = payload.accounts;
  state.envelopes = payload.envelopes;
  state.movements = payload.movements;
  state.settings = payload.settings ?? DEFAULT_SETTINGS;
}

const ledgerSlice = createSlice({
  name: "ledger",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadLedger.fulfilled, (state, { payload }) => {
        if (payload) replace(state, payload);
        else if (!state.loaded) state.needsStart = true;
      })
      .addCase(importLedger.fulfilled, (state, { payload }) => replace(state, payload))
      .addCase(startLedger.fulfilled, (state, { payload }) => replace(state, payload))
      .addCase(recordMovement.fulfilled, (state, { payload }) => {
        state.movements.push(payload);
      })
      .addCase(cancelMovement.fulfilled, (state, { payload }) => {
        state.movements.push(payload);
      })
      .addCase(saveEnvelope.fulfilled, (state, { payload }) => {
        state.envelopes = upsert(state.envelopes, payload);
      })
      .addCase(archiveEnvelope.fulfilled, (state, { payload }) => {
        state.envelopes = upsert(state.envelopes, payload);
      })
      .addCase(saveLedgerSettings.fulfilled, (state, { payload }) => {
        state.settings = payload;
      })
      .addCase(saveCardSettings.fulfilled, (state, { payload }) => {
        state.accounts = state.accounts.map((account) => (account.id === payload.id ? payload : account));
      });
  },
});

export default ledgerSlice.reducer;

// Los thunks se reexportan desde el slice: es la API pública del feature.
export { archiveEnvelope, cancelMovement, exportLedger, importLedger, loadLedger, startLedger, recordMovement, saveCardSettings, saveEnvelope, saveLedgerSettings };
