import { z } from "zod";
import type { EnvelopeIcon } from "../mocks/envelopes.mock";

/** Colores de plástico disponibles al editar un sobre (paleta de datos, igual en ambos temas). */
export const ENVELOPE_PALETTE = ["#7f9fe6", "#ee8586", "#7cc3a3", "#ecb46c", "#ad94db", "#949eae", "#e48fb6", "#6fbcc6"] as const;

export const ENVELOPE_ICON_OPTIONS: readonly EnvelopeIcon[] = ["wallet", "card", "piggy", "banknote", "calendar", "chart"];

export const ENVELOPE_NAME_MAX = 16;
export const ENVELOPE_DESCRIPTION_MAX = 60;

export interface EnvelopeStyle {
  name: string;
  /** Para qué es el sobre; puede quedar vacía. */
  description: string;
  color: string;
  icon: EnvelopeIcon;
}

/** Esquema del formulario "Editar sobre". `otherNames`: los demás sobres (no se repiten nombres). */
export function envelopeStyleSchema(otherNames: readonly string[]) {
  const taken = new Set(otherNames.map((name) => name.trim().toLocaleLowerCase("es")));
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, "Ponle un nombre al sobre.")
      .max(ENVELOPE_NAME_MAX, `Máximo ${ENVELOPE_NAME_MAX} caracteres.`)
      .refine((name) => !taken.has(name.toLocaleLowerCase("es")), "Ya hay un sobre con ese nombre."),
    description: z.string().trim().max(ENVELOPE_DESCRIPTION_MAX, `Máximo ${ENVELOPE_DESCRIPTION_MAX} caracteres.`),
    color: z.string().refine((color) => (ENVELOPE_PALETTE as readonly string[]).includes(color), "Elige un color."),
    icon: z.enum(ENVELOPE_ICON_OPTIONS as [EnvelopeIcon, ...EnvelopeIcon[]], { message: "Elige un icono." }),
  });
}

/** Tono claro del papel dentro del sobre: el color mezclado con blanco. */
export function toneFor(color: string, white = 0.85): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return "#ffffff";
  const value = Number.parseInt(match[1], 16);
  const channels = [value >> 16, (value >> 8) & 0xff, value & 0xff].map((channel) => Math.round(channel + (255 - channel) * white));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
