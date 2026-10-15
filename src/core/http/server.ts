import "server-only";
import type { z } from "zod";

import {
  AppError,
  DEFAULT_ERROR_MESSAGE,
  ValidationError,
  type FieldErrors,
} from "@/core/errors";
import { reportError } from "@/core/logger";
import type { ApiFailure, ApiResult, ApiSuccess } from "./api-result";

/**
 * Helpers para Route Handlers (`app/api/** /route.ts`). Todas las respuestas
 * salen como `ApiResult<T>`, que es lo que `core/http/client` sabe leer.
 *
 * ```ts
 * export const POST = route("orders.create", async (request) => {
 *   const input = await parseJson(request, createOrderSchema);
 *   const order = await orderService.create(input);
 *   return ok(order, { status: 201 });
 * });
 * ```
 */

export function ok<T>(
  data: T,
  { status = 200, message }: { status?: number; message?: string } = {},
): Response {
  const body: ApiSuccess<T> = { ok: true, data, ...(message ? { message } : {}) };
  return Response.json(body, { status });
}

/**
 * Convierte cualquier error en una respuesta segura. Un `AppError` responde con
 * su status y su mensaje; cualquier otro error responde 500 con un mensaje
 * genérico y su detalle solo va a `reportError` (logs del servidor).
 */
export function fail(error: unknown, context = "api"): Response {
  if (error instanceof AppError) {
    const body: ApiFailure = {
      ok: false,
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error instanceof ValidationError && error.fieldErrors
        ? { fieldErrors: error.fieldErrors }
        : {}),
    };
    if (error.status >= 500) reportError(error, { context });
    return Response.json(body, { status: error.status });
  }

  reportError(error, { context });
  const body: ApiFailure = { ok: false, message: DEFAULT_ERROR_MESSAGE };
  return Response.json(body, { status: 500 });
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Envuelve un handler: cualquier excepción sale como `fail(...)`. */
export function route<C = unknown>(context: string, handler: Handler<C>): Handler<C> {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (error) {
      return fail(error, context);
    }
  };
}

/** Lee el JSON del body y lo valida con Zod. Lanza `ValidationError` con los errores por campo. */
export async function parseJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("El cuerpo de la solicitud no es JSON válido.");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      fieldErrors[key] ??= issue.message;
    }
    throw new ValidationError(undefined, { fieldErrors });
  }
  return parsed.data;
}

export type { ApiResult };
