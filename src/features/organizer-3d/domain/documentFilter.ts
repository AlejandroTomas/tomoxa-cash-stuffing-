import { addDays, format, startOfMonth, startOfWeek, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { sortByRecent, type EnvelopeDocument } from "./document";
import { parseLocalDate, toLocalIsoDate } from "@/utils/localDate";

/** Qué fechas se buscan dentro del sobre. Fechas siempre "YYYY-MM-DD" locales. */
export type DateFilter =
  | { type: "all" }
  /** 0 = domingo … 6 = sábado (como `Date#getDay`). */
  | { type: "weekday"; weekday: number }
  | { type: "date"; date: string }
  /** Semana de lunes a domingo; `weekStart` es el lunes. */
  | { type: "week"; weekStart: string }
  /** `month` = "YYYY-MM". */
  | { type: "month"; month: string };

export interface DocumentFilter {
  date: DateFilter;
  /** Texto libre sobre el concepto (sin distinguir acentos ni mayúsculas). */
  text: string;
}

export const EMPTY_FILTER: DocumentFilter = { date: { type: "all" }, text: "" };

const WEEK_OPTIONS = { weekStartsOn: 1 } as const;

/** Lunes de la semana que contiene `date`. */
export function weekStartOf(date: string | Date): string {
  const day = typeof date === "string" ? parseLocalDate(date) : date;
  return toLocalIsoDate(startOfWeek(day, WEEK_OPTIONS));
}

/** Accesos rápidos, relativos a `today` (inyectado para poder probarlos). */
export const quickFilters = {
  today: (today: Date): DateFilter => ({ type: "date", date: toLocalIsoDate(today) }),
  thisWeek: (today: Date): DateFilter => ({ type: "week", weekStart: weekStartOf(today) }),
  lastWeek: (today: Date): DateFilter => ({ type: "week", weekStart: weekStartOf(subWeeks(today, 1)) }),
  thisMonth: (today: Date): DateFilter => ({ type: "month", month: toLocalIsoDate(startOfMonth(today)).slice(0, 7) }),
};

/** Minúsculas y sin acentos: "Súper" ≈ "super". */
export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function matchesDate(iso: string, filter: DateFilter): boolean {
  switch (filter.type) {
    case "all":
      return true;
    case "weekday":
      return parseLocalDate(iso).getDay() === filter.weekday;
    case "date":
      return iso === filter.date;
    case "week": {
      const end = toLocalIsoDate(addDays(parseLocalDate(filter.weekStart), 6));
      return iso >= filter.weekStart && iso <= end;
    }
    case "month":
      return iso.startsWith(`${filter.month}-`);
  }
}

/** Documentos que cumplen el filtro, más recientes primero. */
export function filterDocuments(documents: readonly EnvelopeDocument[], filter: DocumentFilter): EnvelopeDocument[] {
  const text = normalizeText(filter.text);
  return sortByRecent(documents.filter((document) => matchesDate(document.date, filter.date) && (!text || normalizeText(document.concept).includes(text))));
}

export function isEmptyFilter(filter: DocumentFilter): boolean {
  return filter.date.type === "all" && !normalizeText(filter.text);
}

const WEEKDAYS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function describeWeek(weekStart: string): string {
  const start = parseLocalDate(weekStart);
  const end = addDays(start, 6);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  if (sameMonth) return `Semana del ${format(start, "d")} al ${format(end, "d 'de' MMM", { locale: es })}`;
  const pattern = sameYear ? "d 'de' MMM" : "d 'de' MMM 'de' yyyy";
  return `Semana del ${format(start, pattern, { locale: es })} al ${format(end, pattern, { locale: es })}`;
}

function describeDate(filter: DateFilter): string {
  switch (filter.type) {
    case "all":
      return "Todos los movimientos";
    case "weekday":
      return `Los ${WEEKDAYS[filter.weekday] ?? "días"}`;
    case "date":
      return `El ${format(parseLocalDate(filter.date), "d 'de' MMMM", { locale: es })}`;
    case "week":
      return describeWeek(filter.weekStart);
    case "month":
      return capitalize(format(parseLocalDate(`${filter.month}-01`), "MMMM 'de' yyyy", { locale: es }));
  }
}

/**
 * La frase que se muestra en caligrafía. Se genera del mismo filtro que se
 * aplica, así lo que se lee siempre coincide con lo que se ve.
 */
export function describeFilter(filter: DocumentFilter): string {
  const text = filter.text.trim();
  if (!text) return describeDate(filter.date);
  if (filter.date.type === "all") return `Buscando “${text}”`;
  return `${describeDate(filter.date)} · “${text}”`;
}
