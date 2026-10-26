import { parseLocalDate, toLocalIsoDate } from "@/utils/localDate";
import { isInstallmentPurchase } from "./balances";
import type { BudgetPeriod, Envelope, EnvelopeBudget, LedgerSettings, Movement } from "./types";

/** Tope de un presupuesto (centavos): $10,000,000. */
export const BUDGET_MAX_MINOR = 1_000_000_000;

export const BUDGET_PERIOD_LABELS: Record<BudgetPeriod, string> = { week: "semana", month: "mes" };

/**
 * Qué cuenta como gasto del sobre: los gastos (una compra a meses no, porque no
 * sale del sobre) y las mensualidades que el sobre aparta para la tarjeta.
 */
const countsAsSpending = (movement: Movement) =>
  (movement.kind === "expense" && !isInstallmentPurchase(movement)) || (movement.kind === "assignment" && movement.installmentOf !== undefined);

/** Primer y último día (incluidos) del periodo que contiene `date`. */
export function budgetRange(date: string, period: BudgetPeriod, weekStartsOn: LedgerSettings["weekStartsOn"]): { start: string; end: string } {
  const day = parseLocalDate(date);
  if (period === "month") {
    return { start: toLocalIsoDate(new Date(day.getFullYear(), day.getMonth(), 1)), end: toLocalIsoDate(new Date(day.getFullYear(), day.getMonth() + 1, 0)) };
  }
  const back = (day.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - back);
  return { start: toLocalIsoDate(start), end: toLocalIsoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)) };
}

export interface BudgetStatus extends EnvelopeBudget {
  start: string;
  end: string;
  /** Gastos del sobre en el periodo (sin los cancelados). */
  spentMinor: number;
  /** Lo que queda por gastar; negativo = te pasaste. */
  remainingMinor: number;
  /** Lo que falta apartar en el sobre para cubrir el presupuesto del periodo. */
  toFundMinor: number;
}

/**
 * Cómo va el presupuesto de un sobre: gastado contra lo planeado en el periodo
 * actual. Falta apartar = presupuesto − gastado − saldo (el saldo que sobró de
 * periodos anteriores cuenta).
 */
export function budgetStatus(
  envelope: Envelope,
  balanceMinor: number,
  movements: readonly Movement[],
  reversed: Readonly<Record<string, string>>,
  today: string,
  weekStartsOn: LedgerSettings["weekStartsOn"],
): BudgetStatus | null {
  if (!envelope.budget) return null;
  const { start, end } = budgetRange(today, envelope.budget.period, weekStartsOn);
  const spentMinor = movements
    .filter((movement) => movement.envelopeId === envelope.id && countsAsSpending(movement) && !reversed[movement.id] && movement.date >= start && movement.date <= end)
    .reduce((sum, movement) => sum + movement.amountMinor, 0);
  const { amountMinor } = envelope.budget;
  return {
    ...envelope.budget,
    start,
    end,
    spentMinor,
    remainingMinor: amountMinor - spentMinor,
    toFundMinor: Math.max(0, amountMinor - spentMinor - balanceMinor),
  };
}

/** Un presupuesto válido: monto entero positivo hasta el tope y periodo conocido. */
export const isValidBudget = (budget: EnvelopeBudget) =>
  Number.isInteger(budget.amountMinor) && budget.amountMinor > 0 && budget.amountMinor <= BUDGET_MAX_MINOR && (budget.period === "week" || budget.period === "month");
