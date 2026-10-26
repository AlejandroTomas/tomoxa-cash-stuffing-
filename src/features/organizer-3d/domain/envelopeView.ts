import type { Account, Envelope, EnvelopeBudget, EnvelopeIcon } from "@/features/ledger/domain/types";
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
  /** Es la reserva de una tarjeta de crédito: la carpeta la muestra como tarjeta en el tarjetero. */
  card?: CardFace;
}

/** Lo que se imprime en la tarjeta del tarjetero. */
export interface CardFace {
  /** Nombre de la tarjeta (la cuenta), p. ej. "Nu". */
  name: string;
  /** Deuda en pesos. */
  debt: number;
}

/** Reserva de cada tarjeta activa: id del sobre → cara de la tarjeta. */
export function cardFaces(accounts: readonly Account[], debtMinor: Readonly<Record<string, number>>): Map<EnvelopeId, CardFace> {
  const faces = new Map<EnvelopeId, CardFace>();
  for (const account of accounts) {
    if (account.archived || !account.card) continue;
    faces.set(account.card.reserveEnvelopeId, { name: account.name, debt: (debtMinor[account.id] ?? 0) / 100 });
  }
  return faces;
}

export function toEnvelopeItem(envelope: Envelope, balanceMinor: number, card?: CardFace): EnvelopeItem {
  return {
    id: envelope.id,
    name: envelope.name,
    description: envelope.description,
    color: envelope.color,
    tone: toneFor(envelope.color),
    icon: envelope.icon,
    amount: balanceMinor / 100,
    ...(envelope.budget ? { budget: envelope.budget } : {}),
    ...(card ? { card } : {}),
  };
}

/**
 * Sobres que se muestran en el organizador: los activos. Las reservas de
 * tarjeta se ven siempre: en la carpeta son tarjetas del tarjetero (no ocupan
 * lugar en la pila de sobres) y en los otros estilos, una pieza más.
 */
export function visibleEnvelopes(active: readonly Envelope[]): Envelope[] {
  return [...active];
}

/** Sobre vecino en la lista (circular). Sin sobre activo, `1` da el primero y `-1` el último. */
export function neighborEnvelope(ids: readonly EnvelopeId[], activeId: EnvelopeId | null, direction: -1 | 1): EnvelopeId | null {
  if (!ids.length) return null;
  const current = activeId ? ids.indexOf(activeId) : -1;
  const index = current === -1 ? (direction === 1 ? 0 : ids.length - 1) : (current + direction + ids.length) % ids.length;
  return ids[index];
}
