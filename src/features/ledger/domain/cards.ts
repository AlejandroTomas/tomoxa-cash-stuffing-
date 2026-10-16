import { differenceInCalendarDays } from "date-fns";
import { parseLocalDate } from "@/utils/localDate";
import { overdrawn, type Balances } from "./balances";
import { lastCutoffOnOrBefore, statementPeriodFor } from "./statement";
import type { Account, CardSettings, LedgerSettings, Movement, RecurringIncome } from "./types";

/** Situación de una tarjeta para mostrar y para proponer el pago. */
export interface CardSummary {
  account: Account;
  /** Lo que se debe. */
  debt: number;
  /** Dinero apartado en su sobre de reserva (puede ser negativo si se sobregiró). */
  reserve: number;
  /** Deuda que no cubre la reserva disponible (descontando sobres sobregirados). */
  unbacked: number;
  /** Próximo corte (o hoy, si hoy es día de corte). */
  nextCutoff: string;
  /** Estado de cuenta del último corte: lo que hay que pagar y hasta cuándo para no generar intereses. */
  statement: CardStatement;
}

export interface CardStatement {
  cutoff: string;
  due: string;
  /** Compras hasta el corte menos lo ya pagado (centavos; 0 = ya está cubierto). */
  amount: number;
  /** Días que faltan para la fecha límite (negativo si ya pasó). */
  daysLeft: number;
}

/** Días antes de la fecha límite en que se avisa del pago pendiente. */
export const PAYMENT_REMINDER_DAYS = 5;

/** El pago se avisa si queda algo por pagar y la fecha límite está cerca (o ya pasó). */
export const paymentDueSoon = (statement: CardStatement) => statement.amount > 0 && statement.daysLeft <= PAYMENT_REMINDER_DAYS;

/**
 * Estado de cuenta del último corte. Los movimientos cancelados no cuentan; los
 * pagos cuentan hasta hoy (los anteriores al corte ya bajaron la deuda del corte).
 */
export function cardStatement(account: Account & { card: CardSettings }, movements: readonly Movement[], reversed: Readonly<Record<string, string>>, today: string): CardStatement {
  const cutoff = lastCutoffOnOrBefore(today, account.card.cutoffDay);
  const { due } = statementPeriodFor(cutoff, account.card.cutoffDay, account.card.paymentDays);
  let charges = 0;
  let payments = 0;
  for (const movement of movements) {
    if (movement.kind === "reversal" || reversed[movement.id]) continue;
    if (movement.kind === "expense" && movement.accountId === account.id && movement.date <= cutoff) charges += movement.amountMinor;
    if (movement.kind === "cardPayment" && movement.toAccountId === account.id && movement.date <= today) payments += movement.amountMinor;
  }
  return { cutoff, due, amount: Math.max(0, charges - payments), daysLeft: differenceInCalendarDays(parseLocalDate(due), parseLocalDate(today)) };
}

/**
 * Resumen por tarjeta. Si hay sobres sobregirados, "pidieron prestada" la
 * reserva: se descuenta primero de la primera tarjeta, luego de la siguiente.
 */
export function cardSummaries(accounts: readonly Account[], balances: Balances, movements: readonly Movement[], today: string): CardSummary[] {
  let borrowed = overdrawn(balances);
  return accounts
    .filter((account): account is Account & { card: CardSettings } => account.kind === "credit" && !account.archived && Boolean(account.card))
    .map((account) => {
      const debt = balances.debt[account.id] ?? 0;
      const reserve = balances.envelopes[account.card.reserveEnvelopeId] ?? 0;
      const available = Math.max(0, reserve);
      const lent = Math.min(available, borrowed);
      borrowed -= lent;
      return {
        account,
        debt,
        reserve,
        unbacked: Math.max(0, debt - (available - lent)),
        nextCutoff: statementPeriodFor(today, account.card.cutoffDay, account.card.paymentDays).cutoff,
        statement: cardStatement(account, movements, balances.reversed, today),
      };
    });
}

export interface SettingsIssue {
  field: string;
  message: string;
}

export function checkCardSettings(card: Pick<CardSettings, "cutoffDay" | "paymentDays">): SettingsIssue | null {
  if (!Number.isInteger(card.cutoffDay) || card.cutoffDay < 1 || card.cutoffDay > 31) return { field: "cutoffDay", message: "El día de corte va del 1 al 31." };
  if (!Number.isInteger(card.paymentDays) || card.paymentDays < 1 || card.paymentDays > 60) return { field: "paymentDays", message: "Los días para pagar van de 1 a 60." };
  return null;
}

export function checkSettings(settings: LedgerSettings, accounts: readonly Account[]): SettingsIssue | null {
  for (const [index, income] of settings.recurringIncome.entries()) {
    if (!income.label.trim() || income.label.trim().length > 40) return { field: `recurringIncome.${index}.label`, message: "Ponle un nombre al ingreso (máximo 40 caracteres)." };
    if (!Number.isInteger(income.weekday) || income.weekday < 0 || income.weekday > 6) return { field: `recurringIncome.${index}.weekday`, message: "Elige un día de la semana." };
    const account = accounts.find((candidate) => candidate.id === income.accountId);
    if (!account || account.archived || account.kind === "credit") return { field: `recurringIncome.${index}.accountId`, message: "Elige débito o efectivo." };
  }
  return null;
}

/** Ingresos recurrentes que tocan en `date` (para proponerlos al registrar). */
export function incomesDueOn(settings: LedgerSettings, weekday: number): RecurringIncome[] {
  return settings.recurringIncome.filter((income) => income.weekday === weekday);
}
