import type { FieldErrors } from "@/core/errors";

/**
 * Forma única de las respuestas de la API propia (`app/api/**`). La produce
 * `core/http/server` y la entiende `core/http/client`.
 *
 * `message` en una respuesta fallida es seguro para mostrar al usuario: el
 * servidor solo pone ahí el mensaje de un `AppError` o uno genérico.
 */
export type ApiSuccess<T> = { ok: true; data: T; message?: string };

export type ApiFailure = {
  ok: false;
  message: string;
  code?: string;
  fieldErrors?: FieldErrors;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function isApiResult(body: unknown): body is ApiResult<unknown> {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as { ok?: unknown }).ok === "boolean" &&
    ("data" in body || "message" in body)
  );
}
