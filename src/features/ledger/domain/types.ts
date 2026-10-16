/**
 * Libro de movimientos: tipos del dominio. Montos siempre en centavos (enteros
 * positivos) y fechas locales "YYYY-MM-DD" (ver `@/utils/localDate`).
 */

/** Dónde está físicamente el dinero (o la deuda). */
export type AccountKind = "debit" | "cash" | "credit";

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  archived: boolean;
  /** Solo tarjetas de crédito. */
  card?: CardSettings;
}

export interface CardSettings {
  /** Día del mes del corte (1–31; en meses más cortos cae el último día). */
  cutoffDay: number;
  /** Días después del corte para pagar sin intereses. */
  paymentDays: number;
  /** Sobre donde se reserva lo que se gasta con esta tarjeta. */
  reserveEnvelopeId: string;
}

export type EnvelopeIcon = "wallet" | "card" | "piggy" | "banknote" | "calendar" | "chart";

/** Para qué está apartado el dinero. */
export interface Envelope {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: EnvelopeIcon;
  /** Posición en la carpeta (menor = más atrás/arriba). */
  order: number;
  /** Archivado: no aparece en la carpeta; su historial se conserva. */
  archived: boolean;
}

export type MovementKind = "income" | "expense" | "assignment" | "accountTransfer" | "cardPayment" | "reversal";

/**
 * Registro inmutable. Para corregir se crea un `reversal` que lo cancela.
 * Qué campos usa cada tipo:
 * - income:          accountId (débito/efectivo) → envelopeId
 * - expense:         accountId (cualquiera) ← envelopeId; con crédito usa reserveEnvelopeId
 * - assignment:      envelopeId → toEnvelopeId
 * - accountTransfer: accountId → toAccountId (débito/efectivo)
 * - cardPayment:     accountId (débito/efectivo) → toAccountId (crédito); consume reserveEnvelopeId
 * - reversal:        reversalOf
 */
export interface Movement {
  id: string;
  kind: MovementKind;
  date: string;
  /** Instante de registro (ISO); desempata el orden dentro de un mismo día. */
  createdAt: string;
  amountMinor: number;
  concept: string;
  accountId?: string;
  toAccountId?: string;
  envelopeId?: string;
  toEnvelopeId?: string;
  reserveEnvelopeId?: string;
  reversalOf?: string;
}

/** Datos del libro que hacen falta para calcular saldos y validar. */
export interface LedgerSnapshot {
  accounts: readonly Account[];
  envelopes: readonly Envelope[];
  movements: readonly Movement[];
}

/** Ingreso recurrente (recordatorio; no se registra solo). */
export interface RecurringIncome {
  id: string;
  label: string;
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  accountId: string;
}

export interface LedgerSettings {
  recurringIncome: RecurringIncome[];
  weekStartsOn: 0 | 1;
  currency: "MXN";
}
