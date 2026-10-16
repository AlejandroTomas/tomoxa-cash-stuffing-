import { addDays, getDaysInMonth } from "date-fns";
import { parseLocalDate, toLocalIsoDate } from "@/utils/localDate";

/** Fecha de corte de un mes: el día pedido o el último del mes si no existe (31 → 30, 28…). */
export function cutoffDateIn(year: number, month: number, cutoffDay: number): string {
  const day = Math.min(cutoffDay, getDaysInMonth(new Date(year, month, 1)));
  return toLocalIsoDate(new Date(year, month, day));
}

export interface StatementPeriod {
  /** Primer día del periodo (día siguiente al corte anterior). */
  start: string;
  /** Día del corte. */
  cutoff: string;
  /** Fecha límite de pago. */
  due: string;
}

/** Periodo de la tarjeta que contiene `date`, con fechas reales (meses de 28 a 31 días, cambio de año). */
export function statementPeriodFor(date: string, cutoffDay: number, paymentDays: number): StatementPeriod {
  const day = parseLocalDate(date);
  const thisMonthCutoff = cutoffDateIn(day.getFullYear(), day.getMonth(), cutoffDay);
  const cutoff = date <= thisMonthCutoff ? thisMonthCutoff : cutoffDateIn(day.getFullYear(), day.getMonth() + 1, cutoffDay);
  const cutoffDate = parseLocalDate(cutoff);
  const previousCutoff = cutoffDateIn(cutoffDate.getFullYear(), cutoffDate.getMonth() - 1, cutoffDay);
  return {
    start: toLocalIsoDate(addDays(parseLocalDate(previousCutoff), 1)),
    cutoff,
    due: toLocalIsoDate(addDays(cutoffDate, paymentDays)),
  };
}
