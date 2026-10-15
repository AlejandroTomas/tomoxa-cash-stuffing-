import type { LucideIcon } from "lucide-react";

/**
 * Contratos del sistema de filtros. Un `FilterBar` se configura con un arreglo
 * de definiciones; los valores viven en un objeto plano (`FilterValues`) que se
 * puede aplicar en cliente (`applyFilters`) o mandar a una API (`toQueryParams`).
 */
export interface FilterOption {
  value: string;
  label: string;
}

/** Rango de fechas en ISO `yyyy-MM-dd`: serializable y estable para la URL. */
export interface DateRangeValue {
  from?: string;
  to?: string;
}

interface BaseDef {
  /** Llave del valor en `FilterValues` y, por defecto, campo del registro a comparar. */
  key: string;
  label: string;
  icon?: LucideIcon;
  /**
   * Campo del registro a comparar en cliente si no coincide con `key`. Acepta
   * rutas anidadas: `"customer.city"`.
   */
  field?: string;
}

export type FilterDef =
  | (BaseDef & { type: "select"; options: FilterOption[]; placeholder?: string })
  | (BaseDef & { type: "multiselect"; options: FilterOption[]; placeholder?: string })
  | (BaseDef & { type: "daterange"; /** Presets Hoy/Semana/Mes. Default true. */ presets?: boolean });

export type FilterValue = string | string[] | DateRangeValue | undefined;

export type FilterValues = Record<string, FilterValue>;

/** Chip de un filtro activo: etiqueta legible y cómo quitarlo. */
export interface ActiveChip {
  id: string;
  label: string;
  onRemove: () => void;
}
