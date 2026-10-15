import { z } from "zod";

import { processRows } from "@/components/compound/PaginatedTable/tableUtils";
import type { Column } from "@/components/compound/PaginatedTable/types";
import type { FilterDef } from "@/components/filters/types";
import { ValidationError } from "@/core/errors";
import { ok, route } from "@/core/http/server";
import { DEMO_CUSTOMERS, type DemoCustomer } from "@/app/showcase/_data/customers";

/**
 * API de ejemplo para la tabla en modo servidor del showcase. Muestra el patrón:
 * validar query params con Zod → consultar → responder `ApiResult` con `ok()`.
 *
 * Aquí se filtra en memoria reutilizando las funciones puras de la tabla; una
 * API real lo haría en la base de datos.
 */
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().default(""),
  status: z.string().optional(),
  city: z.string().optional(),
  tags: z.string().optional(), // "vip,crédito"
  createdAtFrom: z.string().optional(),
  createdAtTo: z.string().optional(),
  sortKey: z.enum(["name", "city", "balance", "createdAt"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

const columns: Column<DemoCustomer>[] = [
  { key: "name", header: "Nombre" },
  { key: "email", header: "Correo" },
  { key: "city", header: "Ciudad" },
  { key: "balance", header: "Saldo" },
  { key: "createdAt", header: "Alta" },
];

const filters: FilterDef[] = [
  { key: "status", label: "Estado", type: "select", options: [] },
  { key: "city", label: "Ciudad", type: "select", options: [] },
  { key: "tags", label: "Etiquetas", type: "multiselect", options: [] },
  { key: "createdAt", label: "Alta", type: "daterange" },
];

export const GET = route("api.showcase.customers", async (request) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) throw new ValidationError("Parámetros de consulta inválidos.");
  const query = parsed.data;

  const rows = processRows([...DEMO_CUSTOMERS], {
    columns,
    searchKeys: ["name", "email", "city"],
    search: query.search,
    filters,
    filterValues: {
      status: query.status,
      city: query.city,
      tags: query.tags ? query.tags.split(",") : undefined,
      createdAt: { from: query.createdAtFrom, to: query.createdAtTo },
    },
    sort: query.sortKey ? { key: query.sortKey, direction: query.sortDir } : null,
  });

  const start = (query.page - 1) * query.pageSize;
  return ok({ rows: rows.slice(start, start + query.pageSize), total: rows.length });
});
