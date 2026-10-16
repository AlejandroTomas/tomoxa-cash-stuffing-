import type { EnvelopeId } from "../mocks/envelopes.mock";

/** Qué representa un movimiento respecto al sobre. */
export type DocumentKind = "income" | "expense" | "assignment" | "payment";

/**
 * Un documento dentro del sobre = un movimiento (ticket, comprobante, apartado).
 * Misma forma que tendrá en la fase 2 cuando venga del libro de movimientos.
 */
export interface EnvelopeDocument {
  id: string;
  envelopeId: EnvelopeId;
  /** Fecha local "YYYY-MM-DD". Leer con `parseLocalDate`, nunca con `new Date(iso)`. */
  date: string;
  concept: string;
  kind: DocumentKind;
  /** Monto en centavos, siempre positivo; `kind` indica la dirección. */
  amountMinor: number;
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
