import { isAppError, toSafeMessage } from "@/core/errors";

/**
 * Punto único para reportar errores. Sustituye a `console.log(error)` y a los
 * `catch` silenciosos.
 *
 * - Devuelve el mensaje seguro para el usuario (el de un `AppError`, o el fallback).
 * - En desarrollo imprime el detalle en consola.
 * - Reenvía el reporte a cada *sink* registrado (Sentry, IndexedDB, un endpoint
 *   propio…). La plantilla no trae ninguno: se conectan en el arranque del
 *   proyecto con `registerErrorSink`.
 */

export interface ErrorReport {
  /** Módulo o función donde ocurrió, ej. "orders.create". */
  context: string;
  /** Lo que se le mostró (o se le mostraría) al usuario. */
  userMessage: string;
  error: unknown;
  name: string;
  message?: string;
  stack?: string;
  debugMessage?: string;
  code?: string;
  details?: Readonly<Record<string, unknown>>;
  timestamp: string;
}

export type ErrorSink = (report: ErrorReport) => void | Promise<void>;

export interface ReportErrorOptions {
  context?: string;
  /** Mensaje para el usuario si el error no es un `AppError`. */
  fallbackMessage?: string;
  /** Diagnóstico adicional. Nunca se muestra al usuario. */
  details?: Readonly<Record<string, unknown>>;
}

const sinks = new Set<ErrorSink>();

/** Conecta un destino de reportes. Devuelve la función para desconectarlo. */
export function registerErrorSink(sink: ErrorSink): () => void {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
}

const isDev = process.env.NODE_ENV === "development";

export function reportError(
  error: unknown,
  { context = "app", fallbackMessage, details }: ReportErrorOptions = {},
): string {
  const userMessage = toSafeMessage(error, fallbackMessage);

  if (isDev) {
    // Un AppError es un caso esperado y ya manejado: warn. Cualquier otro error
    // es un bug: error, que además lo resalta el overlay de desarrollo de Next.
    const log = isAppError(error) ? console.warn : console.error;
    log(`[${context}]`, error, details ?? "");
  }

  const report: ErrorReport = {
    context,
    userMessage,
    error,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    debugMessage: isAppError(error) ? error.debugMessage : undefined,
    code: isAppError(error) ? error.code : undefined,
    details,
    timestamp: new Date().toISOString(),
  };

  for (const sink of sinks) {
    try {
      // Un sink que falla no debe generar otro error mientras se reporta el original.
      void Promise.resolve(sink(report)).catch(() => undefined);
    } catch {
      // idem, para sinks síncronos
    }
  }

  return userMessage;
}
