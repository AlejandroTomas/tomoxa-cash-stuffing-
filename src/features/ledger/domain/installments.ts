import { parseLocalDate } from "@/utils/localDate";
import { isInstallmentPurchase } from "./balances";
import { cutoffDateIn, statementPeriodFor } from "./statement";
import type { Account, CardSettings, Movement } from "./types";

/**
 * Compras a meses sin intereses. La compra sube la deuda completa, pero el sobre
 * no se toca de golpe: cada mes se aparta una mensualidad (un `assignment` del
 * sobre a la reserva de la tarjeta con `installmentOf`). El banco cobra una
 * mensualidad en cada corte, empezando por el corte del periodo de la compra.
 */

/** Plazos que se ofrecen al registrar. */
export const INSTALLMENT_OPTIONS = [3, 6, 9, 12, 18, 24] as const;
export const MAX_INSTALLMENTS = 48;

/** Mensualidad `n` (1…months) en centavos: iguales, y la última absorbe el redondeo. */
export function installmentAmount(totalMinor: number, months: number, n: number): number {
  const base = Math.floor(totalMinor / months);
  return n === months ? totalMinor - base * (months - 1) : base;
}

/** Corte en que se cobra cada mensualidad (índice 0 = mensualidad 1). */
export function installmentCutoffs(purchaseDate: string, cutoffDay: number, months: number): string[] {
  const first = parseLocalDate(statementPeriodFor(purchaseDate, cutoffDay, 0).cutoff);
  return Array.from({ length: months }, (_, index) => cutoffDateIn(first.getFullYear(), first.getMonth() + index, cutoffDay));
}

/** Lo que la compra ya cargó al estado de cuenta en cortes hasta `date` (incluido). */
export function billedThrough(purchase: Movement, cutoffDay: number, date: string): number {
  const months = purchase.installments ?? 1;
  return installmentCutoffs(purchase.date, cutoffDay, months).reduce((sum, cutoff, index) => (cutoff <= date ? sum + installmentAmount(purchase.amountMinor, months, index + 1) : sum), 0);
}

export interface Installment {
  number: number;
  amountMinor: number;
  cutoff: string;
  /** Fecha límite de pago de ese corte. */
  due: string;
}

export interface InstallmentPlan {
  purchase: Movement;
  account: Account & { card: CardSettings };
  months: number;
  /** Mensualidades ya cobradas en un corte (corte ≤ hoy). */
  billed: number;
  /** Números de mensualidad ya apartados (sin los cancelados). */
  setAside: number[];
  /** Próxima mensualidad por apartar; `null` si ya se apartaron todas. */
  next: Installment | null;
  /** Ya toca apartarla: su corte es el del periodo actual o ya pasó. */
  nextDue: boolean;
  /** Lo que falta apartar de la compra. */
  remainingMinor: number;
  /** Deuda que todavía no toca apartar (mensualidades sin cobrar ni apartar). */
  deferredMinor: number;
}

/** Mensualidades apartadas de cada compra (id de la compra → números), sin cancelados. */
export function setAsideByPurchase(movements: readonly Movement[], reversed: Readonly<Record<string, string>>): Map<string, number[]> {
  const byPurchase = new Map<string, number[]>();
  for (const movement of movements) {
    if (movement.kind !== "assignment" || !movement.installmentOf || reversed[movement.id]) continue;
    byPurchase.set(movement.installmentOf, [...(byPurchase.get(movement.installmentOf) ?? []), movement.installmentNumber ?? 0]);
  }
  return byPurchase;
}

/** Compras a meses vigentes (no canceladas) con su avance a `today`. */
export function installmentPlans(accounts: readonly Account[], movements: readonly Movement[], reversed: Readonly<Record<string, string>>, today: string): InstallmentPlan[] {
  const cards = new Map(accounts.filter((account): account is Account & { card: CardSettings } => account.kind === "credit" && Boolean(account.card)).map((account) => [account.id, account]));
  const setAsideMap = setAsideByPurchase(movements, reversed);
  const plans: InstallmentPlan[] = [];
  for (const purchase of movements) {
    if (!isInstallmentPurchase(purchase) || reversed[purchase.id]) continue;
    const account = purchase.accountId ? cards.get(purchase.accountId) : undefined;
    if (!account) continue;
    const months = purchase.installments ?? 1;
    const { cutoffDay, paymentDays } = account.card;
    const cutoffs = installmentCutoffs(purchase.date, cutoffDay, months);
    const setAside = [...(setAsideMap.get(purchase.id) ?? [])].sort((a, b) => a - b);
    const amount = (n: number) => installmentAmount(purchase.amountMinor, months, n);
    const nextNumber = cutoffs.findIndex((_, index) => !setAside.includes(index + 1)) + 1;
    const next = nextNumber > 0 ? { number: nextNumber, amountMinor: amount(nextNumber), cutoff: cutoffs[nextNumber - 1], due: statementPeriodFor(cutoffs[nextNumber - 1], cutoffDay, paymentDays).due } : null;
    const currentCutoff = statementPeriodFor(today, cutoffDay, paymentDays).cutoff;
    plans.push({
      purchase,
      account,
      months,
      billed: cutoffs.filter((cutoff) => cutoff <= today).length,
      setAside,
      next,
      nextDue: Boolean(next && next.cutoff <= currentCutoff),
      remainingMinor: purchase.amountMinor - setAside.reduce((sum, n) => sum + amount(n), 0),
      deferredMinor: cutoffs.reduce((sum, cutoff, index) => (cutoff > today && !setAside.includes(index + 1) ? sum + amount(index + 1) : sum), 0),
    });
  }
  return plans;
}

/** Deuda a meses que todavía no toca apartar, por tarjeta. */
export function deferredByCard(plans: readonly InstallmentPlan[]): Record<string, number> {
  const deferred: Record<string, number> = {};
  for (const plan of plans) deferred[plan.account.id] = (deferred[plan.account.id] ?? 0) + plan.deferredMinor;
  return deferred;
}
