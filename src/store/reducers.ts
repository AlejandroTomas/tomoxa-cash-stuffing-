import { combineReducers } from "@reduxjs/toolkit";

import ledgerReducer from "@/features/ledger/ledgerSlice";
import loadingReducer from "./loadingSlice";

/**
 * Reducers del store. Cada feature agrega aquí su slice:
 *
 *   orders: ordersReducer,   // de "@/features/orders/ordersSlice"
 */
export const reducers = combineReducers({
  /** Estado de carga de todos los thunks. Ver `loadingSlice.ts`. */
  loading: loadingReducer,
  /** Libro de movimientos (organizador de sobres). */
  ledger: ledgerReducer,
});

export type RootState = ReturnType<typeof reducers>;
