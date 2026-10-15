import { Check, CircleAlert, CircleHelp, LifeBuoy, X, type LucideIcon } from "lucide-react";

import type { AlertType } from "@/core/alert";
import { notchTokens } from "@/core/toast";

const { colors } = notchTokens;

const PRESENTATIONS: Record<AlertType, { icon: LucideIcon; color: string }> = {
  error: { icon: X, color: colors.error },
  warning: { icon: CircleAlert, color: colors.warning },
  success: { icon: Check, color: colors.success },
  info: { icon: LifeBuoy, color: colors.info },
  question: { icon: CircleHelp, color: colors.warning },
};

export const getAlertPresentation = (type: AlertType) => PRESENTATIONS[type];

/** "1 error" / "3 errores" / "2 éxitos" / "4 alertas". */
export function describeAlerts(types: readonly AlertType[]): string {
  const count = types.length;
  const one = count === 1;
  if (types.every((type) => type === "error")) return `${count} ${one ? "error" : "errores"}`;
  if (types.every((type) => type === "success")) return `${count} ${one ? "éxito" : "éxitos"}`;
  return `${count} ${one ? "alerta" : "alertas"}`;
}
