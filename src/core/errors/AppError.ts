/**
 * Errores tipados de la aplicación.
 *
 * La regla es una sola: **`message` es SIEMPRE seguro para mostrar al usuario**
 * (toast, alerta, texto en pantalla). El detalle técnico va en `debugMessage` o
 * `cause`, que solo viajan a `reportError` y nunca a la interfaz.
 *
 * Cada feature declara sus errores extendiendo estas clases en
 * `src/features/<dominio>/errors/<dominio>-errors.ts`.
 */

export const DEFAULT_ERROR_MESSAGE =
  "Ocurrió un error inesperado. Intenta de nuevo.";

export interface AppErrorOptions {
  /** Error original que causó este, si existe. Nunca se muestra al usuario. */
  cause?: unknown;
  /** Detalle técnico solo para logs. Nunca se muestra al usuario. */
  debugMessage?: string;
  /** Código estable para que el código (no el usuario) distinga el caso. */
  code?: string;
}

export class AppError extends Error {
  readonly debugMessage?: string;
  readonly code?: string;
  /** Status HTTP con el que este error se responde desde un Route Handler. */
  readonly status: number = 400;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.debugMessage = options.debugMessage;
    this.code = options.code;
  }
}

/** Errores por campo: `{ email: "Formato inválido" }`. */
export type FieldErrors = Record<string, string>;

export class ValidationError extends AppError {
  override readonly status = 422;
  readonly fieldErrors?: FieldErrors;

  constructor(
    message = "Revisa los datos capturados.",
    options: AppErrorOptions & { fieldErrors?: FieldErrors } = {},
  ) {
    super(message, options);
    this.fieldErrors = options.fieldErrors;
  }
}

export class UnauthenticatedError extends AppError {
  override readonly status = 401;
  constructor(message = "Tu sesión expiró. Vuelve a iniciar sesión.", options?: AppErrorOptions) {
    super(message, options);
  }
}

export class PermissionDeniedError extends AppError {
  override readonly status = 403;
  constructor(message = "No tienes permiso para realizar esta acción.", options?: AppErrorOptions) {
    super(message, options);
  }
}

export class NotFoundError extends AppError {
  override readonly status = 404;
  constructor(message = "No se encontró lo que buscabas.", options?: AppErrorOptions) {
    super(message, options);
  }
}

export class ConflictError extends AppError {
  override readonly status = 409;
  constructor(message = "El registro cambió o ya existe. Recarga e intenta de nuevo.", options?: AppErrorOptions) {
    super(message, options);
  }
}

/**
 * La petición nunca tuvo respuesta: sin red, servidor caído o timeout.
 * Es distinto de "el servidor dijo que no": reintentar más tarde sí puede servir.
 */
export class NetworkError extends AppError {
  override readonly status = 503;
  constructor(message = "No se pudo conectar. Revisa tu conexión.", options?: AppErrorOptions) {
    super(message, options);
  }
}

/** El servidor respondió con 5xx o 429: falla de su lado, reintentar puede servir. */
export class ServerError extends AppError {
  override readonly status = 500;
  constructor(message = "El servidor tuvo un problema. Intenta de nuevo en un momento.", options?: AppErrorOptions) {
    super(message, options);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Mensaje que SÍ se le puede mostrar al usuario. Solo confía en `AppError`;
 * cualquier otra cosa (un `TypeError`, un string, un error de librería) cae al
 * fallback para no filtrar texto técnico a la pantalla.
 */
export function toSafeMessage(
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
): string {
  if (isAppError(error) && error.message.trim()) return error.message;
  return fallback;
}

/** ¿El fallo trae este status HTTP? Útil para distinguir 404 de 500. */
export function isErrorStatus(error: unknown, status: number): boolean {
  return isAppError(error) && error.status === status;
}
