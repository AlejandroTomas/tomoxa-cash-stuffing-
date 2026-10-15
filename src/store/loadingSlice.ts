import { createSlice, isFulfilled, isPending, isRejected } from "@reduxjs/toolkit";

/**
 * Estado de carga de TODOS los thunks, en un solo lugar.
 *
 * Un slice de dominio NO guarda `status`/`loading`/`error` propios: la clave
 * aquí es el `typePrefix` completo del thunk (`"orders/fetchOrders"`), que RTK
 * garantiza único en todo el store. Un thunk nuevo queda cubierto solo, sin
 * registrar nada. Se lee con `selectIsLoading(thunk)` de `loadingSelectors.ts`.
 *
 * Escuchar a todos los thunks es correcto aquí porque el propósito de este
 * slice ES ser global. En un slice de dominio, un `addMatcher(isPending)` sin
 * acotar reacciona a thunks de otros módulos y rompe el aislamiento.
 *
 * Limitación: dos ejecuciones simultáneas del mismo thunk con argumentos
 * distintos comparten entrada. Si hace falta estado por instancia (una bandera
 * por fila, por ejemplo), ése sí vive en el slice del dominio.
 */
export enum LoadingStates {
  IDLE = "idle",
  LOADING = "loading",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
}

interface LoadingState {
  byKey: Record<string, LoadingStates>;
}

const initialState: LoadingState = { byKey: {} };

/** `"orders/fetchOrders/pending"` → `"orders/fetchOrders"`. */
const toKey = (actionType: string): string =>
  actionType.replace(/\/(pending|fulfilled|rejected)$/, "");

const loadingSlice = createSlice({
  name: "loading",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addMatcher(isPending, (state, action) => {
        state.byKey[toKey(action.type)] = LoadingStates.LOADING;
      })
      .addMatcher(isFulfilled, (state, action) => {
        state.byKey[toKey(action.type)] = LoadingStates.SUCCEEDED;
      })
      .addMatcher(isRejected, (state, action) => {
        state.byKey[toKey(action.type)] = LoadingStates.FAILED;
      });
  },
});

export default loadingSlice.reducer;
