"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormSectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Sin borde exterior (para modales angostos); conserva el encabezado. */
  flush?: boolean;
}

/**
 * Panel titulado para agrupar campos de un formulario: barra de encabezado
 * (ícono + título + descripción), divisor y cuerpo. Da jerarquía clara para que
 * los campos no se lean como una pila. Solo tokens (sirve claro y oscuro).
 */
export function FormSection({
  title,
  description,
  icon,
  children,
  className,
  flush = false,
}: FormSectionProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl bg-card",
        !flush && "border border-border shadow-sm",
        className,
      )}
    >
      <header className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}
