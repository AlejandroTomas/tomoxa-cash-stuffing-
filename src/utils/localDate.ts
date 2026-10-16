/**
 * Fechas de calendario locales en formato "YYYY-MM-DD".
 *
 * `new Date("2026-10-06")` se interpreta como medianoche UTC y en México cae el
 * día 5: por eso todas las fechas del feature pasan por aquí.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseLocalDate(iso: string): Date {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Fecha inválida: "${iso}" (se espera YYYY-MM-DD)`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
