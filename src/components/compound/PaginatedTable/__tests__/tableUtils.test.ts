import { applyFilters, toQueryParams } from "@/components/filters/applyFilters";
import type { FilterDef } from "@/components/filters/types";
import {
  clampPage,
  compareValues,
  nextSort,
  processRows,
  sortRows,
} from "@/components/compound/PaginatedTable/tableUtils";
import type { Column } from "@/components/compound/PaginatedTable/types";

interface Row {
  id: string;
  name: string;
  city?: string;
  total: number;
  status: string;
  tags: string[];
  createdAt: string;
  customer: { email: string };
}

const rows: Row[] = [
  { id: "1", name: "Óscar Ruiz", city: "Oaxaca", total: 100, status: "open", tags: ["vip"], createdAt: "2026-10-01T10:00:00", customer: { email: "o@x.mx" } },
  { id: "2", name: "ana López", city: "", total: 20, status: "closed", tags: [], createdAt: "2026-10-05T18:30:00", customer: { email: "ana@x.mx" } },
  { id: "3", name: "Beto 10", city: "CDMX", total: 5, status: "open", tags: ["vip", "new"], createdAt: "2026-09-28T09:00:00", customer: { email: "b@y.mx" } },
  { id: "4", name: "Beto 9", total: 300, status: "draft", tags: ["new"], createdAt: "2026-10-10T00:00:00", customer: { email: "b9@y.mx" } },
];

const columns: Column<Row>[] = [
  { key: "name", header: "Nombre", sortable: true },
  { key: "city", header: "Ciudad", sortable: true },
  { key: "total", header: "Total", sortable: true },
  { key: "customer.email", header: "Correo" },
];

const ids = (list: Row[]) => list.map((row) => row.id);

describe("orden", () => {
  it("compara en español: sin acentos ni mayúsculas, números naturales", () => {
    expect(compareValues("ana", "Óscar")).toBeLessThan(0);
    expect(compareValues("Beto 9", "Beto 10")).toBeLessThan(0);
    expect(compareValues(5, 100)).toBeLessThan(0);
  });

  it("los vacíos van al final en ambas direcciones", () => {
    expect(ids(sortRows(rows, columns, { key: "city", direction: "asc" }))).toEqual(["3", "1", "2", "4"]);
    expect(ids(sortRows(rows, columns, { key: "city", direction: "desc" }))).toEqual(["1", "3", "2", "4"]);
  });

  it("nextSort cicla asc → desc → sin orden", () => {
    const asc = nextSort(null, "total");
    const desc = nextSort(asc, "total");
    expect(asc).toEqual({ key: "total", direction: "asc" });
    expect(desc).toEqual({ key: "total", direction: "desc" });
    expect(nextSort(desc, "total")).toBeNull();
    expect(nextSort(desc, "name")).toEqual({ key: "name", direction: "asc" });
  });
});

describe("filtros", () => {
  const filters: FilterDef[] = [
    { key: "status", label: "Estado", type: "select", options: [] },
    { key: "tags", label: "Etiquetas", type: "multiselect", options: [] },
    { key: "createdAt", label: "Fecha", type: "daterange" },
  ];

  it("select, multiselect sobre arreglos y rango de fechas inclusivo", () => {
    expect(ids(applyFilters(rows, filters, { status: "open" }))).toEqual(["1", "3"]);
    expect(ids(applyFilters(rows, filters, { tags: ["new"] }))).toEqual(["3", "4"]);
    expect(
      ids(applyFilters(rows, filters, { createdAt: { from: "2026-10-01", to: "2026-10-05" } })),
    ).toEqual(["1", "2"]);
  });

  it("los filtros vacíos no restringen", () => {
    expect(applyFilters(rows, filters, { status: "", tags: [], createdAt: {} })).toHaveLength(4);
  });

  it("toQueryParams aplana para una API", () => {
    expect(
      toQueryParams({ status: "open", tags: ["a", "b"], createdAt: { from: "2026-10-01" }, empty: "" }),
    ).toEqual({ status: "open", tags: "a,b", createdAtFrom: "2026-10-01" });
  });
});

describe("processRows", () => {
  it("busca sin acentos en campos anidados, filtra y ordena", () => {
    const result = processRows(rows, {
      columns,
      searchKeys: ["name", "customer.email"],
      search: "oscar",
      filters: [],
      filterValues: {},
      sort: null,
    });
    expect(ids(result)).toEqual(["1"]);

    const byEmail = processRows(rows, {
      columns,
      searchKeys: ["customer.email"],
      search: "@y.mx",
      filters: [{ key: "status", label: "Estado", type: "select", options: [] }],
      filterValues: { status: "open" },
      sort: { key: "total", direction: "desc" },
    });
    expect(ids(byEmail)).toEqual(["3"]);
  });
});

it("clampPage mantiene la página dentro del rango", () => {
  expect(clampPage(5, 12, 10)).toBe(2);
  expect(clampPage(0, 12, 10)).toBe(1);
  expect(clampPage(3, 0, 10)).toBe(1);
});
