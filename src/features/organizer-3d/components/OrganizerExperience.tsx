"use client";

import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, MousePointerClick, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getEnvelope } from "../mocks/envelopes.mock";
import { STAGE_LABELS, type OrganizerView } from "../domain/organizerView";
import { EnvelopePanel } from "./EnvelopePanel";
import { useOrganizerController } from "./useOrganizerController";

const OrganizerCanvas = dynamic(() => import("./OrganizerCanvas"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Preparando tu carpeta…</div>
  ),
});

function announce(view: OrganizerView): string {
  const name = view.activeId ? getEnvelope(view.activeId).name : "";
  if (view.stage === "closed") return "Carpeta cerrada.";
  if (view.stage === "open") return "Carpeta abierta. Elige un sobre.";
  if (view.stage === "focused") return `Sobre ${name} seleccionado.`;
  return `Sobre ${name} fuera de la carpeta.`;
}

function hint(view: OrganizerView, touch: boolean): string {
  const tap = touch ? "Toca" : "Haz clic en";
  if (view.stage === "closed") return `${tap} la carpeta para abrirla`;
  if (view.stage === "open") return `${tap} un sobre para sacarlo`;
  if (view.stage === "focused") return `${tap} el sobre otra vez para extraerlo`;
  return `${tap} el sobre para regresarlo`;
}

/** Carpeta organizadora 3D con sobres extraíbles. Solo visual: los importes son mock. */
export function OrganizerExperience() {
  const { view, busy, unavailable, perform, selectEnvelope, step, back, canvas } = useOrganizerController();
  const primary =
    view.stage === "closed"
      ? { label: "Abrir carpeta", icon: <ArrowRight />, run: () => perform({ type: "OPEN" }) }
      : view.stage === "open"
        ? { label: "Explorar sobres", icon: <ArrowRight />, run: () => step(1) }
        : view.stage === "focused"
          ? { label: "Extraer sobre", icon: <ArrowUpRight />, run: () => perform({ type: "EXTRACT" }) }
          : { label: "Regresar sobre", icon: <ArrowLeft />, run: () => perform({ type: "RETURN" }) };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
      <Card className="gap-0 self-start overflow-hidden py-0">
        <section
          aria-label="Carpeta 3D"
          aria-describedby="organizer-help"
          className="relative aspect-[5/6] max-h-[640px] w-full sm:aspect-auto sm:h-[clamp(360px,60vh,640px)] bg-[radial-gradient(ellipse_at_45%_40%,var(--color-accent),transparent_70%)]"
        >
          {unavailable ? (
            <div role="status" className="absolute inset-4 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-6 text-center">
              <BookOpen className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Tu organizador sigue disponible</p>
              <p className="max-w-xs text-xs text-muted-foreground">{unavailable} Usa la lista de sobres para explorar.</p>
            </div>
          ) : (
            <OrganizerCanvas {...canvas} />
          )}
          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {STAGE_LABELS[view.stage]}
            </Badge>
            <Badge variant="outline" className="bg-card/70 backdrop-blur-sm">Modo demo</Badge>
          </div>
          <p id="organizer-help" className="sr-only">
            Representación visual de la carpeta. Usa la lista de sobres o el teclado: flechas para cambiar de sobre y Escape para regresar.
          </p>
          <p className="sr-only" aria-live="polite">
            {announce(view)}
          </p>
        </section>
        <div className="flex items-center justify-between gap-3 border-t border-border p-3">
          <Button variant="ghost" disabled={busy || view.stage === "closed"} onClick={back}>
            <RotateCcw /> {view.stage === "open" ? "Cerrar carpeta" : "Atrás"}
          </Button>
          {!unavailable && (
            <p className="hidden min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground sm:flex">
              <MousePointerClick className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate pointer-coarse:hidden">{hint(view, false)}</span>
              <span className="hidden truncate pointer-coarse:inline">{hint(view, true)}</span>
            </p>
          )}
          <Button disabled={busy} onClick={() => void primary.run()}>
            {primary.label} {primary.icon}
          </Button>
        </div>
      </Card>

      <EnvelopePanel
        view={view}
        busy={busy}
        onSelect={(id) => void selectEnvelope(id)}
        onStep={step}
        onExtract={() => void perform({ type: "EXTRACT" })}
        onReturn={() => void perform({ type: "RETURN" })}
      />
    </div>
  );
}
