import { z } from "zod";
import type { Movement } from "@/features/ledger/domain/types";

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

/** Por dónde viaja el dinero en la carpeta; `null` = fuera de ella. */
export interface MoneyFlow {
  from: string | null;
  to: string | null;
}

/**
 * Lo que se anima al registrar un movimiento: el ingreso entra a su sobre, el
 * gasto sale; con tarjeta el dinero pasa del sobre al de reserva (sigue en el
 * banco, ahora apartado) y el pago de tarjeta sale de la reserva. Lo que no
 * mueve sobres (depósito/retiro) no se anima; la cancelación se anima con
 * `reversalFlowOf` del original.
 */
export function moneyFlowOf(movement: Pick<Movement, "kind" | "envelopeId" | "toEnvelopeId" | "reserveEnvelopeId" | "installments">): MoneyFlow | null {
  const flow = (from: string | undefined | null, to: string | undefined | null): MoneyFlow | null =>
    (from ?? null) === (to ?? null) ? null : { from: from ?? null, to: to ?? null };
  switch (movement.kind) {
    case "income":
      return flow(null, movement.envelopeId);
    case "expense":
      // A meses el sobre no se toca al comprar: paga cada mensualidad al apartarla.
      if ((movement.installments ?? 1) > 1) return null;
      return flow(movement.envelopeId, movement.reserveEnvelopeId ?? null);
    case "assignment":
      return flow(movement.envelopeId, movement.toEnvelopeId);
    case "cardPayment":
      return flow(movement.reserveEnvelopeId, null);
    default:
      return null;
  }
}

/** Al cancelar un movimiento el dinero hace el camino inverso del original. */
export function reversalFlowOf(original: Pick<Movement, "kind" | "envelopeId" | "toEnvelopeId" | "reserveEnvelopeId" | "installments">): MoneyFlow | null {
  const flow = moneyFlowOf(original);
  return flow && { from: flow.to, to: flow.from };
}
