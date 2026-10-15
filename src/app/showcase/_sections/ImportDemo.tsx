"use client";

import { useState } from "react";
import { FileSpreadsheet, Package, Users } from "lucide-react";

import { ExcelImportModal, type ImportActionConfig } from "@/components/import/ExcelImportModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { alertService } from "@/core/alert";
import { AppError } from "@/core/errors";
import { delay } from "@/utils/delay";

/**
 * Configuración de ejemplo. En un proyecto real cada feature define la suya
 * (ej. `features/products/components/productImport.ts`) y `onImport` llama a su service.
 */
const IMPORT_ACTIONS: ImportActionConfig[] = [
  {
    value: "productos",
    label: "Productos",
    description: "Alta o actualización masiva por código de barras",
    icon: <Package />,
    fields: [
      { key: "codigoBarras", label: "Código de barras", type: "string", required: false, aliases: ["ean", "sku"] },
      { key: "nombre", label: "Nombre", type: "string", required: true, aliases: ["producto", "descripcion"] },
      { key: "precioCosto", label: "Precio costo", type: "number", required: true, aliases: ["costo"] },
      {
        key: "precioVenta",
        label: "Precio venta",
        type: "number",
        required: true,
        aliases: ["precio", "pv"],
        validate: (value, row) =>
          typeof value === "number" && typeof row.precioCosto === "number" && value < row.precioCosto
            ? "El precio de venta es menor al costo"
            : null,
      },
      { key: "stock", label: "Stock", type: "number", required: false, defaultValue: 0, aliases: ["existencia"] },
      {
        key: "unidad",
        label: "Unidad de medida",
        type: "enum",
        required: true,
        aliases: ["unidad"],
        enumOptions: [
          { value: "pieza", label: "Pieza" },
          { value: "kg", label: "Kilogramo" },
          { value: "litro", label: "Litro" },
          { value: "metro", label: "Metro" },
        ],
      },
      { key: "activo", label: "Activo", type: "boolean", required: false, defaultValue: true, helpText: "Sí/No" },
    ],
  },
  {
    value: "clientes",
    label: "Clientes",
    description: "Alta masiva de clientes",
    icon: <Users />,
    fields: [
      { key: "nombre", label: "Nombre", type: "string", required: true },
      { key: "email", label: "Correo", type: "string", required: false, aliases: ["email"] },
      { key: "telefono", label: "Teléfono", type: "string", required: false },
      { key: "fechaAlta", label: "Fecha de alta", type: "date", required: false },
      { key: "limiteCredito", label: "Límite de crédito", type: "number", required: false, defaultValue: 0 },
    ],
  },
];

export default function ImportDemo() {
  const [open, setOpen] = useState<"all" | "single" | null>(null);

  // En un feature real: `await dispatch(importProducts(rows)).unwrap()` o `productService.import(rows)`.
  const handleImport = async (action: ImportActionConfig, rows: Array<Record<string, unknown>>) => {
    await delay(800);
    if (rows.length > 500) throw new AppError("La demo acepta hasta 500 filas por archivo.");
    alertService.success(`Importación de ${action.label.toLowerCase()}`, `Se recibieron ${rows.length} filas válidas.`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar desde Excel</CardTitle>
        <CardDescription>
          Pasos: tipo → archivo → mapeo de columnas (propuesto por nombre o alias) → validación por
          fila. Incluye plantilla descargable, fechas de Excel, números con formato y validaciones
          propias por campo. Con una sola acción se omite el primer paso.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => setOpen("all")}>
          <FileSpreadsheet /> Importar (varios tipos)
        </Button>
        <Button variant="outline" onClick={() => setOpen("single")}>
          <Package /> Importar solo productos
        </Button>
        <ExcelImportModal
          isOpen={open !== null}
          onClose={() => setOpen(null)}
          actions={open === "single" ? IMPORT_ACTIONS.slice(0, 1) : IMPORT_ACTIONS}
          onImport={handleImport}
        />
      </CardContent>
    </Card>
  );
}
