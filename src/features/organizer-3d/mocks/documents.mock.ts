import type { DocumentKind, EnvelopeDocument } from "../domain/document";
import type { EnvelopeId } from "./envelopes.mock";

type Row = [date: string, kind: DocumentKind, concept: string, pesos: number];

/**
 * Movimientos ficticios por sobre (mock visual: no son movimientos reales).
 * Siguen las reglas anotadas para la fase 2: nómina el viernes a débito,
 * efectivo el lunes y pago de tarjeta cerca del corte del día 15.
 */
const ROWS: Record<EnvelopeId, Row[]> = {
  available: [
    ["2026-10-09", "income", "Nómina (débito)", 4200],
    ["2026-10-09", "assignment", "Reparto a Semana", 1200],
    ["2026-10-05", "income", "Efectivo semanal", 1500],
    ["2026-10-05", "assignment", "Reparto a Efectivo", 950],
    ["2026-10-02", "income", "Nómina (débito)", 4200],
    ["2026-10-02", "assignment", "Apartado para tarjeta", 900],
    ["2026-09-28", "income", "Efectivo semanal", 1500],
    ["2026-09-28", "assignment", "Reparto a Ahorro", 800],
    ["2026-09-25", "income", "Nómina (débito)", 4200],
    ["2026-09-25", "assignment", "Apartado para tarjeta", 900],
    ["2026-09-21", "income", "Efectivo semanal", 1500],
    ["2026-09-18", "income", "Nómina (débito)", 4200],
  ],
  card: [
    ["2026-10-06", "expense", "Súper con tarjeta", 643.5],
    ["2026-10-03", "expense", "Gasolina con tarjeta", 700],
    ["2026-10-02", "assignment", "Apartado desde Disponible", 900],
    ["2026-09-29", "expense", "Farmacia", 215.9],
    ["2026-09-25", "assignment", "Apartado desde Disponible", 900],
    ["2026-09-22", "expense", "Restaurante", 486],
    ["2026-09-15", "payment", "Pago de tarjeta (corte)", 2350],
    ["2026-09-12", "expense", "Suscripción de streaming", 219],
  ],
  savings: [
    ["2026-10-01", "assignment", "Ahorro de quincena", 800],
    ["2026-09-28", "assignment", "Reparto desde Disponible", 800],
    ["2026-09-15", "assignment", "Ahorro de quincena", 800],
    ["2026-09-07", "assignment", "Redondeo de gastos", 120],
    ["2026-09-01", "assignment", "Ahorro de quincena", 680],
  ],
  cash: [
    ["2026-10-12", "assignment", "Efectivo para la semana", 950],
    ["2026-10-11", "expense", "Mercado", 185],
    ["2026-10-10", "expense", "Tortillería", 42],
    ["2026-10-09", "expense", "Transporte", 60],
    ["2026-10-08", "expense", "Café", 55],
    ["2026-10-07", "expense", "Papelería", 89],
    ["2026-10-06", "expense", "Mercado", 210],
    ["2026-10-05", "assignment", "Efectivo para la semana", 950],
    ["2026-10-04", "expense", "Lavandería", 120],
    ["2026-10-03", "expense", "Taquería", 140],
    ["2026-10-01", "expense", "Transporte", 60],
    ["2026-09-30", "expense", "Panadería", 48],
    ["2026-09-29", "expense", "Mercado", 230],
    ["2026-09-28", "assignment", "Efectivo para la semana", 950],
  ],
  week: [
    ["2026-10-11", "expense", "Cine", 260],
    ["2026-10-10", "expense", "Súper", 534.2],
    ["2026-10-09", "assignment", "Reparto desde Disponible", 1200],
    ["2026-10-08", "expense", "Comida fuera", 198],
    ["2026-10-06", "expense", "Gasolina", 500],
    ["2026-10-04", "expense", "Súper", 612.8],
    ["2026-10-02", "assignment", "Reparto desde Disponible", 1200],
    ["2026-09-30", "expense", "Regalo de cumpleaños", 350],
    ["2026-09-27", "expense", "Súper", 488.4],
  ],
  fund: [
    ["2026-09-28", "assignment", "Aportación mensual", 1000],
    ["2026-08-31", "assignment", "Aportación mensual", 1000],
    ["2026-07-31", "assignment", "Aportación mensual", 1000],
  ],
};

export const documentsMock: readonly EnvelopeDocument[] = (Object.entries(ROWS) as Array<[EnvelopeId, Row[]]>).flatMap(([envelopeId, rows]) =>
  rows.map(([date, kind, concept, pesos], index) => ({
    id: `${envelopeId}-${String(index + 1).padStart(2, "0")}`,
    envelopeId,
    date,
    kind,
    concept,
    amountMinor: Math.round(pesos * 100),
  })),
);

export const documentsOf = (envelopeId: EnvelopeId): EnvelopeDocument[] => documentsMock.filter((document) => document.envelopeId === envelopeId);
