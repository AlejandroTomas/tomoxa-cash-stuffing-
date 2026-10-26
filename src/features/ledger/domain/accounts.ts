import type { Balances } from "./balances";
import { checkCardSettings } from "./cards";
import { ENVELOPE_NAME_MAX } from "./envelopes";
import type { Account, AccountKind, Envelope, LedgerSettings } from "./types";

/**
 * Cuentas: varias de débito, efectivo y tarjetas de crédito. Cada tarjeta tiene
 * su propio sobre de reserva, que se crea con ella y se archiva con ella.
 */

export const ACCOUNT_NAME_MAX = 24;

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = { debit: "Débito", cash: "Efectivo", credit: "Tarjeta de crédito" };

/** Lo que se captura para crear o editar una cuenta (el tipo no cambia al editar). */
export interface AccountInput {
  /** Sin id = cuenta nueva. */
  id?: string;
  name: string;
  kind: AccountKind;
  /** Solo tarjetas. */
  cutoffDay?: number;
  paymentDays?: number;
}

export interface AccountIssue {
  code: "INVALID_NAME" | "NAME_TAKEN" | "INVALID_SETTINGS" | "PROTECTED" | "NOT_EMPTY" | "IN_USE";
  field: "name" | "cutoffDay" | "paymentDays" | "form";
  message: string;
}

const normalize = (name: string) => name.trim().toLocaleLowerCase("es");

/** Reglas para crear o editar una cuenta. `accounts` son todas las existentes. */
export function checkAccount(input: AccountInput, accounts: readonly Account[]): AccountIssue | null {
  const name = input.name.trim();
  if (!name || name.length > ACCOUNT_NAME_MAX) return { code: "INVALID_NAME", field: "name", message: `Ponle un nombre (máximo ${ACCOUNT_NAME_MAX} caracteres).` };
  if (accounts.some((other) => other.id !== input.id && !other.archived && normalize(other.name) === normalize(name))) {
    return { code: "NAME_TAKEN", field: "name", message: "Ya hay una cuenta con ese nombre." };
  }
  if (input.kind === "credit") {
    const issue = checkCardSettings({ cutoffDay: input.cutoffDay ?? 0, paymentDays: input.paymentDays ?? 0 });
    if (issue) return { code: "INVALID_SETTINGS", field: issue.field as AccountIssue["field"], message: issue.message };
  }
  return null;
}

/**
 * Nombre del sobre de reserva de una tarjeta nueva: el de la tarjeta, o "TDC …"
 * si ya hay un sobre activo que se llama igual. `null` si ninguno está libre.
 */
export function reserveEnvelopeName(cardName: string, envelopes: readonly Envelope[]): string | null {
  const taken = new Set(envelopes.filter((envelope) => !envelope.archived).map((envelope) => normalize(envelope.name)));
  const candidates = [cardName.trim(), `TDC ${cardName.trim()}`].map((name) => name.slice(0, ENVELOPE_NAME_MAX).trim());
  return candidates.find((name) => !taken.has(normalize(name))) ?? null;
}

/**
 * Archivar: solo vacía (sin saldo o sin deuda ni reserva), sin ingresos
 * recurrentes que la usen, y siempre debe quedar una cuenta de débito o efectivo.
 */
export function checkArchiveAccount(account: Account, accounts: readonly Account[], balances: Balances, settings: LedgerSettings): AccountIssue | null {
  if (account.kind === "credit") {
    if ((balances.debt[account.id] ?? 0) !== 0) return { code: "NOT_EMPTY", field: "form", message: `Primero liquida ${account.name}: solo se archivan tarjetas sin deuda.` };
    const reserve = account.card ? (balances.envelopes[account.card.reserveEnvelopeId] ?? 0) : 0;
    if (reserve !== 0) return { code: "NOT_EMPTY", field: "form", message: "Su sobre de reserva tiene dinero: muévelo a otro sobre antes de archivarla." };
    return null;
  }
  if ((balances.accounts[account.id] ?? 0) !== 0) return { code: "NOT_EMPTY", field: "form", message: `Primero pasa el dinero de ${account.name} a otra cuenta (Depósito/Retiro).` };
  if (!accounts.some((other) => other.id !== account.id && !other.archived && other.kind !== "credit")) {
    return { code: "PROTECTED", field: "form", message: "Necesitas al menos una cuenta de débito o efectivo." };
  }
  if (settings.recurringIncome.some((income) => income.accountId === account.id)) {
    return { code: "IN_USE", field: "form", message: "Un ingreso recurrente entra a esta cuenta: cámbialo en Ajustes antes de archivarla." };
  }
  return null;
}

/** Colores de los sobres de reserva de tarjetas nuevas (se reparten en orden). */
export const CARD_RESERVE_COLORS = ["#ee8586", "#e49ac0", "#9a8de0", "#6fb7d6", "#e6a06c", "#88b97a"] as const;
