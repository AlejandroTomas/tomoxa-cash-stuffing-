import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import type { FilterDef, FilterValues } from "@/components/filters/types";

export interface Column<T> {
  /** Identificador único. Si no hay `accessor`, también es la ruta del campo: `"customer.name"`. */
  key: string;
  /** Texto del encabezado (y del menú de columnas). */
  header: string;
  /** Valor para ordenar y buscar. Default: el campo `key` del registro. */
  accessor?: (row: T) => unknown;
  /** Cómo se pinta la celda. Default: el valor como texto. */
  cell?: (row: T) => ReactNode;
  sortable?: boolean;
  /** Se puede ocultar desde el menú de columnas. Default true. */
  hideable?: boolean;
  align?: "left" | "center" | "right";
  className?: string;
}

export interface RowAction<T> {
  label: string;
  icon?: LucideIcon;
  onSelect: (row: T) => void;
  variant?: "default" | "destructive";
  hidden?: (row: T) => boolean;
  disabled?: (row: T) => boolean;
  separatorBefore?: boolean;
}

export type SortDirection = "asc" | "desc";
export type SortState = { key: string; direction: SortDirection } | null;

/** Lo que la tabla le pide a una API en modo servidor. */
export interface TableQuery {
  page: number;
  pageSize: number;
  search: string;
  filters: FilterValues;
  sort: SortState;
}

export interface ServerSideOptions {
  /** Total de registros en el servidor (para calcular páginas). */
  total: number;
  /** Se llama cada vez que cambia la página, búsqueda (con debounce), filtros u orden. */
  onQueryChange: (query: TableQuery) => void;
}

export interface PaginatedTableProps<T> {
  /** En modo cliente: todos los registros. En modo servidor: la página actual. */
  data: readonly T[];
  columns: Column<T>[];
  getRowId?: (row: T, index: number) => string;
  /** Columnas (por `key`) donde busca la caja de búsqueda. Sin esto no hay búsqueda. */
  searchKeys?: string[];
  searchPlaceholder?: string;
  filters?: FilterDef[];
  /** Acciones por fila: menú "⋯" y clic derecho. */
  rowActions?: RowAction<T>[];
  onRowClick?: (row: T) => void;
  /** Botones extra junto a la búsqueda ("Nuevo", "Exportar"…). */
  toolbarActions?: ReactNode;
  /** Persiste las columnas visibles en este navegador. */
  tableId?: string;
  pageSizeOptions?: number[];
  initialPageSize?: number;
  initialSort?: SortState;
  loading?: boolean;
  emptyMessage?: string;
  /** Datos paginados por una API en vez de en cliente. */
  serverSide?: ServerSideOptions;
  /** Pie con totales u otra información sobre los registros filtrados (modo cliente). */
  renderFooter?: (filteredRows: T[]) => ReactNode;
}
