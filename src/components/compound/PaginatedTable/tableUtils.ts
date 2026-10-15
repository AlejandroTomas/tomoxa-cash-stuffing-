import get from "lodash/get";

import { applyFilters } from "@/components/filters/applyFilters";
import type { FilterDef, FilterValues } from "@/components/filters/types";
import { normalizeText } from "@/utils/text";
import type { Column, SortState } from "./types";

/** Funciones puras de la tabla: buscar → filtrar → ordenar → paginar. */

export const getColumnValue = <T>(column: Column<T>, row: T): unknown =>
  column.accessor ? column.accessor(row) : get(row, column.key);

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/** Orden natural en español; los vacíos siempre al final, en cualquier dirección. */
export function compareValues(a: unknown, b: unknown): number {
  const emptyA = a === null || a === undefined || a === "";
  const emptyB = b === null || b === undefined || b === "";
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

export function searchRows<T>(rows: readonly T[], columns: Column<T>[], keys: string[], query: string): T[] {
  const needle = normalizeText(query.trim());
  if (!needle || keys.length === 0) return [...rows];
  const searchable = columns.filter((column) => keys.includes(column.key));
  return rows.filter((row) =>
    searchable.some((column) => normalizeText(getColumnValue(column, row)).includes(needle)),
  );
}

export function sortRows<T>(rows: readonly T[], columns: Column<T>[], sort: SortState): T[] {
  if (!sort) return [...rows];
  const column = columns.find((c) => c.key === sort.key);
  if (!column) return [...rows];
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = getColumnValue(column, a);
    const vb = getColumnValue(column, b);
    const result = compareValues(va, vb);
    // Los vacíos quedan al final también en descendente.
    const anyEmpty = [va, vb].some((v) => v === null || v === undefined || v === "");
    return anyEmpty ? result : result * factor;
  });
}

/** asc → desc → sin orden. */
export function nextSort(current: SortState, key: string): SortState {
  if (current?.key !== key) return { key, direction: "asc" };
  return current.direction === "asc" ? { key, direction: "desc" } : null;
}

export const pageCount = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));

export const clampPage = (page: number, total: number, pageSize: number) =>
  Math.min(Math.max(1, page), pageCount(total, pageSize));

export function processRows<T>(
  rows: readonly T[],
  options: {
    columns: Column<T>[];
    searchKeys: string[];
    search: string;
    filters: FilterDef[];
    filterValues: FilterValues;
    sort: SortState;
  },
): T[] {
  const searched = searchRows(rows, options.columns, options.searchKeys, options.search);
  const filtered = applyFilters(searched, options.filters, options.filterValues);
  return sortRows(filtered, options.columns, options.sort);
}
