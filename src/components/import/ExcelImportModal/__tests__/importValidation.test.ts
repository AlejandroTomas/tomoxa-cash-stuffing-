import {
  allRequiredMapped,
  autoMapColumns,
  coerceValue,
  parseExcelDate,
  validateAndMapRows,
} from "@/components/import/ExcelImportModal/importValidation";
import type { ImportField } from "@/components/import/ExcelImportModal/types";

const fields: ImportField[] = [
  { key: "nombre", label: "Nombre", type: "string", required: true },
  { key: "precioVenta", label: "Precio de venta", type: "number", required: true, aliases: ["pv"] },
  {
    key: "unidad",
    label: "Unidad",
    type: "enum",
    required: true,
    enumOptions: [
      { value: "pieza", label: "Pieza" },
      { value: "kg", label: "Kilogramo" },
    ],
  },
  { key: "activo", label: "Activo", type: "boolean", required: false, defaultValue: true },
  { key: "alta", label: "Fecha de alta", type: "date", required: false },
  {
    key: "costo",
    label: "Costo",
    type: "number",
    required: false,
    validate: (value, row) =>
      typeof row.precioVenta === "number" && typeof value === "number" && value > row.precioVenta
        ? "El costo no puede ser mayor al precio de venta"
        : null,
  },
];

describe("coerceValue", () => {
  const number = fields[1];

  it.each([
    ["1,234.50", 1234.5],
    ["$1,234.50", 1234.5],
    ["12,5", 12.5],
    [80, 80],
  ])("número %p → %p", (raw, expected) => {
    expect(coerceValue(raw, number)).toEqual({ value: expected, error: null });
  });

  it("enum acepta valor o etiqueta, sin acentos ni mayúsculas", () => {
    expect(coerceValue("KILOGRAMO", fields[2]).value).toBe("kg");
    expect(coerceValue("litro", fields[2]).error).toMatch(/Pieza, Kilogramo/);
  });

  it("booleano en español y default cuando viene vacío", () => {
    expect(coerceValue("Sí", fields[3]).value).toBe(true);
    expect(coerceValue("", fields[3]).value).toBe(true);
    expect(coerceValue("tal vez", fields[3]).error).not.toBeNull();
  });
});

describe("parseExcelDate", () => {
  it.each([
    [45931, "2025-10-01"], // número de serie de Excel
    ["2026-10-15", "2026-10-15"],
    ["15/10/2026", "2026-10-15"],
    [new Date(2026, 9, 15), "2026-10-15"],
  ])("%p → %p", (raw, expected) => {
    expect(parseExcelDate(raw)).toBe(expected);
  });

  it("rechaza fechas imposibles", () => {
    expect(parseExcelDate("31/02/2026")).toBeNull();
    expect(parseExcelDate("mañana")).toBeNull();
  });
});

describe("validateAndMapRows", () => {
  const mapping = { nombre: "Producto", precioVenta: "PV", unidad: "Unidad", costo: "Costo" };

  it("separa filas válidas e inválidas y aplica validate con la fila completa", () => {
    const result = validateAndMapRows(
      [
        { Producto: "Tornillo", PV: "10", Unidad: "pieza", Costo: 4 },
        { Producto: "", PV: "x", Unidad: "pieza", Costo: null },
        { Producto: "Cemento", PV: 200, Unidad: "kg", Costo: 250 },
      ],
      mapping,
      fields,
    );

    expect(result.validRows).toEqual([
      { nombre: "Tornillo", precioVenta: 10, unidad: "pieza", activo: true, costo: 4 },
    ]);
    expect([...result.invalidRowIndexes]).toEqual([1, 2]);
    expect(result.errors.map((e) => [e.rowIndex, e.field])).toEqual([
      [1, "nombre"],
      [1, "precioVenta"],
      [2, "costo"],
    ]);
  });
});

describe("mapeo", () => {
  it("autoMapColumns empata por key, etiqueta o alias sin acentos ni signos", () => {
    expect(autoMapColumns(["NOMBRE", "P.V.", "unidad", "Fecha de Alta", "Otra"], fields)).toEqual({
      nombre: "NOMBRE",
      precioVenta: "P.V.",
      unidad: "unidad",
      alta: "Fecha de Alta",
    });
  });

  it("allRequiredMapped no exige campos con valor por defecto", () => {
    expect(allRequiredMapped({ nombre: "A", precioVenta: "B", unidad: "C" }, fields)).toBe(true);
    expect(allRequiredMapped({ nombre: "A", precioVenta: "B" }, fields)).toBe(false);
  });
});
