"use client";


/**
 * Filtro de rango de fechas: un botón que abre un popover con presets
 * (Hoy / Semana / Mes) y un calendario en modo rango. El valor viaja como
 * `{ from, to }` en ISO `yyyy-MM-dd` para que sea estable y serializable.
 */
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DateRangeValue } from "./types";

const ISO = "yyyy-MM-dd";

/** ISO `yyyy-MM-dd` → Date local (evita el corrimiento por zona horaria). */
function parseISO(value?: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function toValue(range?: DateRange): DateRangeValue {
  return {
    from: range?.from ? format(range.from, ISO) : undefined,
    to: range?.to ? format(range.to, ISO) : undefined,
  };
}

function labelFor(value: DateRangeValue, placeholder: string): string {
  const from = parseISO(value.from);
  const to = parseISO(value.to);
  if (from && to)
    return `${format(from, "d MMM", { locale: es })} – ${format(to, "d MMM", { locale: es })}`;
  if (from) return `Desde ${format(from, "d MMM", { locale: es })}`;
  return placeholder;
}

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  presets?: boolean;
  placeholder?: string;
}

export function DateRangeFilter({
  value,
  onChange,
  presets = true,
  placeholder = "Cualquier fecha",
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const selected: DateRange | undefined = value.from
    ? { from: parseISO(value.from), to: parseISO(value.to) }
    : undefined;

  const applyPreset = (from: Date, to: Date) => {
    onChange({ from: format(from, ISO), to: format(to, ISO) });
    setOpen(false);
  };

  const active = Boolean(value.from);
  const today = new Date();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`h-9 w-full justify-start gap-2 font-normal ${
            active ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <CalendarDays className="h-4 w-4 shrink-0" />
          <span className="truncate">{labelFor(value, placeholder)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {presets && (
          <div className="flex flex-wrap gap-1.5 border-b border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => applyPreset(today, today)}
            >
              Hoy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                applyPreset(
                  startOfWeek(today, { weekStartsOn: 1 }),
                  endOfWeek(today, { weekStartsOn: 1 }),
                )
              }
            >
              Esta semana
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                applyPreset(startOfMonth(today), endOfMonth(today))
              }
            >
              Este mes
            </Button>
          </div>
        )}
        <Calendar
          mode="range"
          locale={es}
          defaultMonth={selected?.from ?? today}
          selected={selected}
          onSelect={(range) => onChange(toValue(range))}
          numberOfMonths={1}
        />
      </PopoverContent>
    </Popover>
  );
}
