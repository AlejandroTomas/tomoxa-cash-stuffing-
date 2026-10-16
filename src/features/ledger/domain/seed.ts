import type { Account, Envelope, LedgerSettings, Movement } from "./types";
import type { MovementDraft } from "./validation";

/**
 * Datos de ejemplo para la primera vez que se abre la app: una historia
 * coherente (julio–octubre 2026) que sigue las reglas por defecto: nómina el
 * viernes a débito, efectivo el lunes, compras con tarjeta reservadas en el
 * sobre Tarjeta y su pago tras el corte del 15. Cada movimiento pasa
 * `checkMovement` (lo prueba un test).
 */

export const SEED_ACCOUNTS: Account[] = [
  { id: "debit", name: "Débito", kind: "debit", archived: false },
  { id: "cash", name: "Efectivo", kind: "cash", archived: false },
  { id: "visa", name: "Tarjeta de crédito", kind: "credit", archived: false, card: { cutoffDay: 15, paymentDays: 20, reserveEnvelopeId: "card" } },
];

export const SEED_ENVELOPES: Envelope[] = [
  { id: "available", name: "Disponible", description: "Dinero sin asignar, listo para repartir", color: "#7f9fe6", icon: "wallet", order: 0, archived: false },
  { id: "card", name: "Tarjeta", description: "Dinero apartado para tu tarjeta de crédito", color: "#ee8586", icon: "card", order: 1, archived: false },
  { id: "savings", name: "Ahorro", description: "Tu meta de ahorro del mes", color: "#7cc3a3", icon: "piggy", order: 2, archived: false },
  { id: "cash", name: "Efectivo", description: "Billetes para gastos del día a día", color: "#ecb46c", icon: "banknote", order: 3, archived: false, budget: { amountMinor: 95000, period: "week" } },
  { id: "week", name: "Semana", description: "Presupuesto de gastos de esta semana", color: "#ad94db", icon: "calendar", order: 4, archived: false, budget: { amountMinor: 120000, period: "week" } },
  { id: "fund", name: "Fondo", description: "Reserva para emergencias", color: "#949eae", icon: "chart", order: 5, archived: false },
];

export const DEFAULT_SETTINGS: LedgerSettings = {
  recurringIncome: [
    { id: "payroll", label: "Nómina", weekday: 5, accountId: "debit" },
    { id: "weekly-cash", label: "Efectivo semanal", weekday: 1, accountId: "cash" },
  ],
  weekStartsOn: 1,
  currency: "MXN",
};

const pesos = (value: number) => Math.round(value * 100);

const income = (date: string, concept: string, amount: number, accountId: "debit" | "cash"): MovementDraft => ({ kind: "income", date, concept, amountMinor: pesos(amount), accountId, envelopeId: "available" });
const assign = (date: string, concept: string, amount: number, toEnvelopeId: string, envelopeId = "available"): MovementDraft => ({ kind: "assignment", date, concept, amountMinor: pesos(amount), envelopeId, toEnvelopeId });
const spend = (date: string, concept: string, amount: number, envelopeId: string, accountId: "debit" | "cash" | "visa"): MovementDraft => ({
  kind: "expense",
  date,
  concept,
  amountMinor: pesos(amount),
  envelopeId,
  accountId,
  ...(accountId === "visa" ? { reserveEnvelopeId: "card" } : {}),
});

