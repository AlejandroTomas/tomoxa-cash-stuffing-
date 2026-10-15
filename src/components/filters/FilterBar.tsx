"use client";

import { useMemo, type ReactNode } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { asRange } from "./applyFilters";
import { DateRangeFilter } from "./DateRangeFilter";
import { MultiSelectFilter } from "./MultiSelectFilter";
import type { ActiveChip, FilterDef, FilterValue, FilterValues } from "./types";

interface FilterBarProps {
  filters: FilterDef[];
  values: FilterValues;
  onChange: (next: FilterValues) => void;
  /** Contenido a la derecha de los controles (ej. botón "Actualizar"). */
  actions?: ReactNode;
  /** Sin borde ni fondo, para usarla dentro de otro contenedor. */
  bare?: boolean;
  /** `false` muestra solo los chips de filtros activos (barra plegada). Default true. */
  showControls?: boolean;
  className?: string;
}

// Radix Select no acepta "" como valor de un ítem.
const ALL = "__all__";

/**
 * Barra de filtros controlada y sin dominio:
 *
 *   [ Estado ▾ ] [ Etiquetas ▾ ] [ Fecha 📅 ] …              [ acciones ]
 *   ‹chips de filtros activos ×›                         Limpiar todo
 *
 * Recibe `values` y emite `onChange(next)`. La pantalla dueña decide qué hacer:
 * filtrar en cliente (`applyFilters`) o pedir a la API (`toQueryParams`).
 */
export function FilterBar({
  filters,
  values,
  onChange,
  actions,
  bare,
  showControls = true,
  className,
}: FilterBarProps) {
  const set = (key: string, value: FilterValue) => onChange({ ...values, [key]: value });

  const chips = useMemo<ActiveChip[]>(() => {
    const update = (key: string, value: FilterValue) => onChange({ ...values, [key]: value });
    return filters.flatMap((def): ActiveChip[] => {
      const value = values[def.key];
      if (def.type === "daterange") {
        const { from, to } = asRange(value);
        return from
          ? [{ id: def.key, label: `${def.label}: ${from}${to ? ` → ${to}` : ""}`, onRemove: () => update(def.key, undefined) }]
          : [];
      }
      if (def.type === "multiselect") {
        const selected = Array.isArray(value) ? value : [];
        return selected.map((item) => ({
          id: `${def.key}:${item}`,
          label: def.options.find((o) => o.value === item)?.label ?? item,
          onRemove: () => update(def.key, selected.filter((v) => v !== item)),
        }));
      }
      return typeof value === "string" && value
        ? [{
            id: def.key,
            label: `${def.label}: ${def.options.find((o) => o.value === value)?.label ?? value}`,
            onRemove: () => update(def.key, undefined),
          }]
        : [];
    });
  }, [filters, values, onChange]);

  const clearAll = () => {
    const next = { ...values };
    filters.forEach((def) => {
      next[def.key] = undefined;
    });
    onChange(next);
  };

  return (
    <div className={cn(!bare && "rounded-xl border border-border bg-card p-3 sm:p-4", className)}>
      <div className="space-y-3">
        {showControls && (
          <div className="flex flex-wrap items-end gap-3">
            {filters.map((def) => {
              const Icon = def.icon;
              return (
                <div key={def.key} className="w-full space-y-1.5 sm:w-52">
                  <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    {def.label}
                  </Label>
                  {def.type === "select" && (
                    <Select
                      value={typeof values[def.key] === "string" && values[def.key] ? (values[def.key] as string) : ALL}
                      onValueChange={(next) => set(def.key, next === ALL ? undefined : next)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={def.placeholder ?? "Todos"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>{def.placeholder ?? "Todos"}</SelectItem>
                        {def.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {def.type === "multiselect" && (
                    <MultiSelectFilter
                      options={def.options}
                      value={Array.isArray(values[def.key]) ? (values[def.key] as string[]) : []}
                      placeholder={def.placeholder}
                      onChange={(next) => set(def.key, next)}
                    />
                  )}
                  {def.type === "daterange" && (
                    <DateRangeFilter
                      value={asRange(values[def.key])}
                      presets={def.presets}
                      onChange={(next) => set(def.key, next.from ? next : undefined)}
                    />
                  )}
                </div>
              );
            })}
            {actions && <div className="ml-auto self-end">{actions}</div>}
          </div>
        )}

        {chips.length > 0 && (
          <div className={cn("flex flex-wrap items-center gap-2", showControls && "border-t border-border pt-3")}>
            {chips.map((chip) => (
              <Badge key={chip.id} variant="secondary" className="gap-1 py-1 pr-1 pl-2.5">
                {chip.label}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-4 p-0 hover:bg-destructive/20"
                  onClick={chip.onRemove}
                  aria-label={`Quitar ${chip.label}`}
                >
                  <X className="size-3" />
                </Button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearAll}>
              Limpiar todo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
