import { overdrawn, type Balances } from "./balances";
import { statementPeriodFor, type StatementPeriod } from "./statement";
import type { Account, CardSettings, LedgerSettings, RecurringIncome } from "./types";

/** Situación de una tarjeta para mostrar y para proponer el pago. */
export interface CardSummary {
  account: Account;
  /** Lo que se debe. */
  debt: number;
  /** Dinero apartado en su sobre de reserva (puede ser negativo si se sobregiró). */
  reserve: number;
  /** Deuda que no cubre la reserva disponible (descontando sobres sobregirados). */
  unbacked: number;
  /** Periodo que contiene "hoy": corte y fecha límite de pago. */
  period: StatementPeriod;
}

/**
 * Resumen por tarjeta. Si hay sobres sobregirados, "pidieron prestada" la
 * reserva: se descuenta primero de la primera tarjeta, luego de la siguiente.
 */
export function cardSummaries(accounts: readonly Account[], balances: Balances, today: string): CardSummary[] {
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
        period: statementPeriodFor(today, account.card.cutoffDay, account.card.paymentDays),
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
