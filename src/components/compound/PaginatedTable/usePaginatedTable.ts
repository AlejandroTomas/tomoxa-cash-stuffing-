import { useEffect, useMemo, useState } from "react";

import type { FilterDef, FilterValues } from "@/components/filters/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { clampPage, processRows } from "./tableUtils";
import type { Column, ServerSideOptions, SortState, TableQuery } from "./types";

interface Options<T> {
  data: readonly T[];
  columns: Column<T>[];
  searchKeys: string[];
  filters: FilterDef[];
  initialPageSize: number;
  initialSort: SortState;
  serverSide?: ServerSideOptions;
}

/**
 * Estado de la tabla (página, tamaño, búsqueda, filtros, orden) y los datos
 * visibles. En modo cliente procesa `data`; en modo servidor solo emite
 * `onQueryChange` y muestra `data` tal cual.
 *
 * Cambiar búsqueda, filtros, orden o tamaño regresa a la página 1.
 */
export function usePaginatedTable<T>({
  data,
  columns,
  searchKeys,
  filters,
  initialPageSize,
  initialSort,
  serverSide,
}: Options<T>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [search, setSearchState] = useState("");
  const [filterValues, setFilterValuesState] = useState<FilterValues>({});
  const [sort, setSortState] = useState<SortState>(initialSort);
  const debouncedSearch = useDebouncedValue(search, 300);

  const resetting =
    <A,>(setter: (value: A) => void) =>
    (value: A) => {
      setter(value);
      setPage(1);
    };

  const processed = useMemo<readonly T[]>(
    () =>
      serverSide
        ? data
        : processRows(data, { columns, searchKeys, search: debouncedSearch, filters, filterValues, sort }),
    [serverSide, data, columns, searchKeys, debouncedSearch, filters, filterValues, sort],
  );

  const total = serverSide ? serverSide.total : processed.length;
  // Si los datos se reducen (se borró un registro, cambió un filtro), no quedarse en una página vacía.
  const currentPage = clampPage(page, total, pageSize);

  const rows = useMemo(() => {
    if (serverSide) return data;
    const start = (currentPage - 1) * pageSize;
    return processed.slice(start, start + pageSize);
  }, [serverSide, data, processed, currentPage, pageSize]);

  // Modo servidor: avisa a quien carga los datos cada vez que cambia la consulta.
  const onQueryChange = serverSide?.onQueryChange;
  const query = useMemo<TableQuery>(
    () => ({ page, pageSize, search: debouncedSearch, filters: filterValues, sort }),
    [page, pageSize, debouncedSearch, filterValues, sort],
  );
  useEffect(() => {
    onQueryChange?.(query);
  }, [onQueryChange, query]);

  return {
    rows,
    /** Registros después de buscar y filtrar, sin paginar (solo modo cliente). */
    filteredRows: processed,
    total,
    page: currentPage,
    setPage,
    pageSize,
    setPageSize: resetting(setPageSizeState),
    search,
    setSearch: resetting(setSearchState),
    filterValues,
    setFilterValues: resetting(setFilterValuesState),
    sort,
    setSort: resetting(setSortState),
  };
}
