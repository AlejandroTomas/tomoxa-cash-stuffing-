import get from "lodash/get";

import type { DateRangeValue, FilterDef, FilterValue, FilterValues } from "./types";

/** Funciones puras del sistema de filtros: sin React, fáciles de probar. */

const asArray = (value: FilterValue): string[] => (Array.isArray(value) ? value : []);

export const asRange = (value: FilterValue): DateRangeValue =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

/** ¿El filtro tiene un valor que aplicar? */
export function isFilterActive(value: FilterValue): boolean {
  if (typeof value === "string") return value !== "";
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(asRange(value).from);
}

/** Cuenta los filtros con valor (para el badge "Filtros (3)"). */
export const countActiveFilters = (filters: FilterDef[], values: FilterValues): number =>
  filters.filter((def) => isFilterActive(values[def.key])).length;

/** Fecha del registro como `yyyy-MM-dd` local, venga como Date, ISO o epoch. */
function toDay(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function matches(def: FilterDef, value: FilterValue, record: unknown): boolean {
  const fieldValue = get(record, def.field ?? def.key);
  switch (def.type) {
    case "select":
      return String(fieldValue ?? "") === value;
    case "multiselect": {
      const selected = asArray(value);
      // Un campo arreglo (tags) coincide si comparte al menos un valor.
      return Array.isArray(fieldValue)
        ? fieldValue.some((item) => selected.includes(String(item)))
        : selected.includes(String(fieldValue ?? ""));
    }
    case "daterange": {
      const { from, to } = asRange(value);
      const day = toDay(fieldValue);
      if (!day) return false;
      // Las fechas ISO yyyy-MM-dd se comparan bien como texto.
      return (!from || day >= from) && (!to || day <= to);
    }
  }
}

/** Filtra en cliente. Los filtros sin valor no restringen. */
export function applyFilters<T>(rows: readonly T[], filters: FilterDef[], values: FilterValues): T[] {
  const active = filters.filter((def) => isFilterActive(values[def.key]));
  if (active.length === 0) return [...rows];
  return rows.filter((row) => active.every((def) => matches(def, values[def.key], row)));
}

/**
 * Convierte los valores a query params para una API:
 * `{ status: "open", tags: ["a","b"], date: { from, to } }` →
 * `{ status: "open", tags: "a,b", dateFrom: "…", dateTo: "…" }`.
 * Ajusta los nombres en el repository si tu API espera otros.
 */
export function toQueryParams(values: FilterValues): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!isFilterActive(value)) continue;
    if (typeof value === "string") params[key] = value;
    else if (Array.isArray(value)) params[key] = value.join(",");
    else {
      const { from, to } = asRange(value);
      if (from) params[`${key}From`] = from;
      if (to) params[`${key}To`] = to;
    }
  }
  return params;
}
