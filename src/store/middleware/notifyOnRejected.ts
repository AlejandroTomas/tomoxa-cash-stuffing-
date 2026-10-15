import { isRejected, type Middleware } from "@reduxjs/toolkit";

import type { ThunkRejection } from "../utils/createAsyncThunkWithErrorHandling";

/**
 * Muestra el error de cualquier thunk rechazado, en un solo lugar. Los thunks y
 * los reducers no muestran UI: el error viaja como error hasta aquí.
 *
 * Reglas:
 * - Nunca bloquea el flujo: la acción llega a los reducers antes.
 * - Una cancelación (`abort()`) o un `condition` que devuelve false no es error.
 * - Solo usa `payload.message` del wrapper, que ya es seguro. Si el rechazo no
 *   pasó por el wrapper no muestra nada: prefiere el silencio a filtrar texto
 *   técnico de `action.error.message`.
 * - Un thunk creado con `{ silent: true }` no se muestra.
 */
export interface RejectionNotice {
  /** Título legible del módulo, según `moduleTitles`. */
  title: string;
  message: string;
  /** `typePrefix` del thunk, útil para deduplicar. */
  source: string;
}

export interface NotifyOnRejectedOptions {
  notify: (notice: RejectionNotice) => void;
  /** Prefijo de módulo → título: `{ orders: "Pedidos" }`. */
  moduleTitles?: Record<string, string>;
  defaultTitle?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function createNotifyOnRejected({
  notify,
  moduleTitles = {},
  defaultTitle = "Error",
}: NotifyOnRejectedOptions): Middleware {
  return () => (next) => (action) => {
    const result = next(action);
    if (!isRejected(action)) return result;

    const { meta, payload } = action as { meta?: unknown; payload?: unknown };
    if (isRecord(meta) && (meta.aborted === true || meta.condition === true)) return result;
    if (!isRecord(payload)) return result;

    const rejection = payload as Partial<ThunkRejection>;
    if (rejection.silent) return result;
    const message = typeof rejection.message === "string" ? rejection.message.trim() : "";
    if (!message) return result;

    const source = action.type.replace(/\/rejected$/, "");
    notify({
      title: moduleTitles[source.split("/")[0] ?? ""] ?? defaultTitle,
      message,
      source,
    });
    return result;
  };
}
