import type { Balances } from "./balances";
import { isValidBudget } from "./budget";
import type { Account, Envelope, EnvelopeIcon } from "./types";

/** Sobre donde entran los ingresos sin asignar; no se archiva. */
export const UNASSIGNED_ENVELOPE_ID = "available";

export const ENVELOPE_NAME_MAX = 16;
/** Cuántos sobres activos caben en la carpeta con sus etiquetas legibles. */
export const MAX_ACTIVE_ENVELOPES = 8;
export const ENVELOPE_DESCRIPTION_MAX = 60;
export const ENVELOPE_ICONS: readonly EnvelopeIcon[] = ["wallet", "card", "piggy", "banknote", "calendar", "chart"];

export interface EnvelopeIssue {
  code: "INVALID_NAME" | "NAME_TAKEN" | "TOO_MANY" | "INVALID_DESCRIPTION" | "INVALID_COLOR" | "INVALID_ICON" | "INVALID_BUDGET" | "PROTECTED" | "NOT_EMPTY";
  field: "name" | "description" | "color" | "icon" | "budget" | "form";
  message: string;
}

const normalize = (name: string) => name.trim().toLocaleLowerCase("es");

/** Reglas para crear o editar un sobre. `envelopes` son todos los existentes. */
export function checkEnvelope(envelope: Envelope, envelopes: readonly Envelope[]): EnvelopeIssue | null {
  const isNew = !envelopes.some((other) => other.id === envelope.id);
  if (isNew && envelopes.filter((other) => !other.archived).length >= MAX_ACTIVE_ENVELOPES) {
    return { code: "TOO_MANY", field: "form", message: `Caben ${MAX_ACTIVE_ENVELOPES} sobres en la carpeta: archiva uno para crear otro.` };
  }
  const name = envelope.name.trim();
  if (!name || name.length > ENVELOPE_NAME_MAX) return { code: "INVALID_NAME", field: "name", message: `Ponle un nombre (máximo ${ENVELOPE_NAME_MAX} caracteres).` };
  if (envelopes.some((other) => other.id !== envelope.id && !other.archived && normalize(other.name) === normalize(name))) {
    return { code: "NAME_TAKEN", field: "name", message: "Ya hay un sobre con ese nombre." };
  }
  if (envelope.description.trim().length > ENVELOPE_DESCRIPTION_MAX) {
    return { code: "INVALID_DESCRIPTION", field: "description", message: `Máximo ${ENVELOPE_DESCRIPTION_MAX} caracteres.` };
  }
  if (!/^#[0-9a-f]{6}$/i.test(envelope.color)) return { code: "INVALID_COLOR", field: "color", message: "Elige un color." };
  if (!ENVELOPE_ICONS.includes(envelope.icon)) return { code: "INVALID_ICON", field: "icon", message: "Elige un icono." };
  if (envelope.budget && !isValidBudget(envelope.budget)) return { code: "INVALID_BUDGET", field: "budget", message: "Escribe un presupuesto mayor que cero." };
  return null;
}

/** Archivar: no el sobre de ingresos ni la reserva de una tarjeta, y solo vacío (para no perder dinero de vista). */
export function checkArchive(envelope: Envelope, balances: Balances, accounts: readonly Account[]): EnvelopeIssue | null {
  if (envelope.id === UNASSIGNED_ENVELOPE_ID) return { code: "PROTECTED", field: "form", message: "Disponible no se puede archivar: ahí entran los ingresos." };
  const card = accounts.find((account) => !account.archived && account.card?.reserveEnvelopeId === envelope.id);
  if (card) return { code: "PROTECTED", field: "form", message: `Este sobre es la reserva de ${card.name}; no se puede archivar.` };
  const balance = balances.envelopes[envelope.id] ?? 0;
  if (balance !== 0) return { code: "NOT_EMPTY", field: "form", message: "Primero mueve su dinero a otro sobre: solo se archivan sobres vacíos." };
  return null;
}
