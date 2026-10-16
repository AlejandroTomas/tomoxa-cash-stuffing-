import { z } from "zod";
import type { EnvelopeId } from "../mocks/envelopes.mock";
import type { EnvelopeDocument } from "./document";

/** Lo que captura el formulario "Mover dinero" (el monto llega como texto). */
export const transferFormSchema = z
  .object({
    from: z.string().min(1, "Elige el sobre de origen."),
    to: z.string().min(1, "Elige el sobre destino."),
    amount: z.string().trim().min(1, "Escribe un monto."),
  })
  .refine((form) => form.from !== form.to, { path: ["to"], message: "Elige un sobre distinto al de origen." });

export type TransferForm = z.infer<typeof transferFormSchema>;

export interface Transfer {
  from: EnvelopeId;
  to: EnvelopeId;
  /** Centavos, entero positivo. */
  amountMinor: number;
}

export type Balances = Record<EnvelopeId, number>;

/**
 * "1,234.50", "$ 1234.5", "800" → centavos. `null` si no es un monto válido
 * (letras, más de dos decimales, cero o negativo).
 */
export function parseAmountMinor(text: string): number | null {
  const clean = text.replace(/[\s$]/g, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [pesos, cents = ""] = clean.split(".");
  const minor = Number(pesos) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

export type TransferCheck = { ok: true; transfer: Transfer } | { ok: false; field: keyof TransferForm; message: string };

/** Reglas que dependen de los saldos: el sobre existe y alcanza el dinero. */
export function checkTransfer(form: TransferForm, balances: Balances): TransferCheck {
  if (!(form.from in balances)) return { ok: false, field: "from", message: "Elige el sobre de origen." };
  if (!(form.to in balances)) return { ok: false, field: "to", message: "Elige el sobre destino." };
  if (form.from === form.to) return { ok: false, field: "to", message: "Elige un sobre distinto al de origen." };
  const amountMinor = parseAmountMinor(form.amount);
  if (amountMinor === null) return { ok: false, field: "amount", message: "Escribe un monto válido, por ejemplo 250 o 99.90." };
  const from = form.from as EnvelopeId;
  if (amountMinor > balances[from]) return { ok: false, field: "amount", message: "No alcanza: el monto es mayor a lo que hay en el sobre." };
  return { ok: true, transfer: { from, to: form.to as EnvelopeId, amountMinor } };
}

/** Saldos después de mover (sin mutar los de entrada). */
export function applyTransfer(balances: Balances, { from, to, amountMinor }: Transfer): Balances {
  return { ...balances, [from]: balances[from] - amountMinor, [to]: balances[to] + amountMinor };
}

/** Los dos movimientos que deja una transferencia: salida en el origen y entrada en el destino. */
export function transferDocuments({ from, to, amountMinor }: Transfer, date: string, names: Record<EnvelopeId, string>, id: string): EnvelopeDocument[] {
  return [
    { id: `${id}-out`, envelopeId: from, date, kind: "assignment", concept: `Movido a ${names[to]}`, amountMinor },
    { id: `${id}-in`, envelopeId: to, date, kind: "assignment", concept: `Recibido de ${names[from]}`, amountMinor },
  ];
}
