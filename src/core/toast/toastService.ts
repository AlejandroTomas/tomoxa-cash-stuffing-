import type { ReactNode } from "react";
import { sileo, type SileoPosition } from "sileo";

import { notchTokens } from "./tokens";

/**
 * Toasts con forma de notch (Sileo parcheado, ver `README.md`). Se montan una
 * vez con `<NotchToaster />` en los providers.
 *
 * Para avisos breves: "Guardado", "Copiado", progreso de una carga. Los errores
 * que el usuario debe leer y cerrar van al stack de alertas (`@/core/alert`).
 *
 * El notch ocupa un solo lugar en el borde: un toast nuevo reemplaza al
 * visible. Con el mismo `id` se actualiza en sitio (útil para progreso).
 */

export type ToastStatus = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  id?: string;
  /** Si falta, se usa uno corto según `status` ("Éxito", "Error"…). */
  title?: string;
  /** Contenido propio para el encabezado; `title` queda como texto alternativo. */
  header?: ReactNode;
  description: string;
  status?: ToastStatus;
  /** Milisegundos. `null` = no se cierra solo. */
  duration?: number | null;
  /** Alias `top`/`bottom` = centrado. */
  position?: SileoPosition | "top" | "bottom";
  /** Botón propio. Sin él, el toast muestra "Cerrar". */
  action?: { label: string; onClick: () => void };
}

export const notchToastOptions = {
  fill: notchTokens.colors.surface,
  roundness: notchTokens.layout.freeCornerRadius,
  duration: 3000,
  autopilot: false,
};

const DEFAULT_TITLES: Record<ToastStatus, string> = {
  info: "Información",
  success: "Éxito",
  warning: "Advertencia",
  error: "Error",
};

const DEFAULT_ID = "notch-toast";

const toPosition = (position: ToastOptions["position"]): SileoPosition =>
  position === "top" ? "top-center" : position === "bottom" ? "bottom-center" : (position ?? "top-center");

export function showToast({
  id = DEFAULT_ID,
  title,
  header,
  description,
  status = "info",
  duration = notchToastOptions.duration,
  position,
  action,
}: ToastOptions): string {
  return sileo[status]({
    ...notchToastOptions,
    id,
    title: title?.trim() || DEFAULT_TITLES[status],
    header,
    description,
    duration,
    position: toPosition(position),
    button: action
      ? { title: action.label, onClick: action.onClick }
      : { title: "Cerrar", onClick: () => sileo.dismiss(id) },
  });
}

export const toast = {
  success: (description: string, options?: Partial<ToastOptions>) =>
    showToast({ ...options, description, status: "success" }),
  error: (description: string, options?: Partial<ToastOptions>) =>
    showToast({ ...options, description, status: "error" }),
  warning: (description: string, options?: Partial<ToastOptions>) =>
    showToast({ ...options, description, status: "warning" }),
  info: (description: string, options?: Partial<ToastOptions>) =>
    showToast({ ...options, description, status: "info" }),

  /**
   * Toast que sigue una promesa: "cargando" → éxito o error en el mismo notch.
   * El mensaje de error debe ser seguro: usa `toSafeMessage(error)`.
   */
  promise: <T>(
    promise: Promise<T> | (() => Promise<T>),
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    },
    position: ToastOptions["position"] = "top-center",
  ): Promise<T> => {
    const base = { ...notchToastOptions, id: DEFAULT_ID, position: toPosition(position) };
    return sileo.promise(promise, {
      loading: { ...base, title: "Procesando", description: messages.loading, duration: null },
      success: (data) => ({
        ...base,
        title: DEFAULT_TITLES.success,
        description: typeof messages.success === "function" ? messages.success(data) : messages.success,
      }),
      error: (error) => ({
        ...base,
        title: DEFAULT_TITLES.error,
        description: typeof messages.error === "function" ? messages.error(error) : messages.error,
      }),
    });
  },

  dismiss: (id = DEFAULT_ID) => sileo.dismiss(id),
  clear: () => sileo.clear(),
};
