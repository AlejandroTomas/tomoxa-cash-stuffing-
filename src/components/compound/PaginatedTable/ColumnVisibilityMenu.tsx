"use client";

import { useState } from "react";
import { Columns3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { Column } from "./types";

/**
 * Columnas ocultas. Con `tableId` se guardan en este navegador; sin él viven en
 * memoria mientras el componente esté montado.
 */
export function useColumnVisibility(tableId: string | undefined) {
  const [stored, setStored] = useLocalStorage<string[]>(
    tableId ? `table:${tableId}:hidden-columns` : undefined,
    [],
  );
  const [memory, setMemory] = useState<string[]>([]);
  const hidden = tableId ? stored : memory;
  const setHidden = tableId ? setStored : setMemory;

  return {
    hidden,
    isVisible: (key: string) => !hidden.includes(key),
    toggle: (key: string) =>
      setHidden((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key])),
    showAll: () => setHidden([]),
  };
}

interface ColumnVisibilityMenuProps<T> {
  columns: Column<T>[];
  isVisible: (key: string) => boolean;
  onToggle: (key: string) => void;
  onShowAll: () => void;
}

export function ColumnVisibilityMenu<T>({ columns, isVisible, onToggle, onShowAll }: ColumnVisibilityMenuProps<T>) {
  const hideable = columns.filter((column) => column.hideable !== false);
  if (hideable.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Columns3 /> <span className="hidden sm:inline">Columnas</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hideable.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={isVisible(column.key)}
            onCheckedChange={() => onToggle(column.key)}
            // Mantiene el menú abierto para ocultar varias seguidas.
            onSelect={(event) => event.preventDefault()}
          >
            {column.header}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onShowAll}>Mostrar todas</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
