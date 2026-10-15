/**
 * Stack de alertas: lo que el usuario debe leer y cerrar (errores de una
 * operación, resultados de un lote). Vive fuera de Redux a propósito: no
 * depende del store, se prueba sin React y lo puede usar cualquier capa a
 * través de `alertService`. La UI lo lee con `useAlerts()`.
 */
export type AlertType = "info" | "success" | "warning" | "error" | "question";

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  /** Epoch ms de la primera vez que apareció. */
  createdAt: number;
  /** Cuántas veces llegó la misma alerta mientras seguía abierta. */
  count: number;
}

export interface NewAlert {
  type: AlertType;
  title: string;
  message: string;
}

type Listener = () => void;

export function createAlertStore(now: () => number = Date.now) {
  let alerts: readonly Alert[] = [];
  let nextId = 1;
  const listeners = new Set<Listener>();

  const emit = (next: readonly Alert[]) => {
    alerts = next;
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: (): readonly Alert[] => alerts,
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /**
     * Agrega una alerta. Si ya hay una abierta con el mismo tipo, título y
     * mensaje, solo sube su contador: un lote donde 50 filas fallan igual abre
     * una alerta ×50, no cincuenta. Al cerrarla, la siguiente vuelve a ×1.
     */
    add({ type, title, message }: NewAlert): string {
      const opened = alerts.find(
        (alert) => alert.type === type && alert.title === title && alert.message === message,
      );
      if (opened) {
        emit(alerts.map((alert) => (alert === opened ? { ...alert, count: alert.count + 1 } : alert)));
        return opened.id;
      }
      const alert: Alert = { id: String(nextId++), type, title, message, createdAt: now(), count: 1 };
      emit([...alerts, alert]);
      return alert.id;
    },
    remove(id: string): void {
      if (alerts.some((alert) => alert.id === id)) {
        emit(alerts.filter((alert) => alert.id !== id));
      }
    },
    clear(): void {
      if (alerts.length > 0) emit([]);
    },
  };
}

export type AlertStore = ReturnType<typeof createAlertStore>;

/** El stack global de la app. */
export const alertStore = createAlertStore();

/** La alerta más importante decide el color e ícono del panel. */
const PRIORITY: readonly AlertType[] = ["error", "warning", "question", "info", "success"];

export function getCollectionType(alerts: readonly Alert[]): AlertType {
  return PRIORITY.find((type) => alerts.some((alert) => alert.type === type)) ?? "info";
}

export function formatAlertsForCopy(alerts: readonly Alert[]): string {
  return alerts
    .map(
      (alert, index) =>
        `${index + 1}. ${alert.title}\n${alert.message}\nRepeticiones: ${alert.count}\n${new Date(
          alert.createdAt,
        ).toLocaleString()}`,
    )
    .join("\n\n");
}
