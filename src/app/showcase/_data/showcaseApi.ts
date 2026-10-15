import type { TableQuery } from "@/components/compound/PaginatedTable/types";
import { toQueryParams } from "@/components/filters/applyFilters";
import { http, type RequestOptions } from "@/core/http";
import type { DemoCustomer } from "./customers";

export { isCanceled } from "@/core/http";

/**
 * Acceso a datos del showcase. En un feature real esto es su `repositories/`:
 * los componentes nunca importan `core/http` directamente (ESLint lo prohíbe).
 */
export interface DemoNote {
  id: string;
  text: string;
  done: boolean;
  version: number;
}
export type DemoServerMode = "ok" | "down" | "reject";

export const showcaseApi = {
  /** Traduce la consulta de la tabla (modo servidor) a query params de la API. */
  customersPage: (query: TableQuery, signal?: RequestOptions["signal"]) =>
    http.get<{ rows: DemoCustomer[]; total: number }>("/api/showcase/customers", {
      signal,
      params: {
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        ...toQueryParams(query.filters),
        ...(query.sort ? { sortKey: query.sort.key, sortDir: query.sort.direction } : {}),
      },
    }),

  notes: () => http.get<DemoNote[]>("/api/showcase/notes"),
  serverMode: () => http.get<{ mode: DemoServerMode }>("/api/showcase/notes/server-mode"),
  setServerMode: (mode: DemoServerMode) => http.post("/api/showcase/notes/server-mode", { mode }),
};
