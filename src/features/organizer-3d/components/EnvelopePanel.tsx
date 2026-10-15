"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, FolderOpen, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { envelopesMock, getEnvelope, type EnvelopeId } from "../mocks/envelopes.mock";
import type { OrganizerView } from "../domain/organizerView";
import { EnvelopeGlyph } from "./EnvelopeGlyph";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

interface EnvelopePanelProps {
  view: OrganizerView;
  busy: boolean;
  onSelect: (id: EnvelopeId) => void;
  onStep: (direction: -1 | 1) => void;
  onExtract: () => void;
  onReturn: () => void;
}

/** Alternativa HTML a la escena: lista navegable por teclado y detalle del sobre activo. */
export function EnvelopePanel({ view, busy, onSelect, onStep, onExtract, onReturn }: EnvelopePanelProps) {
  const reduceMotion = useReducedMotion();
  const item = view.activeId ? getEnvelope(view.activeId) : null;

  return (
    <Card className="gap-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Mis sobres <span className="font-normal text-muted-foreground">({envelopesMock.length})</span>
        </CardTitle>
        <CardDescription>Elige un sobre para verlo en la carpeta. Los importes son de ejemplo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul aria-label="Sobres" className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {envelopesMock.map((envelope) => {
            const active = envelope.id === view.activeId;
            return (
              <li key={envelope.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={busy}
                  onClick={() => onSelect(envelope.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left transition-[background-color,border-color,transform] outline-none",
                    "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 lg:hover:translate-x-0.5",
                    active && "border-ring bg-accent",
                  )}
                >
                  <EnvelopeGlyph item={envelope} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{envelope.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{money.format(envelope.amount)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <AnimatePresence mode="wait" initial={false}>
          {item ? (
            <motion.section
              key={item.id}
              aria-label={`Detalle de ${item.name}`}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="rounded-2xl border border-border bg-muted/40 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <EnvelopeGlyph item={item} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{view.stage === "extracted" ? "Fuera de la carpeta" : "En la carpeta"}</p>
                  </div>
                </div>
                <Badge variant="outline">Demo</Badge>
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{money.format(item.amount)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
              <div className="mt-4 flex items-center gap-2">
                {view.stage === "extracted" ? (
                  <Button className="flex-1" disabled={busy} onClick={onReturn}>
                    <ArrowLeft /> Regresar sobre
                  </Button>
                ) : (
                  <Button className="flex-1" disabled={busy} onClick={onExtract}>
                    Extraer sobre <ArrowUpRight />
                  </Button>
                )}
                <Button variant="outline" size="icon" aria-label="Sobre anterior" disabled={busy} onClick={() => onStep(-1)}>
                  <ChevronLeft />
                </Button>
                <Button variant="outline" size="icon" aria-label="Sobre siguiente" disabled={busy} onClick={() => onStep(1)}>
                  <ChevronRight />
                </Button>
              </div>
            </motion.section>
          ) : (
            <motion.div
              key="empty"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-6 text-center"
            >
              <FolderOpen className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Un lugar para cada peso</p>
              <p className="max-w-56 text-xs text-muted-foreground">
                {view.stage === "closed" ? "Abre la carpeta o elige un sobre de la lista." : "Toca un sobre en la carpeta o en la lista."}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Demostración visual: no se guardan datos ni se mueve dinero real.
        </p>
      </CardContent>
    </Card>
  );
}
