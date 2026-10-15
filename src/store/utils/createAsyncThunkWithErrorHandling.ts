import { createAsyncThunk, type GetThunkAPI } from "@reduxjs/toolkit";

import { ValidationError, isAppError, type FieldErrors } from "@/core/errors";
import { reportError } from "@/core/logger";
import type { RootState } from "../reducers";

/** Payload uniforme de cualquier thunk rechazado. `message` ya es seguro para el usuario. */
export interface ThunkRejection {
  message: string;
  code?: string;
  fieldErrors?: FieldErrors;
  /** El thunk se creó con `silent: true`: el middleware no muestra nada. */
  silent?: boolean;
  timestamp: string;
}

type ThunkApiConfig = { rejectValue: ThunkRejection; state: RootState };

export interface ThunkOptions {
  /**
   * No mostrar el error automáticamente. Para thunks de fondo (cargas al
   * arrancar, sincronización) o cuando el componente muestra su propio mensaje
   * contextual. El error se sigue reportando a `reportError`.
   */
  silent?: boolean;
}

/**
 * Único constructor de thunks del proyecto. `createAsyncThunk` crudo no se usa.
 *
 * - El thunk llama a UN método de un service, sin lógica propia y sin `try/catch`.
 * - Si el service lanza, aquí se reporta el detalle técnico y se rechaza con un
 *   `ThunkRejection` cuyo `message` es seguro (`AppError.message` o el genérico).
 * - El `typePrefix` es único en TODO el store: `"orders/fetchOrders"`, no `"fetchOrders"`.
 *
 * ```ts
 * export const fetchOrders = createAsyncThunkWithErrorHandling(
 *   "orders/fetchOrders",
 *   async (filters: OrderFilters) => await orderService.list(filters),
 * );
 * ```
 */
export function createAsyncThunkWithErrorHandling<Returned, ThunkArg = void>(
  typePrefix: string,
  payloadCreator: (
    arg: ThunkArg,
    thunkAPI: GetThunkAPI<ThunkApiConfig>,
  ) => Promise<Returned>,
  { silent = false }: ThunkOptions = {},
) {
  return createAsyncThunk<Returned, ThunkArg, ThunkApiConfig>(
    typePrefix,
    async (arg, thunkAPI) => {
      try {
        return await payloadCreator(arg, thunkAPI);
      } catch (error) {
        const message = reportError(error, { context: typePrefix });
        return thunkAPI.rejectWithValue({
          message,
          ...(isAppError(error) && error.code ? { code: error.code } : {}),
          ...(error instanceof ValidationError && error.fieldErrors
            ? { fieldErrors: error.fieldErrors }
            : {}),
          ...(silent ? { silent: true } : {}),
          timestamp: new Date().toISOString(),
        });
      }
    },
  );
}
