"use client";

import { cn } from "@/lib/utils";
import { envelopesMock, type EnvelopeId } from "../mocks/envelopes.mock";
import { ENVELOPE_ICONS } from "./envelopeIcons";

interface EnvelopeTilesProps {
  selectedId: EnvelopeId;
  busy: boolean;
  onSelect: (id: EnvelopeId) => void;
  className?: string;
}

/**
 * Fila de sobres (alternativa HTML al lienzo, navegable con teclado). Los
 * colores son datos del sobre, iguales en ambos temas.
 */
export function EnvelopeTiles({ selectedId, busy, onSelect, className }: EnvelopeTilesProps) {
  return (
    <ul aria-label="Sobres" className={cn("grid grid-cols-3 gap-2.5 sm:grid-cols-6 lg:gap-4", className)}>
      {envelopesMock.map((envelope) => {
        const Icon = ENVELOPE_ICONS[envelope.icon];
        const selected = envelope.id === selectedId;
        return (
          <li key={envelope.id}>
            <button
              type="button"
              aria-pressed={selected}
              disabled={busy}
              onClick={() => onSelect(envelope.id)}
              className={cn(
                "flex aspect-[6/5] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 text-sm font-medium shadow-md shadow-foreground/5 outline-none backdrop-blur-md transition-[transform,box-shadow,border-color]",
                "hover:-translate-y-0.5 focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:cursor-wait lg:text-[0.95rem]",
                selected ? "-translate-y-1 border-card shadow-xl" : "border-transparent",
              )}
              style={{
                backgroundColor: `color-mix(in oklch, ${envelope.color} 42%, var(--card))`,
                color: `color-mix(in oklch, ${envelope.color} 45%, var(--foreground))`,
              }}
            >
              <Icon className="size-7 lg:size-8" strokeWidth={1.7} style={{ color: `color-mix(in oklch, ${envelope.color} 75%, var(--foreground))` }} aria-hidden="true" />
              <span className="truncate">{envelope.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
