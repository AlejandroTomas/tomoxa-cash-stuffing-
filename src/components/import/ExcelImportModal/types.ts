import type { ReactNode } from "react";

export type ImportFieldType = "string" | "number" | "boolean" | "date" | "enum";

export interface ImportFieldEnumOption {
  value: string;
  label: string;
}

export interface ImportField {
  /** Propiedad destino en la fila importada: `"precioVenta"`. */
  key: string;
  /** Texto para el usuario. También se usa para mapear la columna automáticamente. */
  label: string;
  type: ImportFieldType;
  required: boolean;
  /** Otros encabezados de columna que significan este campo: `["precio", "pv"]`. */
  aliases?: string[];
  enumOptions?: ImportFieldEnumOption[];
  defaultValue?: string | number | boolean;
  helpText?: string;
  /** Validación extra sobre el valor ya convertido. Devuelve el mensaje de error o null. */
  validate?: (value: unknown, row: Record<string, unknown>) => string | null;
}

/** Un tipo de dato importable ("Productos", "Clientes"…). */
export interface ImportActionConfig {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  fields: ImportField[];
}

export type ExcelRow = Record<string, unknown>;
/** `fieldKey` → nombre de la columna del Excel (`""` = sin mapear). */
export type ColumnMapping = Record<string, string>;

export interface RowError {
  /** Índice 0-based dentro de los datos del Excel. La fila visible en Excel es `rowIndex + 2`. */
  rowIndex: number;
  field: string;
  message: string;
}

export interface ValidationResult {
  validRows: Array<Record<string, unknown>>;
  invalidRowIndexes: Set<number>;
  errors: RowError[];
}
