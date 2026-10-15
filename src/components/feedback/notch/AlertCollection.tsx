"use client";

import { type CSSProperties, useState } from "react";
import { Copy, X } from "lucide-react";

import { formatAlertsForCopy, type Alert } from "@/core/alert";
import { reportError } from "@/core/logger";
import { describeAlerts, getAlertPresentation } from "./alertPresentation";
import styles from "./AlertCollection.module.css";

interface AlertCollectionProps {
  alerts: readonly Alert[];
  onClose: () => void;
  onCloseAlert: (id: string) => void;
}

/** Lista de alertas dentro del notch: resumen, filas con ×N y acciones. */
export function AlertCollection({ alerts, onClose, onCloseAlert }: AlertCollectionProps) {
  const [copying, setCopying] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const allErrors = alerts.every((alert) => alert.type === "error");
  const allSuccess = alerts.every((alert) => alert.type === "success");

  const copyAll = async () => {
    setCopying(true);
    setCopyStatus("");
    try {
      await navigator.clipboard.writeText(formatAlertsForCopy(alerts));
      setCopyStatus(allErrors ? "Errores copiados." : "Alertas copiadas.");
    } catch (error) {
      reportError(error, { context: "alerts.copy" });
      setCopyStatus("No se pudo copiar. Puedes seleccionar los mensajes.");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className={styles.collection} data-single={alerts.length === 1 || undefined}>
      <div className={styles.summary}>
        <p className={styles.summaryTitle}>{describeAlerts(alerts.map((alert) => alert.type))}</p>
        <p>
          {allSuccess
            ? "Las operaciones se completaron correctamente."
            : "Revisa los mensajes antes de continuar."}
        </p>
      </div>
      <ul className={styles.list} aria-label="Lista de alertas">
        {alerts.map((alert) => {
          const { icon: StatusIcon, color } = getAlertPresentation(alert.type);
          const rowStyle: CSSProperties & { "--alert-color": string } = { "--alert-color": color };
          return (
            <li key={alert.id} className={styles.row} style={rowStyle}>
              <span className={styles.icon}>
                <StatusIcon size={16} aria-hidden="true" />
              </span>
              <div className={styles.message}>
                <h3 className={styles.title}>
                  {alert.title}
                  {alert.count > 1 && (
                    <span className={styles.count} aria-label={`Ocurrió ${alert.count} veces`}>
                      ×{alert.count}
                    </span>
                  )}
                </h3>
                <p>{alert.message}</p>
                <time className={styles.timestamp} dateTime={new Date(alert.createdAt).toISOString()}>
                  {new Date(alert.createdAt).toLocaleTimeString()}
                </time>
              </div>
              <button
                type="button"
                className={styles.dismiss}
                aria-label={`Cerrar alerta: ${alert.title}`}
                onClick={(event) => {
                  // El botón va a desaparecer: el foco pasa al cierre del panel.
                  event.currentTarget
                    .closest('[role="alertdialog"]')
                    ?.querySelector<HTMLButtonElement>("button[data-notch-close]")
                    ?.focus();
                  onCloseAlert(alert.id);
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className={styles.actions}>
        <button type="button" className={styles.button} disabled={copying} onClick={() => void copyAll()}>
          <Copy size={14} aria-hidden="true" />
          {copying ? "Copiando…" : allErrors ? "Copiar errores" : "Copiar alertas"}
        </button>
        <button type="button" className={styles.button} onClick={onClose}>
          {alerts.length === 1 ? "Cerrar" : "Cerrar todos"}
        </button>
        <p className={styles.copyStatus} role="status" aria-live="polite">
          {copyStatus}
        </p>
      </div>
    </div>
  );
}
