import { useMemo, useState } from "react";
import get from "lodash/get";

import { normalizeText } from "@/utils/text";
import { useDebouncedValue } from "./useDebouncedValue";

interface SearchConfig<T> {
  /** Campos donde buscar. Acepta rutas anidadas: `"customer.name"`. */
  fields: ReadonlyArray<string | keyof T>;
}

/**
 * Búsqueda en cliente con debounce. `filteredData` se deriva de `data` y de la
 * búsqueda; no hay estado duplicado que sincronizar.
 */
const useSearch = <T>(data: T[], { fields }: SearchConfig<T>, delay = 300) => {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, delay);

  const filteredData = useMemo(() => {
    const needle = normalizeText(debouncedQuery.trim());
    if (!needle) return data;
    return data.filter((item) =>
      fields.some((field) => {
        const value = get(item, field as string);
        return value !== undefined && value !== null && normalizeText(value).includes(needle);
      }),
    );
  }, [data, fields, debouncedQuery]);

  return { query, setQuery, filteredData, isSearching: query !== debouncedQuery };
};

export default useSearch;
