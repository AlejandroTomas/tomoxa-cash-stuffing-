"use client";

import { AlertTriangle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnvelopeId, EnvelopeItem } from "../domain/envelopeView";
import { ENVELOPE_ICONS } from "./envelopeIcons";

interface EnvelopeTilesProps {
  envelopes: readonly EnvelopeItem[];
  selectedId: EnvelopeId;
  busy: boolean;
  onSelect: (id: EnvelopeId) => void;
  /** Si se pueden crear más sobres, muestra la ficha "Nuevo". */
  onCreate?: () => void;
  className?: string;
}

/**
 * Ancho de una ficha en pantallas anchas: el de una fila llena. Caben a lo más
 * ocho (los sobres activos, más "Nuevo" mientras se pueda crear otro), así que
 * siempre van en una fila y miden lo mismo, haya los que haya.
 */
const tile = "sm:w-[calc((100%-7*var(--gap))/8)]";

/**
 * Fila de sobres (alternativa HTML al lienzo, navegable con teclado). Los
 * colores son datos del sobre, iguales en ambos temas.
 */
export function EnvelopeTiles({ envelopes, selectedId, busy, onSelect, onCreate, className }: EnvelopeTilesProps) {
  return (
    <ul
      aria-label="Sobres"
      // Mismo tamaño siempre (ver `tile`), alineadas a la derecha.
      className={cn("grid grid-cols-3 gap-2.5 [--gap:0.625rem] sm:flex sm:flex-wrap sm:justify-end lg:gap-3 lg:[--gap:0.75rem]", className)}
    >
      {envelopes.map((envelope) => {
        const Icon = ENVELOPE_ICONS[envelope.icon];
        const selected = envelope.id === selectedId;
        return (
          <li key={envelope.id} className={tile}>
            <button
              type="button"
              aria-pressed={selected}
              aria-label={envelope.amount < 0 ? `${envelope.name} (sobregirado)` : undefined}
              disabled={busy}
              onClick={() => onSelect(envelope.id)}
              className={cn(
                "relative flex aspect-[6/5] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 text-sm font-medium shadow-md shadow-foreground/5 outline-none backdrop-blur-md transition-[transform,box-shadow,border-color]",
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
              {envelope.amount < 0 && (
                <span aria-hidden="true" className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-card text-destructive shadow-sm">
                  <AlertTriangle className="size-3" />
                </span>
              )}
            </button>
          </li>
        );
      })}
      {onCreate && (
        <li className={tile}>
          <button
            type="button"
            disabled={busy}
            onClick={onCreate}
            className="flex aspect-[6/5] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-card/80 bg-card/35 px-2 text-sm font-medium text-foreground/70 outline-none backdrop-blur-md transition-colors hover:bg-card/55 focus-visible:ring-[3px] focus-visible:ring-ring/60 lg:text-[0.95rem]"
          >
            <Plus className="size-7 lg:size-8" strokeWidth={1.7} aria-hidden="true" />
            Nuevo
          </button>
        </li>
      )}
    </ul>
  );
}
