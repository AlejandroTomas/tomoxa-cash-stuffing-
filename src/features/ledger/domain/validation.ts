import { parseLocalDate } from "@/utils/localDate";
import { computeBalances, isInstallmentPurchase } from "./balances";
import { installmentAmount, MAX_INSTALLMENTS, setAsideByPurchase } from "./installments";
import type { Account, LedgerSnapshot, Movement } from "./types";

/** Lo que se va a registrar (el servicio pone `id` y `createdAt`). */
export type MovementDraft = Omit<Movement, "id" | "createdAt">;

export type IssueCode =
  | "INVALID_AMOUNT"
  | "INVALID_DATE"
  | "INVALID_CONCEPT"
  | "UNKNOWN_ACCOUNT"
  | "WRONG_ACCOUNT_KIND"
  | "ARCHIVED"
  | "UNKNOWN_ENVELOPE"
  | "SAME_SOURCE_AND_TARGET"
  | "INSUFFICIENT_FUNDS"
  | "OVERPAYMENT"
  | "UNKNOWN_MOVEMENT"
  | "ALREADY_REVERSED"
  | "NOT_REVERSIBLE"
  | "INVALID_INSTALLMENTS";

/** Por qué no se puede registrar. `message` es seguro para mostrar; `field` señala el campo. */
export interface LedgerIssue {
  code: IssueCode;
  field: keyof MovementDraft | "form";
  message: string;
}

export const CONCEPT_MAX = 80;

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const fmt = (minor: number) => money.format(minor / 100);

function isValidDate(date: string): boolean {
  try {
    return !Number.isNaN(parseLocalDate(date).getTime());
  } catch {
    return false;
  }
}

/**
 * Reglas del libro. Devuelve el primer problema o `null` si el movimiento es
 * válido. Los sobres sí pueden quedar sobregirados por un gasto (se marca);
 * las cuentas de débito/efectivo nunca quedan en negativo y la deuda nunca baja de cero.
 */
