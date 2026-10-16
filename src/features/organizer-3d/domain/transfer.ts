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
