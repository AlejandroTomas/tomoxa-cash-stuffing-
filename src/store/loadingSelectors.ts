import { LoadingStates } from "./loadingSlice";
import type { RootState } from "./reducers";

/**
 * Los selectores reciben el THUNK, no un string: así un typo en la clave no es
 * posible y renombrar un `typePrefix` no deja call sites apuntando a la nada.
 *
 * ```ts
 * const isLoading = useAppSelector(selectIsLoading(fetchOrders));
 * const isBusy = useAppSelector(selectIsAnyLoading(createOrder, updateOrder));
 * ```
 *
 * Para saber cómo terminó la operación que ACABAS de despachar, no leas esto:
 * usa el resultado del propio `dispatch` (ver `utils/thunkResult.ts`). Dentro
 * del mismo callback el selector todavía trae el valor del render anterior.
 */
interface ThunkLike {
  typePrefix: string;
}

export const selectLoading =
  (thunk: ThunkLike) =>
  (state: RootState): LoadingStates =>
    state.loading.byKey[thunk.typePrefix] ?? LoadingStates.IDLE;

export const selectIsLoading =
  (thunk: ThunkLike) =>
  (state: RootState): boolean =>
    state.loading.byKey[thunk.typePrefix] === LoadingStates.LOADING;

/** `true` si CUALQUIERA de los thunks está en vuelo. */
export const selectIsAnyLoading =
  (...thunks: ThunkLike[]) =>
  (state: RootState): boolean =>
    thunks.some(
      (thunk) => state.loading.byKey[thunk.typePrefix] === LoadingStates.LOADING,
    );