/** Historia en orden cronológico (dentro de un día, en el orden escrito). */
export const SEED_DRAFTS: MovementDraft[] = [
  income("2026-07-31", "Saldo inicial", 6000, "debit"),
  assign("2026-07-31", "Aportación mensual", 1000, "fund"),
  assign("2026-08-31", "Aportación mensual", 1000, "fund"),
  income("2026-09-04", "Nómina (débito)", 4200, "debit"),
  assign("2026-09-04", "Reparto a Semana", 1200, "week"),
  spend("2026-09-04", "Renta", 6500, "available", "debit"),
  income("2026-09-07", "Efectivo semanal", 1500, "cash"),
  assign("2026-09-07", "Redondeo de gastos", 120, "savings"),
  income("2026-09-11", "Nómina (débito)", 4200, "debit"),
  assign("2026-09-11", "Ahorro de quincena", 800, "savings"),
  assign("2026-09-11", "Reparto a Semana", 1200, "week"),
  spend("2026-09-12", "Suscripción de streaming", 219, "available", "visa"),
  income("2026-09-14", "Efectivo semanal", 1500, "cash"),
  spend("2026-09-15", "Luz", 450, "available", "debit"),
  income("2026-09-18", "Nómina (débito)", 4200, "debit"),
  assign("2026-09-18", "Reparto a Semana", 1200, "week"),
  spend("2026-09-20", "Internet", 399, "available", "debit"),
  income("2026-09-21", "Efectivo semanal", 1500, "cash"),
  assign("2026-09-21", "Efectivo para la semana", 950, "cash"),
  spend("2026-09-22", "Restaurante", 486, "week", "visa"),
  income("2026-09-25", "Nómina (débito)", 4200, "debit"),
  assign("2026-09-25", "Ahorro de quincena", 800, "savings"),
  assign("2026-09-25", "Reparto a Semana", 1200, "week"),
  spend("2026-09-27", "Súper", 488.4, "week", "debit"),
  income("2026-09-28", "Efectivo semanal", 1500, "cash"),
  assign("2026-09-28", "Efectivo para la semana", 950, "cash"),
  assign("2026-09-28", "Aportación mensual", 1000, "fund"),
  spend("2026-09-29", "Mercado", 230, "cash", "cash"),
  spend("2026-09-29", "Farmacia", 215.9, "week", "visa"),
  spend("2026-09-30", "Panadería", 48, "cash", "cash"),
  spend("2026-09-30", "Regalo de cumpleaños", 350, "week", "debit"),
  spend("2026-10-01", "Transporte", 60, "cash", "cash"),
  income("2026-10-02", "Nómina (débito)", 4200, "debit"),
  assign("2026-10-02", "Reparto a Semana", 1200, "week"),
  spend("2026-10-02", "Renta", 6500, "available", "debit"),
  { kind: "cardPayment", date: "2026-10-02", concept: "Pago de tarjeta (corte 15 sep)", amountMinor: pesos(219), accountId: "debit", toAccountId: "visa", reserveEnvelopeId: "card" },
  spend("2026-10-03", "Taquería", 140, "cash", "cash"),
  spend("2026-10-03", "Gasolina con tarjeta", 700, "week", "visa"),
  spend("2026-10-04", "Lavandería", 120, "cash", "cash"),
  spend("2026-10-04", "Súper", 612.8, "week", "debit"),
  income("2026-10-05", "Efectivo semanal", 1500, "cash"),
  assign("2026-10-05", "Efectivo para la semana", 950, "cash"),
  spend("2026-10-06", "Mercado", 210, "cash", "cash"),
  spend("2026-10-06", "Súper con tarjeta", 643.5, "week", "visa"),
  spend("2026-10-07", "Papelería", 89, "cash", "cash"),
  spend("2026-10-08", "Café", 55, "cash", "cash"),
  spend("2026-10-08", "Comida fuera", 198, "week", "debit"),
  income("2026-10-09", "Nómina (débito)", 4200, "debit"),
  assign("2026-10-09", "Ahorro de quincena", 800, "savings"),
  assign("2026-10-09", "Reparto a Semana", 1200, "week"),
  spend("2026-10-09", "Transporte", 60, "cash", "cash"),
  spend("2026-10-10", "Tortillería", 42, "cash", "cash"),
  spend("2026-10-10", "Súper", 534.2, "week", "debit"),
  spend("2026-10-11", "Mercado", 185, "cash", "cash"),
  spend("2026-10-11", "Cine", 260, "week", "debit"),
  income("2026-10-12", "Efectivo semanal", 1500, "cash"),
  assign("2026-10-12", "Efectivo para la semana", 950, "cash"),
];

/** Movimientos sembrados con ids y `createdAt` estables (el orden de la lista se conserva). */
export function seedMovements(): Movement[] {
  return SEED_DRAFTS.map((draft, index) => ({
    ...draft,
    id: `seed-${String(index + 1).padStart(3, "0")}`,
    createdAt: `${draft.date}T12:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
  }));
}
