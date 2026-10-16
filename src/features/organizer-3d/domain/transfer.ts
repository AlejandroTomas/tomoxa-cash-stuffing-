import { z } from "zod";

/**
 * Formulario "Mover dinero" (el monto llega como texto). Las reglas de saldo
 * las aplica el libro (`checkMovement` de `features/ledger`).
 */
export const transferFormSchema = z
  .object({
    from: z.string().min(1, "Elige el sobre de origen."),
    to: z.string().min(1, "Elige el sobre destino."),
    amount: z.string().trim().min(1, "Escribe un monto."),
  })
  .refine((form) => form.from !== form.to, { path: ["to"], message: "Elige un sobre distinto al de origen." });

export type TransferForm = z.infer<typeof transferFormSchema>;

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
