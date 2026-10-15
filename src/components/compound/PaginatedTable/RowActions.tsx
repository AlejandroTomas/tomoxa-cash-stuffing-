"use client";

import { Fragment, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RowAction } from "./types";

const visibleActions = <T,>(actions: RowAction<T>[], row: T) =>
  actions.filter((action) => !action.hidden?.(row));

/** Botón "⋯" con las acciones de la fila. Funciona en táctil, a diferencia del clic derecho. */
export function RowActionsMenu<T>({ actions, row }: { actions: RowAction<T>[]; row: T }) {
  const items = visibleActions(actions, row);
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Acciones de la fila"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {items.map(({ label, icon: Icon, onSelect, variant, disabled, separatorBefore }) => (
          <Fragment key={label}>
            {separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem variant={variant} disabled={disabled?.(row)} onSelect={() => onSelect(row)}>
              {Icon && <Icon />}
              {label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Las mismas acciones con clic derecho sobre la fila. */
export function RowContextMenu<T>({
  actions,
  row,
  children,
}: {
  actions: RowAction<T>[];
  row: T;
  children: ReactNode;
}) {
  const items = visibleActions(actions, row);
  if (items.length === 0) return <>{children}</>;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {items.map(({ label, icon: Icon, onSelect, variant, disabled, separatorBefore }) => (
          <Fragment key={label}>
            {separatorBefore && <ContextMenuSeparator />}
            <ContextMenuItem variant={variant} disabled={disabled?.(row)} onSelect={() => onSelect(row)}>
              {Icon && <Icon />}
              {label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
