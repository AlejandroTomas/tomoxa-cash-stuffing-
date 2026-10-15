import {
  AppError,
  ConflictError,
  NetworkError,
  NotFoundError,
  PermissionDeniedError,
  ServerError,
  UnauthenticatedError,
  ValidationError,
} from "@/core/errors";
import type { SyncErrorKind } from "./types";

/**
 * Traduce el error de un envío a una decisión del motor. Se basa en el TIPO de
 * error, no en su texto: `core/http` ya convierte cada respuesta en un
 * `AppError` tipado, y un gateway propio (GraphQL, SDK de un tercero) debe
 * lanzar esos mismos tipos.
 *
 * Ante la duda el motor prefiere reintentar a dar algo por hecho: un
 * `ConflictError` en un CREATE es "ya existe, hay que confirmarlo", nunca un éxito.
 */
export interface SyncErrorInfo {
  kind: SyncErrorKind;
  /** Detalle técnico para logs y para el panel de sync. No es para un toast. */
  message: string;
}

const MAX_MESSAGE_LENGTH = 500;

/** `fetch` nativo rechaza con TypeError cuando no hay red. */
const NETWORK_TYPE_ERROR = /failed to fetch|load failed|network ?error|networkerror/i;

function kindOf(error: unknown): SyncErrorKind {
  if (error instanceof NetworkError || error instanceof ServerError) return "transient";
  if (error instanceof UnauthenticatedError) return "unauthenticated";
  if (error instanceof PermissionDeniedError) return "permission";
  if (error instanceof NotFoundError) return "notFound";
  if (error instanceof ConflictError) return "alreadyExists";
  if (error instanceof ValidationError) return "validation";
  if (error instanceof TypeError && NETWORK_TYPE_ERROR.test(error.message)) return "transient";
  return "unknown";
}

function describe(error: unknown): string {
  if (error instanceof AppError) return error.debugMessage ?? error.message;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export function classifySyncError(error: unknown): SyncErrorInfo {
  return { kind: kindOf(error), message: describe(error).slice(0, MAX_MESSAGE_LENGTH) };
}