export function checkMovement(draft: MovementDraft, snapshot: LedgerSnapshot): LedgerIssue | null {
  const accounts = new Map(snapshot.accounts.map((account) => [account.id, account]));
  const envelopes = new Map(snapshot.envelopes.map((envelope) => [envelope.id, envelope]));
  const issue = (code: IssueCode, field: LedgerIssue["field"], message: string): LedgerIssue => ({ code, field, message });

  const account = (id: string | undefined, field: "accountId" | "toAccountId", kinds: Account["kind"][]): LedgerIssue | Account => {
    const found = id ? accounts.get(id) : undefined;
    if (!found) return issue("UNKNOWN_ACCOUNT", field, "Elige una cuenta.");
    if (found.archived) return issue("ARCHIVED", field, `La cuenta ${found.name} está archivada.`);
    if (!kinds.includes(found.kind)) return issue("WRONG_ACCOUNT_KIND", field, `La cuenta ${found.name} no sirve para este movimiento.`);
    return found;
  };
  const envelope = (id: string | undefined, field: "envelopeId" | "toEnvelopeId") => {
    const found = id ? envelopes.get(id) : undefined;
    if (!found) return issue("UNKNOWN_ENVELOPE", field, "Elige un sobre.");
    if (found.archived) return issue("ARCHIVED", field, `El sobre ${found.name} está archivado.`);
    return null;
  };
  const isIssue = (value: unknown): value is LedgerIssue => typeof value === "object" && value !== null && "code" in value;
  const before = computeBalances(snapshot);

  if (draft.kind === "reversal") {
    const original = snapshot.movements.find((movement) => movement.id === draft.reversalOf);
    if (!original) return issue("UNKNOWN_MOVEMENT", "reversalOf", "Ese movimiento no existe.");
    if (original.kind === "reversal") return issue("NOT_REVERSIBLE", "reversalOf", "Una cancelación no se puede cancelar.");
    if (snapshot.movements.some((movement) => movement.kind === "reversal" && movement.reversalOf === original.id)) {
      return issue("ALREADY_REVERSED", "reversalOf", "Ese movimiento ya está cancelado.");
    }
  } else {
    if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor <= 0) return issue("INVALID_AMOUNT", "amountMinor", "Escribe un monto mayor a cero.");
    if (!draft.concept.trim() || draft.concept.trim().length > CONCEPT_MAX) return issue("INVALID_CONCEPT", "concept", `Escribe un concepto (máximo ${CONCEPT_MAX} caracteres).`);
  }
  if (!isValidDate(draft.date)) return issue("INVALID_DATE", "date", "Elige una fecha válida.");

  switch (draft.kind) {
    case "income": {
      const target = account(draft.accountId, "accountId", ["debit", "cash"]);
      if (isIssue(target)) return target;
      const problem = envelope(draft.envelopeId, "envelopeId");
      if (problem) return problem;
      break;
    }
    case "expense": {
      const source = account(draft.accountId, "accountId", ["debit", "cash", "credit"]);
      if (isIssue(source)) return source;
      const problem = envelope(draft.envelopeId, "envelopeId");
      if (problem) return problem;
      if (source.kind === "credit" && draft.reserveEnvelopeId !== source.card?.reserveEnvelopeId) {
        return issue("WRONG_ACCOUNT_KIND", "accountId", `La tarjeta ${source.name} no tiene sobre de reserva.`);
      }
      if (draft.installments !== undefined) {
        if (source.kind !== "credit") return issue("INVALID_INSTALLMENTS", "installments", "Los meses sin intereses son solo con tarjeta de crédito.");
        if (!Number.isInteger(draft.installments) || draft.installments < 2 || draft.installments > MAX_INSTALLMENTS) {
          return issue("INVALID_INSTALLMENTS", "installments", `Elige de 2 a ${MAX_INSTALLMENTS} meses.`);
        }
        if (draft.amountMinor < draft.installments) return issue("INVALID_INSTALLMENTS", "amountMinor", "El monto es muy pequeño para dividirlo en meses.");
      }
      break;
    }
    case "assignment": {
      const from = envelope(draft.envelopeId, "envelopeId");
      if (from) return from;
      const to = envelope(draft.toEnvelopeId, "toEnvelopeId");
      if (to) return to;
      if (draft.envelopeId === draft.toEnvelopeId) return issue("SAME_SOURCE_AND_TARGET", "toEnvelopeId", "Elige un sobre distinto al de origen.");
      if (draft.installmentOf !== undefined) {
        const purchase = snapshot.movements.find((movement) => movement.id === draft.installmentOf);
        if (!purchase || !isInstallmentPurchase(purchase) || before.reversed[purchase.id]) return issue("UNKNOWN_MOVEMENT", "installmentOf", "Esa compra a meses no existe o está cancelada.");
        const card = accounts.get(purchase.accountId ?? "");
        if (draft.toEnvelopeId !== card?.card?.reserveEnvelopeId) return issue("WRONG_ACCOUNT_KIND", "toEnvelopeId", "La mensualidad se aparta en la reserva de su tarjeta.");
        const months = purchase.installments ?? 1;
        const number = draft.installmentNumber ?? 0;
        if (!Number.isInteger(number) || number < 1 || number > months) return issue("INVALID_INSTALLMENTS", "installmentNumber", "Esa mensualidad no existe.");
        if ((setAsideByPurchase(snapshot.movements, before.reversed).get(purchase.id) ?? []).includes(number)) {
          return issue("INVALID_INSTALLMENTS", "installmentNumber", `La mensualidad ${number} de ${months} ya está apartada.`);
        }
        if (draft.amountMinor !== installmentAmount(purchase.amountMinor, months, number)) return issue("INVALID_AMOUNT", "amountMinor", "El monto no coincide con la mensualidad.");
      }
      break;
    }
    case "accountTransfer": {
      const from = account(draft.accountId, "accountId", ["debit", "cash"]);
      if (isIssue(from)) return from;
      const to = account(draft.toAccountId, "toAccountId", ["debit", "cash"]);
      if (isIssue(to)) return to;
      if (from.id === to.id) return issue("SAME_SOURCE_AND_TARGET", "toAccountId", "Elige una cuenta distinta a la de origen.");
      break;
    }
    case "cardPayment": {
      const from = account(draft.accountId, "accountId", ["debit", "cash"]);
      if (isIssue(from)) return from;
      const card = account(draft.toAccountId, "toAccountId", ["credit"]);
      if (isIssue(card)) return card;
      if (draft.reserveEnvelopeId !== card.card?.reserveEnvelopeId) return issue("WRONG_ACCOUNT_KIND", "toAccountId", `La tarjeta ${card.name} no tiene sobre de reserva.`);
      break;
    }
    case "reversal":
      break;
  }

  if (draft.kind !== "expense" && draft.installments !== undefined) return issue("INVALID_INSTALLMENTS", "installments", "Solo un gasto puede ser a meses.");
  if (draft.kind !== "assignment" && draft.installmentOf !== undefined) return issue("INVALID_INSTALLMENTS", "installmentOf", "Solo se aparta una mensualidad moviendo dinero.");

  // Reglas de saldo: se prueba el libro con el movimiento ya aplicado.
  const candidate: Movement = { ...draft, id: "__candidate__", createdAt: "" };
  const after = computeBalances({ ...snapshot, movements: [...snapshot.movements, candidate] });
  for (const [id, value] of Object.entries(after.accounts)) {
    if (value < 0 && value < (before.accounts[id] ?? 0)) {
      const name = accounts.get(id)?.name ?? "la cuenta";
      return issue("INSUFFICIENT_FUNDS", draft.kind === "reversal" ? "form" : "amountMinor", `No alcanza: en ${name} hay ${fmt(Math.max(0, before.accounts[id] ?? 0))}.`);
    }
  }
  for (const [id, value] of Object.entries(after.debt)) {
    if (value < 0) return issue("OVERPAYMENT", draft.kind === "reversal" ? "form" : "amountMinor", `Pagas de más: la deuda es de ${fmt(Math.max(0, before.debt[id] ?? 0))}.`);
  }
  if (draft.kind === "assignment" && draft.envelopeId) {
    const available = before.envelopes[draft.envelopeId] ?? 0;
    if (draft.amountMinor > Math.max(0, available)) {
      return issue("INSUFFICIENT_FUNDS", "amountMinor", `No alcanza: en ${envelopes.get(draft.envelopeId)?.name ?? "el sobre"} hay ${fmt(Math.max(0, available))}.`);
    }
  }
  return null;
}

/**
 * Varios movimientos que se guardan juntos (pago dividido): cada uno se prueba
 * con los anteriores ya aplicados. Devuelve el primer problema y su posición.
 */
export function checkMovements(drafts: readonly MovementDraft[], snapshot: LedgerSnapshot): { index: number; issue: LedgerIssue } | null {
  const applied: Movement[] = [];
  for (const [index, draft] of drafts.entries()) {
    const issue = checkMovement(draft, { ...snapshot, movements: [...snapshot.movements, ...applied] });
    if (issue) return { index, issue };
    applied.push({ ...draft, id: `__candidate-${index}__`, createdAt: "" });
  }
  return null;
}
