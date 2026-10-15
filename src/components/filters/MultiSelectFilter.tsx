"use client";

import { ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { FilterOption } from "./types";

interface MultiSelectFilterProps {
  options: FilterOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

/** Selección múltiple controlada: un popover con casillas. */
export function MultiSelectFilter({
  options,
  value,
  onChange,
  placeholder = "Todos",
}: MultiSelectFilterProps) {
  const toggle = (option: string) =>
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : `${value.length} seleccionados`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 w-full justify-between font-normal",
            value.length === 0 && "text-muted-foreground",
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-48 p-1" align="start">
        <ul className="max-h-64 overflow-y-auto">
          {options.map((option) => {
            const id = `multiselect-${option.value}`;
            return (
              <li key={option.value}>
                <label
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    id={id}
                    checked={value.includes(option.value)}
                    onCheckedChange={() => toggle(option.value)}
                  />
                  {option.label}
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
