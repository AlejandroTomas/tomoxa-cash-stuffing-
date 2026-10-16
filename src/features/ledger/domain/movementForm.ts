import { z } from "zod";
import { parseAmountMinor } from "./money";
import type { Account } from "./types";
import type { LedgerIssue, MovementDraft } from "./validation";
import { CONCEPT_MAX } from "./validation";

/** Tipos que se registran desde el formulario (asignar es "Mover dinero"; cancelar va aparte). */
export type RecordKind = "expense" | "income" | "cardPayment" | "accountTransfer";

export const RECORD_KINDS: { kind: RecordKind; label: string }[] = [
  { kind: "expense", label: "Gasto" },
  { kind: "income", label: "Ingreso" },
  { kind: "cardPayment", label: "Pagar tarjeta" },
  { kind: "accountTransfer", label: "Depósito/Retiro" },
];

/** Valores del formulario: todo texto (como lo dan los campos). Lo que no aplica al tipo se ignora. */
export const movementFormSchema = z.object({
  kind: z.enum(["expense", "income", "cardPayment", "accountTransfer"]),
  amount: z.string().trim().min(1, "Escribe un monto."),
  concept: z.string().trim().max(CONCEPT_MAX, `Máximo ${CONCEPT_MAX} caracteres.`),
  date: z.string().min(1, "Elige una fecha."),
  accountId: z.string(),
  toAccountId: z.string(),
  envelopeId: z.string(),
});

export type MovementForm = z.infer<typeof movementFormSchema>;
export type MovementFormField = keyof MovementForm | "root";

/** Concepto cuando se deja vacío (pago y depósito/retiro lo pueden omitir). */
export function defaultConcept(form: Pick<MovementForm, "kind" | "accountId" | "toAccountId">, accounts: readonly Account[]): string {
  const name = (id: string) => accounts.find((account) => account.id === id)?.name ?? "";
  const kindOf = (id: string) => accounts.find((account) => account.id === id)?.kind;
  if (form.kind === "cardPayment") return `Pago de ${name(form.toAccountId)}`.trim();
  if (form.kind === "accountTransfer") {
    if (kindOf(form.accountId) === "debit" && kindOf(form.toAccountId) === "cash") return "Retiro de efectivo";
    if (kindOf(form.accountId) === "cash" && kindOf(form.toAccountId) === "debit") return "Depósito a débito";
    return `${name(form.accountId)} → ${name(form.toAccountId)}`;
  }
  return "";
}

/**
 * Formulario → movimiento. Devuelve el borrador o el campo con su mensaje.
 * Las reglas de saldo las pone `checkMovement`; aquí solo se arma.
 */
export function draftFromForm(form: MovementForm, accounts: readonly Account[]): { draft: MovementDraft } | { field: MovementFormField; message: string } {
  const amountMinor = parseAmountMinor(form.amount);
  if (amountMinor === null) return { field: "amount", message: "Escribe un monto válido, por ejemplo 250 o 99.90." };
  const concept = form.concept.trim() || defaultConcept(form, accounts);
  if (!concept) return { field: "concept", message: form.kind === "income" ? "¿De dónde viene? Por ejemplo, Nómina." : "¿En qué fue? Por ejemplo, Súper." };
  const base = { date: form.date, concept, amountMinor };
  switch (form.kind) {
    case "expense": {
      const card = accounts.find((account) => account.id === form.accountId)?.card;
      return { draft: { ...base, kind: "expense", accountId: form.accountId, envelopeId: form.envelopeId, ...(card ? { reserveEnvelopeId: card.reserveEnvelopeId } : {}) } };
    }
    case "income":
      return { draft: { ...base, kind: "income", accountId: form.accountId, envelopeId: form.envelopeId } };
    case "cardPayment": {
      const card = accounts.find((account) => account.id === form.toAccountId)?.card;
      return { draft: { ...base, kind: "cardPayment", accountId: form.accountId, toAccountId: form.toAccountId, ...(card ? { reserveEnvelopeId: card.reserveEnvelopeId } : {}) } };
    }
    case "accountTransfer":
      return { draft: { ...base, kind: "accountTransfer", accountId: form.accountId, toAccountId: form.toAccountId } };
  }
}

/** Campo del formulario donde se muestra un problema del libro. */
export function formFieldOf(issue: LedgerIssue): MovementFormField {
  switch (issue.field) {
    case "amountMinor":
      return "amount";
    case "toEnvelopeId":
      return "envelopeId";
    case "concept":
    case "date":
    case "accountId":
    case "toAccountId":
    case "envelopeId":
      return issue.field;
    default:
      return "root";
  }
}
