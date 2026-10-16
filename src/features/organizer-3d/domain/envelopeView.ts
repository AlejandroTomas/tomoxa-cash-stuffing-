import type { Envelope, EnvelopeBudget, EnvelopeIcon } from "@/features/ledger/domain/types";
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

/** Sobre vecino en la lista (circular). Sin sobre activo, `1` da el primero y `-1` el último. */
export function neighborEnvelope(ids: readonly EnvelopeId[], activeId: EnvelopeId | null, direction: -1 | 1): EnvelopeId | null {
  if (!ids.length) return null;
  const current = activeId ? ids.indexOf(activeId) : -1;
  const index = current === -1 ? (direction === 1 ? 0 : ids.length - 1) : (current + direction + ids.length) % ids.length;
  return ids[index];
}
