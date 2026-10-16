"use client";

import { BookOpen, Folders, LayoutGrid, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORGANIZER_STYLES, type OrganizerStyleId } from "../domain/organizerStyle";

export const STYLE_ICONS: Record<OrganizerStyleId, LucideIcon> = {
  binder: BookOpen,
  cabinet: LayoutGrid,
  files: Folders,
};

interface OrganizerStyleSelectorProps {
  value: OrganizerStyleId;
  onChange: (style: OrganizerStyleId) => void;
  /** "floating": pastilla de vidrio sobre la escena (móvil). "inline": dentro de la barra (escritorio), con nombres. */
  variant?: "floating" | "inline";
  className?: string;
}

/** Selector discreto de organizador (carpeta, cajonera, archivador): iconos sobre la escena en móvil; con nombres en la barra en escritorio. */
export function OrganizerStyleSelector({ value, onChange, variant = "floating", className }: OrganizerStyleSelectorProps) {
  const inline = variant === "inline";
  return (
    <div
      role="radiogroup"
      aria-label="Estilo del organizador"
      className={cn(
        "flex items-center gap-0.5 rounded-full p-1",
        inline ? "bg-foreground/5" : "border border-card/70 bg-card/45 shadow-lg shadow-foreground/5 backdrop-blur-xl",
        className,
      )}
    >
      {ORGANIZER_STYLES.map((style) => {
        const Icon = STYLE_ICONS[style.id];
        const checked = style.id === value;
        return (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={style.label}
            title={style.description}
            onClick={() => onChange(style.id)}
            className={cn(
              "flex h-10 min-w-10 items-center justify-center gap-2 rounded-full px-2.5 text-sm font-medium text-foreground/70 outline-none transition-colors",
              "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
              inline && "px-3.5",
              checked && "bg-card text-foreground shadow-sm",
            )}
          >
            <Icon className="size-5" strokeWidth={1.7} aria-hidden="true" />
            {inline && <span>{style.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
