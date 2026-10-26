import { z } from "zod";
import { formatMinor, parseAmountMinor } from "./money";
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
  /** Meses sin intereses ("1" = de contado). Solo gasto con tarjeta. */
  installments: z.string(),
  /** Pago dividido: dos o más formas de pago del gasto (vacío = una sola, `accountId`). */
  splits: z.array(z.object({ accountId: z.string(), amount: z.string() })),
});

export type MovementForm = z.infer<typeof movementFormSchema>;
export type MovementFormField = Exclude<keyof MovementForm, "splits"> | `splits.${number}.accountId` | `splits.${number}.amount` | "root";

/** Resultado de leer el formulario: los movimientos a registrar (varios si el pago se dividió) o el campo con su mensaje. */
export type FormResult = { drafts: MovementDraft[] } | { field: MovementFormField; message: string };

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
 * Formulario → movimientos. Devuelve los borradores o el campo con su mensaje.
 * Las reglas de saldo las pone `checkMovement`; aquí solo se arma.
 */
export function draftFromForm(form: MovementForm, accounts: readonly Account[]): FormResult {
  const amountMinor = parseAmountMinor(form.amount);
  if (amountMinor === null) return { field: "amount", message: "Escribe un monto válido, por ejemplo 250 o 99.90." };
  const concept = form.concept.trim() || defaultConcept(form, accounts);
  if (!concept) return { field: "concept", message: form.kind === "income" ? "¿De dónde viene? Por ejemplo, Nómina." : "¿En qué fue? Por ejemplo, Súper." };
  const base = { date: form.date, concept, amountMinor };
  const cardOf = (id: string) => accounts.find((account) => account.id === id)?.card;
  switch (form.kind) {
    case "expense": {
      if (form.splits.length > 1) return splitDrafts(form, { ...base, kind: "expense", envelopeId: form.envelopeId }, accounts);
      const card = cardOf(form.accountId);
      const installments = card ? Number(form.installments) : 1;
      return {
        drafts: [
          {
            ...base,
            kind: "expense",
            accountId: form.accountId,
            envelopeId: form.envelopeId,
            ...(card ? { reserveEnvelopeId: card.reserveEnvelopeId } : {}),
            ...(installments > 1 ? { installments } : {}),
          },
        ],
      };
    }
    case "income":
      return { drafts: [{ ...base, kind: "income", accountId: form.accountId, envelopeId: form.envelopeId }] };
    case "cardPayment": {
      const card = cardOf(form.toAccountId);
      return { drafts: [{ ...base, kind: "cardPayment", accountId: form.accountId, toAccountId: form.toAccountId, ...(card ? { reserveEnvelopeId: card.reserveEnvelopeId } : {}) }] };
    }
    case "accountTransfer":
      return { drafts: [{ ...base, kind: "accountTransfer", accountId: form.accountId, toAccountId: form.toAccountId }] };
  }
}

/** Una parte por forma de pago; deben sumar el monto del gasto y no repetir cuenta. */
function splitDrafts(form: MovementForm, base: MovementDraft, accounts: readonly Account[]): FormResult {
  const drafts: MovementDraft[] = [];
  const used = new Set<string>();
  for (const [index, split] of form.splits.entries()) {
    if (!split.accountId) return { field: `splits.${index}.accountId`, message: "Elige con qué pagaste." };
    if (used.has(split.accountId)) return { field: `splits.${index}.accountId`, message: "Esa cuenta ya está en el pago." };
    used.add(split.accountId);
    const amountMinor = parseAmountMinor(split.amount);
    if (amountMinor === null) return { field: `splits.${index}.amount`, message: "Escribe un monto." };
    const card = accounts.find((account) => account.id === split.accountId)?.card;
    drafts.push({ ...base, amountMinor, accountId: split.accountId, ...(card ? { reserveEnvelopeId: card.reserveEnvelopeId } : {}) });
  }
  const sum = drafts.reduce((total, draft) => total + draft.amountMinor, 0);
  if (sum !== base.amountMinor) return { field: "root", message: `Las formas de pago suman ${formatMinor(sum)}; el gasto es de ${formatMinor(base.amountMinor)}.` };
  return { drafts };
}

/** Campo del formulario donde se muestra un problema del libro. */
export function formFieldOf(issue: LedgerIssue): MovementFormField {
  switch (issue.field) {
    case "amountMinor":
      return "amount";
    case "toEnvelopeId":
      return "envelopeId";
    case "installments":
      return "installments";
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
