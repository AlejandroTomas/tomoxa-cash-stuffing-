import * as XLSX from "xlsx";

import type { ExcelRow, ImportActionConfig } from "./types";

export const ACCEPTED_EXTENSIONS = /\.(xlsx|xls|csv)$/i;

/** Lee la primera hoja: encabezados (primera fila) y filas como objetos. */
export async function readSpreadsheet(file: File): Promise<{ columns: string[]; rows: ExcelRow[] }> {
  const buffer = await file.arrayBuffer();
  // `cellDates`: las fechas llegan como Date y no como número de serie.
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { columns: [], rows: [] };

  const [header = []] = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const columns = header.map((cell) => String(cell ?? "").trim()).filter(Boolean);
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: null, blankrows: false });
  return { columns, rows };
}

const TYPE_HINTS = { string: "Texto", number: "Número", boolean: "Sí / No", date: "Fecha (aaaa-mm-dd)", enum: "" };

/**
 * Descarga un .xlsx con los encabezados esperados (hoja 1, lista para llenar) y
 * una hoja "Instrucciones" con el tipo, si es obligatorio y los valores válidos.
 */
export function downloadTemplate(action: ImportActionConfig): void {
  const data = XLSX.utils.aoa_to_sheet([action.fields.map((field) => field.label)]);
  const instructions = XLSX.utils.aoa_to_sheet([
    ["Columna", "Tipo", "Obligatorio", "Valores válidos / notas"],
    ...action.fields.map((field) => [
      field.label,
      field.type === "enum" ? "Lista" : TYPE_HINTS[field.type],
      field.required && field.defaultValue === undefined ? "Sí" : "No",
      field.type === "enum"
        ? (field.enumOptions ?? []).map((option) => option.label).join(", ")
        : (field.helpText ?? ""),
    ]),
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, data, action.label.slice(0, 31));
  XLSX.utils.book_append_sheet(workbook, instructions, "Instrucciones");
  XLSX.writeFile(workbook, `plantilla-${action.value}.xlsx`);
}
