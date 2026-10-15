import { normalizeText } from "@/utils/text";
import type { ColumnMapping, ExcelRow, ImportField, RowError, ValidationResult } from "./types";

/** Funciones puras de la importación: convertir, validar y mapear columnas. */

const TRUTHY = new Set(["true", "1", "si", "sí", "yes", "x", "verdadero"]);
const FALSY = new Set(["false", "0", "no", "falso"]);

const isEmpty = (raw: unknown) => raw === null || raw === undefined || String(raw).trim() === "";

/** `yyyy-MM-dd` en hora local. */
const toIsoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * Fecha de una celda: `Date` (lectura con `cellDates`), número de serie de Excel
 * (días desde 1899-12-30), `yyyy-MM-dd` o `dd/MM/yyyy`.
 */
export function parseExcelDate(raw: unknown): string | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : toIsoDay(raw);
  if (typeof raw === "number" && raw > 0 && raw < 2958466) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(raw * 86400000));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }
  const text = String(raw).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  const latin = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : latin
      ? [Number(latin[3]), Number(latin[2]), Number(latin[1])]
      : [NaN, NaN, NaN];
  const date = new Date(year, month - 1, day);
  // Rechaza fechas imposibles (31/02) que `Date` desbordaría al mes siguiente.
  if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return toIsoDay(date);
}

export function coerceValue(raw: unknown, field: ImportField): { value: unknown; error: string | null } {
  if (isEmpty(raw)) {
    if (field.defaultValue !== undefined) return { value: field.defaultValue, error: null };
    if (field.required) return { value: null, error: `"${field.label}" es obligatorio` };
    return { value: undefined, error: null };
  }

  switch (field.type) {
    case "string":
      return { value: String(raw).trim(), error: null };

    case "number": {
      // Acepta "1,234.50", "$1,234.50" y "1234,5".
      const text = String(raw).replace(/[$\s]/g, "");
      const normalized = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text) ? text.replace(/,/g, "") : text.replace(",", ".");
      const num = typeof raw === "number" ? raw : Number(normalized);
      return Number.isNaN(num)
        ? { value: null, error: `"${field.label}" debe ser un número (recibido: "${String(raw)}")` }
        : { value: num, error: null };
    }

    case "boolean": {
      const normalized = normalizeText(raw).trim();
      if (TRUTHY.has(normalized)) return { value: true, error: null };
      if (FALSY.has(normalized)) return { value: false, error: null };
      return { value: null, error: `"${field.label}" debe ser sí/no (recibido: "${String(raw)}")` };
    }

    case "date": {
      const day = parseExcelDate(raw);
      return day
        ? { value: day, error: null }
        : { value: null, error: `"${field.label}" no es una fecha válida (recibido: "${String(raw)}")` };
    }

    case "enum": {
      const normalized = normalizeText(raw).trim();
      const match = field.enumOptions?.find(
        (option) => normalizeText(option.value) === normalized || normalizeText(option.label) === normalized,
      );
      if (!match) {
        const allowed = field.enumOptions?.map((option) => option.label).join(", ");
        return { value: null, error: `"${field.label}" debe ser uno de: ${allowed} (recibido: "${String(raw)}")` };
      }
      return { value: match.value, error: null };
    }
  }
}

export function validateAndMapRows(
  excelData: ExcelRow[],
  mapping: ColumnMapping,
  fields: ImportField[],
): ValidationResult {
  const validRows: Array<Record<string, unknown>> = [];
  const invalidRowIndexes = new Set<number>();
  const errors: RowError[] = [];

  excelData.forEach((row, rowIndex) => {
    const mapped: Record<string, unknown> = {};
    const rowErrors: RowError[] = [];

    for (const field of fields) {
      const column = mapping[field.key];
      const { value, error } = coerceValue(column ? row[column] : undefined, field);
      if (error) rowErrors.push({ rowIndex, field: field.key, message: error });
      else if (value !== undefined) mapped[field.key] = value;
    }

    // Las validaciones propias corren con la fila completa ya convertida.
    for (const field of fields) {
      if (!field.validate || !(field.key in mapped)) continue;
      const message = field.validate(mapped[field.key], mapped);
      if (message) rowErrors.push({ rowIndex, field: field.key, message });
    }

    if (rowErrors.length > 0) {
      invalidRowIndexes.add(rowIndex);
      errors.push(...rowErrors);
    } else {
      validRows.push(mapped);
    }
  });

  return { validRows, invalidRowIndexes, errors };
}

export const allRequiredMapped = (mapping: ColumnMapping, fields: ImportField[]): boolean =>
  fields.filter((field) => field.required && field.defaultValue === undefined).every((field) => Boolean(mapping[field.key]));

const compact = (text: string) => normalizeText(text).replace(/[^a-z0-9]/g, "");

/**
 * Propone el mapeo comparando encabezados con `key`, `label` y `aliases` sin
 * acentos, espacios ni signos: "Precio de venta" ↔ "precioVenta". Cada columna
 * se usa una sola vez.
 */
export function autoMapColumns(columns: string[], fields: ImportField[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const field of fields) {
    const candidates = [field.key, field.label, ...(field.aliases ?? [])].map(compact);
    const column = columns.find((col) => !used.has(col) && candidates.includes(compact(col)));
    if (column) {
      mapping[field.key] = column;
      used.add(column);
    }
  }
  return mapping;
}
