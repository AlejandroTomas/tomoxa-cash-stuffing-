export type EnvelopeId = "available" | "card" | "savings" | "cash" | "week" | "fund";
export type EnvelopeIcon = "wallet" | "card" | "piggy" | "banknote" | "calendar" | "chart";

export interface EnvelopeItem {
  id: EnvelopeId;
  name: string;
  amount: number;
  /** Color del plástico del sobre (paleta de datos, igual en ambos temas). */
  color: string;
  /** Tono claro para el contenido de papel dentro del sobre. */
  tone: string;
  description: string;
  icon: EnvelopeIcon;
  /** Cantidad de movimientos ficticios (solo para mostrar). */
  movements: number;
  /** Fecha ISO (YYYY-MM-DD) del último movimiento ficticio. */
  lastMovement: string;
}

/**
 * Mock visual. Única fuente de importes ficticios: nunca representa dinero
 * guardado ni un movimiento realizado. En la fase 2 se reemplaza por un
 * `EnvelopeViewModel[]` derivado del ledger.
 */
export const envelopesMock: readonly EnvelopeItem[] = [
  { id: "available", name: "Disponible", amount: 2450, color: "#7f9fe6", tone: "#e6edff", icon: "wallet", movements: 12, lastMovement: "2026-10-09", description: "Dinero sin asignar, listo para repartir" },
  { id: "card", name: "Tarjeta", amount: 1800, color: "#ee8586", tone: "#ffe7e6", icon: "card", movements: 8, lastMovement: "2026-10-06", description: "Dinero apartado para tu tarjeta de crédito" },
  { id: "savings", name: "Ahorro", amount: 3200, color: "#7cc3a3", tone: "#dff7e9", icon: "piggy", movements: 5, lastMovement: "2026-10-01", description: "Tu meta de ahorro del mes" },
  { id: "cash", name: "Efectivo", amount: 950, color: "#ecb46c", tone: "#ffefd9", icon: "banknote", movements: 14, lastMovement: "2026-10-12", description: "Billetes para gastos del día a día" },
  { id: "week", name: "Semana", amount: 1200, color: "#ad94db", tone: "#eee5ff", icon: "calendar", movements: 9, lastMovement: "2026-10-11", description: "Presupuesto de gastos de esta semana" },
  { id: "fund", name: "Fondo", amount: 5000, color: "#949eae", tone: "#e6edf4", icon: "chart", movements: 3, lastMovement: "2026-09-28", description: "Reserva para emergencias" },
];

export const getEnvelope = (id: EnvelopeId): EnvelopeItem =>
  envelopesMock.find((item) => item.id === id) ?? envelopesMock[0];

/** Sobre vecino en la lista (circular). Sin sobre activo, `1` da el primero y `-1` el último. */
export function neighborEnvelope(activeId: EnvelopeId | null, direction: -1 | 1): EnvelopeId {
  const count = envelopesMock.length;
  const current = envelopesMock.findIndex((item) => item.id === activeId);
  const index = current === -1 ? (direction === 1 ? 0 : count - 1) : (current + direction + count) % count;
  return envelopesMock[index].id;
}
