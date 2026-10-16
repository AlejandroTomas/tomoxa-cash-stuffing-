import { z } from "zod";
import { BUDGET_MAX_MINOR } from "@/features/ledger/domain/budget";
import { minorToInput, parseAmountMinor } from "@/features/ledger/domain/money";
import type { BudgetPeriod, EnvelopeBudget } from "@/features/ledger/domain/types";
import type { EnvelopeIcon } from "../domain/envelopeView";

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
  /** Al guardar siempre viene (`undefined` = sin presupuesto); la vista previa no lo usa. */
  budget?: EnvelopeBudget;
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

/** Formulario "Editar sobre": el estilo más el presupuesto (el monto llega como texto). */
export interface EnvelopeForm extends Omit<EnvelopeStyle, "budget"> {
  budgetPeriod: BudgetPeriod | "none";
  budgetAmount: string;
}

export function envelopeFormSchema(otherNames: readonly string[]) {
  return envelopeStyleSchema(otherNames)
    .extend({ budgetPeriod: z.enum(["none", "week", "month"]), budgetAmount: z.string() })
    .superRefine((form, ctx) => {
      if (form.budgetPeriod === "none") return;
      const amount = parseAmountMinor(form.budgetAmount);
      if (amount === null || amount > BUDGET_MAX_MINOR) ctx.addIssue({ code: "custom", path: ["budgetAmount"], message: "Escribe cuánto piensas gastar." });
    });
}

export const envelopeFormDefaults = (style: EnvelopeStyle): EnvelopeForm => ({
  name: style.name,
  description: style.description,
  color: style.color,
  icon: style.icon,
  budgetPeriod: style.budget?.period ?? "none",
  budgetAmount: style.budget ? minorToInput(style.budget.amountMinor) : "",
});

/** Formulario ya validado → estilo a guardar (con `budget` explícito para poder quitarlo). */
export function envelopeFromForm({ budgetPeriod, budgetAmount, ...style }: EnvelopeForm): EnvelopeStyle {
  const amountMinor = parseAmountMinor(budgetAmount);
  return { ...style, budget: budgetPeriod === "none" || amountMinor === null ? undefined : { amountMinor, period: budgetPeriod } };
}

/** Tono claro del papel dentro del sobre: el color mezclado con blanco. */
export function toneFor(color: string, white = 0.85): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return "#ffffff";
  const value = Number.parseInt(match[1], 16);
  const channels = [value >> 16, (value >> 8) & 0xff, value & 0xff].map((channel) => Math.round(channel + (255 - channel) * white));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
