import { combineReducers } from "@reduxjs/toolkit";
import { createReducer } from "async-selector-kit";

import exampleTasksReducer from "@/features/_example/exampleTasksSlice";
import loadingReducer from "./loadingSlice";

/**
 * Reducers del store. Cada feature agrega aquí su slice:
 *
 *   orders: ordersReducer,   // de "@/features/orders/ordersSlice"
 */
export const reducers = combineReducers({
  /** Estado de carga de todos los thunks. Ver `loadingSlice.ts`. */
  loading: loadingReducer,
  /** Caché de `components/form/AsyncSelect`. Bórralo si no usas ese componente. */
  AsyncSelector: createReducer(),
  /** Feature de ejemplo: bórralo junto con `features/_example`. */
  exampleTasks: exampleTasksReducer,
});

export type RootState = ReturnType<typeof reducers>;
