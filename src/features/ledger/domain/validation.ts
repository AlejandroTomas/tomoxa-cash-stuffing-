import { parseLocalDate } from "@/utils/localDate";
import { computeBalances } from "./balances";
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
  | "NOT_REVERSIBLE";

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
      break;
    }
    case "assignment": {
      const from = envelope(draft.envelopeId, "envelopeId");
      if (from) return from;
      const to = envelope(draft.toEnvelopeId, "toEnvelopeId");
      if (to) return to;
      if (draft.envelopeId === draft.toEnvelopeId) return issue("SAME_SOURCE_AND_TARGET", "toEnvelopeId", "Elige un sobre distinto al de origen.");
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

  // Reglas de saldo: se prueba el libro con el movimiento ya aplicado.
  const before = computeBalances(snapshot);
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
