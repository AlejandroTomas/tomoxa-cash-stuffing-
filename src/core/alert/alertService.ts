import { reportError } from "@/core/logger";
import { alertStore, type AlertType } from "./alertStore";

/**
 * Mostrar alertas en el panel notch. Se monta una vez con `<GlobalAlerts />`.
 *
 * - `reportError` / `reportErrors`: para errores desconocidos. Registran el
 *   detalle técnico y muestran solo el mensaje seguro.
 * - `error`, `warning`, etc.: para mensajes que TÚ escribiste (validaciones,
 *   resultados de un lote). Nunca les pases `error.message` de un error ajeno.
 *
 * Los errores de thunks llegan aquí solos (ver `store/index.ts`): no los
 * vuelvas a mostrar desde el componente.
 */
const show = (type: AlertType) => (title: string, message: string) =>
  alertStore.add({ type, title, message });

export const alertService = {
  info: show("info"),
  success: show("success"),
  warning: show("warning"),
  error: show("error"),
  question: show("question"),

  reportError(title: string, error: unknown, context = title): string {
    const message = reportError(error, { context });
    return alertStore.add({ type: "error", title, message });
  },

  /** Errores de un lote donde lo demás sí se guardó. Los repetidos se agrupan con ×N. */
  reportErrors(title: string, errors: readonly unknown[], context = title): void {
    errors.forEach((error) => {
      alertStore.add({ type: "error", title, message: reportError(error, { context }) });
    });
  },

  dismiss: (id: string) => alertStore.remove(id),
  clear: () => alertStore.clear(),
};
