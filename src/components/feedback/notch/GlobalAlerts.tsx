"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";

import { alertService, getCollectionType, useAlerts, type Alert } from "@/core/alert";
import { AlertCollection } from "./AlertCollection";
import { describeAlerts, getAlertPresentation } from "./alertPresentation";
import { NotchSurface, type NotchPosition } from "./NotchSurface";

/**
 * Panel global de alertas. Se monta una vez en los providers y muestra todo lo
 * que entra por `alertService` (incluidos los errores de thunks).
 */
export function GlobalAlerts({ position }: { position?: NotchPosition }) {
  const alerts = useAlerts();
  // Conserva las últimas alertas mientras el panel anima su salida.
  const [lastAlerts, setLastAlerts] = useState<readonly Alert[]>(alerts);
  if (alerts.length > 0 && alerts !== lastAlerts) setLastAlerts(alerts);
  const visible = alerts.length > 0 ? alerts : lastAlerts;

  const single = visible.length === 1 ? visible[0] : undefined;
  const collectionType = getCollectionType(visible);
  const { icon, color } = getAlertPresentation(collectionType);
  const StatusIcon = !single && collectionType === "error" ? CircleAlert : icon;
  const label = describeAlerts(visible.map((alert) => alert.type));
  const occurrences = visible.reduce((total, alert) => total + alert.count, 0);
  const title = single ? `${single.title}${single.count > 1 ? ` · ×${single.count}` : ""}` : label;

  return (
    <NotchSurface
      isOpen={alerts.length > 0}
      title={title}
      announcement={`${label}. ${occurrences} ocurrencias.`}
      icon={<StatusIcon size={16} aria-hidden="true" />}
      color={color}
      position={position}
      onClose={alertService.clear}
    >
      <AlertCollection alerts={visible} onClose={alertService.clear} onCloseAlert={alertService.dismiss} />
    </NotchSurface>
  );
}
