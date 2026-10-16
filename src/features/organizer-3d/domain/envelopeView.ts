import type { Envelope, EnvelopeBudget, EnvelopeIcon, Movement } from "@/features/ledger/domain/types";
import { toneFor } from "./envelopeStyle";

export type { EnvelopeIcon };
export type EnvelopeId = string;

/** Lo que la carpeta y la interfaz necesitan de un sobre (solo lectura). */
export interface EnvelopeItem {
  id: EnvelopeId;
  name: string;
  description: string;
  /** Color del plástico (paleta de datos, igual en ambos temas). */
  color: string;
  /** Tono claro del papel dentro del sobre. */
  tone: string;
  icon: EnvelopeIcon;
  /** Saldo en pesos (de solo lectura: lo calcula el libro). */
  amount: number;
  budget?: EnvelopeBudget;
}

export function toEnvelopeItem(envelope: Envelope, balanceMinor: number): EnvelopeItem {
  return {
    id: envelope.id,
    name: envelope.name,
    description: envelope.description,
    color: envelope.color,
    tone: toneFor(envelope.color),
    icon: envelope.icon,
    amount: balanceMinor / 100,
    ...(envelope.budget ? { budget: envelope.budget } : {}),
  };
}

/** En el inicio de cero, la reserva interna de tarjeta se muestra al usarla. */
export function visibleEnvelopes(
  active: readonly Envelope[],
  all: readonly Envelope[],
  movements: readonly Movement[],
  balances: Readonly<Record<string, number>>,
): Envelope[] {
  const minimalBook = !all.some((envelope) => ["savings", "cash", "week", "fund"].includes(envelope.id));
  if (!minimalBook) return [...active];
  const cardUsed = movements.some((movement) => movement.accountId === "visa" || movement.toAccountId === "visa" || movement.reserveEnvelopeId === "card");
  return active.filter((envelope) => envelope.id !== "card" || cardUsed || (balances.card ?? 0) !== 0);
}

/** Sobre vecino en la lista (circular). Sin sobre activo, `1` da el primero y `-1` el último. */
export function neighborEnvelope(ids: readonly EnvelopeId[], activeId: EnvelopeId | null, direction: -1 | 1): EnvelopeId | null {
  if (!ids.length) return null;
  const current = activeId ? ids.indexOf(activeId) : -1;
  const index = current === -1 ? (direction === 1 ? 0 : ids.length - 1) : (current + direction + ids.length) % ids.length;
  return ids[index];
}
