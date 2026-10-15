"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, SlidersHorizontal } from "lucide-react";

import { FilterBar } from "@/components/filters/FilterBar";
import { countActiveFilters } from "@/components/filters/applyFilters";
import type { FilterDef } from "@/components/filters/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ColumnVisibilityMenu, useColumnVisibility } from "./ColumnVisibilityMenu";
import { PaginationControls } from "./PaginationControls";
import { RowActionsMenu, RowContextMenu } from "./RowActions";
import { getColumnValue, nextSort } from "./tableUtils";
import type { Column, PaginatedTableProps } from "./types";
import { usePaginatedTable } from "./usePaginatedTable";

// Defaults estables: un `[]` literal sería un arreglo nuevo en cada render y rompería la memoización.
const NO_KEYS: string[] = [];
const NO_FILTERS: FilterDef[] = [];
const NO_ACTIONS: never[] = [];
const PAGE_SIZES = [10, 20, 50, 100];

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

const defaultCell = <T,>(column: Column<T>, row: T) => {
  const value = getColumnValue(column, row);
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
};

/**
 * Tabla con búsqueda, filtros (`FilterBar`), orden por columna, columnas
 * ocultables, acciones por fila (menú "⋯" y clic derecho) y paginación.
 *
 * - Modo cliente (default): recibe todos los registros y procesa en memoria.
 * - Modo servidor (`serverSide`): recibe la página actual y emite la consulta
 *   (`TableQuery`) para que el repository la pida a la API.
 *
 * Ejemplo completo en `/showcase`.
 */
export function PaginatedTable<T>({
  data,
  columns,
  getRowId = (_row, index) => String(index),
  searchKeys = NO_KEYS,
  searchPlaceholder = "Buscar…",
  filters = NO_FILTERS,
  rowActions = NO_ACTIONS,
  onRowClick,
  toolbarActions,
  tableId,
  pageSizeOptions = PAGE_SIZES,
  initialPageSize = 10,
  initialSort = null,
  loading = false,
  emptyMessage = "No hay resultados que coincidan con tu búsqueda.",
  serverSide,
  renderFooter,
}: PaginatedTableProps<T>) {
  const table = usePaginatedTable({ data, columns, searchKeys, filters, initialPageSize, initialSort, serverSide });
  const visibility = useColumnVisibility(tableId);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const visibleColumns = columns.filter((column) => visibility.isVisible(column.key));
  const activeFilters = countActiveFilters(filters, table.filterValues);
  const hasActions = rowActions.length > 0;
  const colSpan = visibleColumns.length + (hasActions ? 1 : 0);

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {searchKeys.length > 0 && (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={table.search}
              onChange={(event) => table.setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
              aria-label="Buscar en la tabla"
            />
          </div>
        )}
        <div className="flex items-center gap-2 sm:ml-auto">
          {filters.length > 0 && (
            <Button
              variant={filtersOpen || activeFilters > 0 ? "secondary" : "outline"}
              size="sm"
              className="h-9"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal /> Filtros
              {activeFilters > 0 && (
                <Badge className="ml-1 h-5 min-w-5 px-1 tabular-nums">{activeFilters}</Badge>
              )}
            </Button>
          )}
          <ColumnVisibilityMenu
            columns={columns}
            isVisible={visibility.isVisible}
            onToggle={visibility.toggle}
            onShowAll={visibility.showAll}
          />
          {toolbarActions}
        </div>
      </div>

      {filters.length > 0 && (filtersOpen || activeFilters > 0) && (
        <FilterBar
          filters={filters}
          values={table.filterValues}
          onChange={table.setFilterValues}
          showControls={filtersOpen}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {visibleColumns.map((column) => {
                const sorted = table.sort?.key === column.key ? table.sort.direction : null;
                const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
                return (
                  <TableHead
                    key={column.key}
                    className={cn("px-4", ALIGN[column.align ?? "left"], column.className)}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        className={cn(
                          "-mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-accent hover:text-accent-foreground",
                          sorted && "text-foreground",
                        )}
                        onClick={() => table.setSort(nextSort(table.sort, column.key))}
                      >
                        {column.header}
                        <SortIcon className={cn("size-3.5", !sorted && "opacity-40")} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                );
              })}
              {hasActions && <TableHead className="w-12" aria-label="Acciones" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: Math.min(table.pageSize, 5) }, (_, index) => (
                <TableRow key={`skeleton-${index}`} className="hover:bg-transparent">
                  {Array.from({ length: colSpan }, (_, cell) => (
                    <TableCell key={cell} className="px-4">
                      <Skeleton className="h-4 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colSpan} className="py-12 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.rows.map((row, index) => (
                <RowContextMenu key={getRowId(row, index)} actions={rowActions} row={row}>
                  <TableRow
                    className={cn(onRowClick && "cursor-pointer")}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {visibleColumns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn("px-4", ALIGN[column.align ?? "left"], column.className)}
                      >
                        {column.cell ? column.cell(row) : defaultCell(column, row)}
                      </TableCell>
                    ))}
                    {hasActions && (
                      <TableCell className="px-2 text-right">
                        <RowActionsMenu actions={rowActions} row={row} />
                      </TableCell>
                    )}
                  </TableRow>
                </RowContextMenu>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!serverSide && renderFooter?.([...table.filteredRows])}

      <PaginationControls
        page={table.page}
        pageSize={table.pageSize}
        total={table.total}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        pageSizeOptions={pageSizeOptions}
      />
    </div>
  );
}
