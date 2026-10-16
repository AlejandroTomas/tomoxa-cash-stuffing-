import type { Movement } from "@/features/ledger/domain/types";
import type { EnvelopeId } from "./envelopeView";

/** Qué representa un movimiento respecto al sobre. */
export type DocumentKind = "income" | "expense" | "assignment" | "payment";

/**
 * Un documento dentro del sobre = un movimiento del libro visto desde ese sobre
 * (ticket, comprobante, apartado). Se deriva con `documentsFromLedger`.
 */
export interface EnvelopeDocument {
  id: string;
  envelopeId: EnvelopeId;
  /** Fecha local "YYYY-MM-DD". Leer con `parseLocalDate`, nunca con `new Date(iso)`. */
  date: string;
  concept: string;
  kind: DocumentKind;
  /** Si el dinero entró o salió de este sobre. */
  direction: "in" | "out";
  /** Monto en centavos, siempre positivo; `direction` indica el signo. */
  amountMinor: number;
  /** Movimiento del libro del que sale (para cancelarlo). */
  movementId: string;
}

/** Signo para mostrar un documento: "+ " si entró, "− " si salió. */
export const signOf = (document: Pick<EnvelopeDocument, "direction">) => (document.direction === "in" ? "+ " : "− ");

/**
 * Los movimientos del libro que tocan el sobre, vistos desde él. Los cancelados
 * y sus cancelaciones no aparecen (en conjunto no cambian nada).
 */
export function documentsFromLedger(envelopeId: EnvelopeId, movements: readonly Movement[], reversed: Readonly<Record<string, string>>): EnvelopeDocument[] {
  const documents: EnvelopeDocument[] = [];
  const add = (movement: Movement, kind: DocumentKind, direction: "in" | "out", concept = movement.concept) =>
    documents.push({ id: `${movement.id}:${direction}`, envelopeId, date: movement.date, concept, kind, direction, amountMinor: movement.amountMinor, movementId: movement.id });
  for (const movement of movements) {
    if (movement.kind === "reversal" || reversed[movement.id]) continue;
    switch (movement.kind) {
      case "income":
        if (movement.envelopeId === envelopeId) add(movement, "income", "in");
        break;
      case "expense":
        if (movement.envelopeId === envelopeId) add(movement, "expense", "out");
        if (movement.reserveEnvelopeId === envelopeId) add(movement, "assignment", "in", `Reserva: ${movement.concept}`);
        break;
      case "assignment":
        if (movement.envelopeId === envelopeId) add(movement, "assignment", "out");
        if (movement.toEnvelopeId === envelopeId) add(movement, "assignment", "in");
        break;
      case "cardPayment":
        if (movement.reserveEnvelopeId === envelopeId) add(movement, "payment", "out");
        break;
      case "accountTransfer":
        break;
    }
  }
  return sortByRecent(documents);
}

export const KIND_LABELS: Record<DocumentKind, string> = {
  income: "Ingreso",
  expense: "Gasto",
  assignment: "Apartado",
  payment: "Pago",
};

/** Lo que la tarjeta muestra del sobre: se deriva de sus documentos, no se escribe a mano. */
export interface EnvelopeActivity {
  movements: number;
  /** Fecha del movimiento más reciente, o `null` si no hay. */
  lastMovement: string | null;
}

export function summarizeActivity(documents: readonly EnvelopeDocument[]): EnvelopeActivity {
  let lastMovement: string | null = null;
  for (const document of documents) if (!lastMovement || document.date > lastMovement) lastMovement = document.date;
  return { movements: documents.length, lastMovement };
}

/** Más reciente primero; a igual fecha, por id para que el orden sea estable. */
export function sortByRecent(documents: readonly EnvelopeDocument[]): EnvelopeDocument[] {
  return [...documents].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date)));
}
