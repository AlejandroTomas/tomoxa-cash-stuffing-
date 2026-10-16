import { parseLocalDate } from "@/utils/localDate";
import type { MovementKind } from "../domain/types";

const dayFormat = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

/** "2026-11-04" → "4 nov". */
export const formatDay = (iso: string) => dayFormat.format(parseLocalDate(iso)).replace(/\./g, "");

/** Fecha límite de un estado de cuenta en palabras: "antes del 4 nov", "hoy", "venció el 4 nov". */
export function dueText(due: string, daysLeft: number): string {
  if (daysLeft < 0) return `venció el ${formatDay(due)}`;
  if (daysLeft === 0) return "vence hoy";
  if (daysLeft === 1) return "vence mañana";
  return `antes del ${formatDay(due)}`;
}

/** 0 = domingo … 6 = sábado. */
export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  income: "Ingreso",
  expense: "Gasto",
  assignment: "Mover",
  accountTransfer: "Depósito/Retiro",
  cardPayment: "Pago de tarjeta",
  reversal: "Cancelación",
};
