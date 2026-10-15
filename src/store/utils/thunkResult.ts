import { DEFAULT_ERROR_MESSAGE, type FieldErrors } from "@/core/errors";
import type { ThunkRejection } from "./createAsyncThunkWithErrorHandling";

/**
 * Leer cómo terminó un thunk desde quien lo despachó.
 *
 * ```ts
 * try {
 *   await dispatch(createOrder(input)).unwrap();
 *   router.push("/orders");
 * } catch (error) {
 *   setErrors(rejectionFieldErrors(error));   // errores por campo del formulario
 * }
 * ```
 *
 * El mensaje general ya lo muestra el middleware de rechazos; aquí solo se
 * decide qué más hace la pantalla.
 */
const isRejection = (value: unknown): value is ThunkRejection =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { message?: unknown }).message === "string";

/** Mensaje seguro de un rechazo (payload de `rejectWithValue` o lo que relanza `unwrap()`). */
export function rejectionMessage(rejection: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  // Solo se confía en un payload con `timestamp`: el que arma el wrapper. Un
  // `SerializedError` (thunk que lanzó sin pasar por él) puede traer texto técnico.
  if (isRejection(rejection) && "timestamp" in rejection && rejection.message.trim()) {
    return rejection.message;
  }
  return fallback;
}

/** Errores por campo de un rechazo por `ValidationError`, o `{}`. */
export function rejectionFieldErrors(rejection: unknown): FieldErrors {
  return isRejection(rejection) && rejection.fieldErrors ? rejection.fieldErrors : {};
}
