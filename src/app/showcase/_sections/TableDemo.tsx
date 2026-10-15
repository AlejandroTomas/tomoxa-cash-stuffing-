"use client";

import { useCallback, useRef, useState } from "react";
import { Ban, CalendarDays, Copy, Eye, MapPin, Tag, UserPlus } from "lucide-react";

import { PaginatedTable, type Column, type RowAction, type TableQuery } from "@/components/compound/PaginatedTable";
import type { FilterDef } from "@/components/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { alertService } from "@/core/alert";
import { toast } from "@/core/toast";
import {
  CITIES,
  DEMO_CUSTOMERS,
  STATUS_LABELS,
  TAGS,
  type CustomerStatus,
  type DemoCustomer,
} from "../_data/customers";
import { isCanceled, showcaseApi } from "../_data/showcaseApi";

const SEARCH_KEYS = ["name", "email", "city"];

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const STATUS_VARIANT: Record<CustomerStatus, "default" | "secondary" | "destructive"> = {
  active: "default",
  pending: "secondary",
  blocked: "destructive",
};

const columns: Column<DemoCustomer>[] = [
  { key: "id", header: "Clave", hideable: false, className: "font-mono text-xs text-muted-foreground" },
  { key: "name", header: "Nombre", sortable: true, hideable: false, className: "font-medium" },
  { key: "email", header: "Correo" },
  { key: "city", header: "Ciudad", sortable: true },
  {
    key: "status",
    header: "Estado",
    cell: (row) => <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>,
  },
  {
    key: "tags",
    header: "Etiquetas",
    cell: (row) =>
      row.tags.length ? (
        <div className="flex flex-wrap gap-1">
          {row.tags.map((tag) => (
            <Badge key={tag} variant="outline">{tag}</Badge>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "balance",
    header: "Saldo",
    sortable: true,
    align: "right",
    className: "tabular-nums",
    cell: (row) => money.format(row.balance),
  },
  { key: "createdAt", header: "Alta", sortable: true, className: "tabular-nums" },
];

const filters: FilterDef[] = [
  {
    key: "status",
    label: "Estado",
    type: "select",
    options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
  },
  { key: "city", label: "Ciudad", icon: MapPin, type: "select", options: CITIES.map((c) => ({ value: c, label: c })) },
  { key: "tags", label: "Etiquetas", icon: Tag, type: "multiselect", options: TAGS.map((t) => ({ value: t, label: t })) },
  { key: "createdAt", label: "Fecha de alta", icon: CalendarDays, type: "daterange" },
];

const rowActions: RowAction<DemoCustomer>[] = [
  { label: "Ver detalle", icon: Eye, onSelect: (row) => toast.info(`Abrirías el detalle de ${row.name}.`) },
  {
    label: "Copiar correo",
    icon: Copy,
    onSelect: (row) => void navigator.clipboard.writeText(row.email).then(() => toast.success("Correo copiado.")),
  },
  {
    label: "Bloquear",
    icon: Ban,
    variant: "destructive",
    separatorBefore: true,
    hidden: (row) => row.status === "blocked",
    onSelect: (row) => alertService.warning("Clientes", `${row.name} quedaría bloqueado (demo).`),
  },
];

/** Modo servidor: así se ve un repository que traduce `TableQuery` a la API. */
function useServerCustomers() {
  const [state, setState] = useState<{ rows: DemoCustomer[]; total: number; loading: boolean }>({
    rows: [],
    total: 0,
    loading: true,
  });
  const controller = useRef<AbortController | null>(null);

  const onQueryChange = useCallback(async (query: TableQuery) => {
    // Cancela la petición anterior: si el usuario escribe rápido, gana la última.
    controller.current?.abort();
    controller.current = new AbortController();
    setState((current) => ({ ...current, loading: true }));
    try {
      const data = await showcaseApi.customersPage(query, controller.current.signal);
      setState({ ...data, loading: false });
    } catch (error) {
      if (isCanceled(error)) return;
      alertService.reportError("Clientes", error);
      setState((current) => ({ ...current, loading: false }));
    }
  }, []);

  return { ...state, onQueryChange };
}

export default function TableDemo() {
  const [mode, setMode] = useState<"client" | "server">("client");
  const server = useServerCustomers();

  const shared = {
    columns,
    getRowId: (row: DemoCustomer) => row.id,
    searchKeys: SEARCH_KEYS,
    searchPlaceholder: "Buscar por nombre, correo o ciudad…",
    filters,
    rowActions,
    tableId: "showcase-customers",
    toolbarActions: (
      <Button size="sm" className="h-9" onClick={() => toast.info("Abrirías el formulario de alta.")}>
        <UserPlus /> <span className="hidden sm:inline">Nuevo</span>
      </Button>
    ),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tabla paginada</CardTitle>
        <CardDescription>
          Búsqueda sin acentos, filtros (<code>FilterBar</code>), orden por columna, columnas
          ocultables que se recuerdan, acciones por fila (menú ⋯ o clic derecho) y paginación. En
          modo servidor la misma tabla pide cada página a <code>/api/showcase/customers</code>.
        </CardDescription>
        <Tabs value={mode} onValueChange={(value) => setMode(value as "client" | "server")} className="pt-2">
          <TabsList>
            <TabsTrigger value="client">Datos en cliente</TabsTrigger>
            <TabsTrigger value="server">Paginado en servidor</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {mode === "client" ? (
          <PaginatedTable
            key="client"
            {...shared}
            data={DEMO_CUSTOMERS}
            initialSort={{ key: "name", direction: "asc" }}
            renderFooter={(rows) => (
              <p className="text-right text-sm text-muted-foreground">
                Saldo de {rows.length} clientes:{" "}
                <strong className="tabular-nums text-foreground">
                  {money.format(rows.reduce((sum, row) => sum + row.balance, 0))}
                </strong>
              </p>
            )}
          />
        ) : (
          <PaginatedTable
            key="server"
            {...shared}
            data={server.rows}
            loading={server.loading}
            serverSide={{ total: server.total, onQueryChange: server.onQueryChange }}
          />
        )}
      </CardContent>
    </Card>
  );
}
