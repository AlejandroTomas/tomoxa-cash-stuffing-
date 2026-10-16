"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowLeftRight, FolderOpen, ReceiptText, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Ellipsis, Pencil, Plus, RotateCcw, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { EnvelopeActivity } from "../domain/document";
import { parseLocalDate } from "@/utils/localDate";
import type { EnvelopeItem } from "../domain/envelopeView";
import type { Stage } from "../domain/organizerView";
import { ENVELOPE_ICONS } from "./envelopeIcons";

const amountFormat = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });

/** "$ 1,800.00" (con espacio, como en el diseño); negativos "−$ 100.00". */
export const formatAmount = (amount: number) => `${amount < 0 ? "−" : ""}$ ${amountFormat.format(Math.abs(amount))}`;

/** Fecha ISO local (YYYY-MM-DD) → "6 oct 2026". */
export function formatShortDate(iso: string): string {
  return dateFormat.format(parseLocalDate(iso)).replace(/\./g, "");
}

interface EnvelopeDetailCardProps {
  item: EnvelopeItem;
  /** Todos los sobres (para el indicador de posición). */
  envelopes: readonly EnvelopeItem[];
  activity: EnvelopeActivity;
  onMoveMoney: () => void;
  onRecord: () => void;
  onEdit: () => void;
  onArchive: () => void;
  stage: Stage;
  busy: boolean;
  onExtract: () => void;
  /** Con el sobre extraído, el botón principal lo abre para ver sus documentos. */
  onOpenEnvelope: () => void;
  onShow: () => void;
  onStep: (direction: -1 | 1) => void;
  onBack: () => void;
  className?: string;
}

export const glass = "border border-card/70 bg-card/60 shadow-xl shadow-foreground/5 backdrop-blur-xl";

/** Tarjeta de vidrio con el detalle del sobre seleccionado. */
export function EnvelopeDetailCard({ item, envelopes, activity, onMoveMoney, onRecord, onEdit, onArchive, stage, busy, onExtract, onOpenEnvelope, onShow, onStep, onBack, className }: EnvelopeDetailCardProps) {
  const reduceMotion = useReducedMotion();
  const Icon = ENVELOPE_ICONS[item.icon];
  const index = envelopes.findIndex((envelope) => envelope.id === item.id);
  const extracted = stage === "extracted";
  const overdrawn = item.amount < 0;

  return (
    <section aria-label={`Detalle de ${item.name}`} className={cn("rounded-[1.75rem] p-5 lg:p-6", glass, className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={item.id}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className="grid size-16 shrink-0 place-items-center rounded-2xl text-primary-foreground shadow-lg"
              style={{ backgroundColor: item.color, boxShadow: `0 10px 24px -8px ${item.color}` }}
            >
              <Icon className="size-8" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">{item.name}</h2>
              <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{item.description}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Más opciones" className="-mt-1 -mr-1 shrink-0 rounded-full bg-card/80">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={busy || extracted} onSelect={onShow}>
                  Mostrar en la carpeta
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy || stage === "closed"} onSelect={onBack}>
                  {extracted ? "Regresar a la carpeta" : "Atrás"}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy} onSelect={onArchive}>
                  Archivar sobre
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className={cn("text-4xl font-semibold tracking-tight tabular-nums lg:text-[2.6rem]", overdrawn ? "text-destructive" : "text-foreground")}>{formatAmount(item.amount)}</p>
            {overdrawn && (
              <Badge variant="destructive">
                <AlertTriangle aria-hidden="true" /> Sobregirado
              </Badge>
            )}
          </div>

          <dl className="mt-4 divide-y divide-border/70 rounded-2xl border border-card/70 bg-card/70 px-4 text-sm">
            <div className="flex items-center gap-3 py-3">
              <CircleDollarSign className="size-4.5 text-muted-foreground" aria-hidden="true" />
              <dt className="flex-1 text-foreground/80">Total en sobre</dt>
              <dd className={cn("font-medium tabular-nums", overdrawn ? "text-destructive" : "text-foreground")}>{formatAmount(item.amount)}</dd>
            </div>
            <div className="flex items-center gap-3 py-3">
              <Plus className="size-4.5 rounded-sm border border-muted-foreground/60 p-px text-muted-foreground" aria-hidden="true" />
              <dt className="flex-1 text-foreground/80">Movimientos</dt>
              <dd className="font-medium text-foreground tabular-nums">{activity.movements}</dd>
            </div>
            <div className="flex items-center gap-3 py-3">
              <Clock3 className="size-4.5 text-muted-foreground" aria-hidden="true" />
              <dt className="flex-1 text-foreground/80">Último movimiento</dt>
              <dd className="font-medium text-foreground tabular-nums">{activity.lastMovement ? formatShortDate(activity.lastMovement) : "—"}</dd>
            </div>
          </dl>
        </motion.div>
      </AnimatePresence>

      <Button
        className="mt-5 h-14 w-full rounded-2xl text-base font-semibold shadow-lg shadow-primary/30 [&_svg:not([class*='size-'])]:size-5"
        disabled={busy}
        onClick={extracted ? onOpenEnvelope : onExtract}
      >
        {extracted ? <FolderOpen /> : <Upload />}
        {extracted ? "Abrir sobre" : "Extraer sobre"}
      </Button>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="outline" className="h-12 rounded-2xl border-card/70 bg-card/70 px-2" disabled={busy} onClick={onRecord}>
          <ReceiptText /> Registrar
        </Button>
        <Button variant="outline" className="h-12 rounded-2xl border-card/70 bg-card/70 px-2" disabled={busy} onClick={onMoveMoney}>
          <ArrowLeftRight /> Mover
        </Button>
        <Button variant="outline" className="h-12 rounded-2xl border-card/70 bg-card/70 px-2" disabled={busy} onClick={onEdit}>
          <Pencil /> Editar
        </Button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Sobre anterior" disabled={busy} onClick={() => onStep(-1)} className="rounded-full">
            <ChevronLeft />
          </Button>
          <span className="flex items-center gap-1.5" aria-label={`Sobre ${index + 1} de ${envelopes.length}`} role="img">
            {envelopes.map((envelope) => (
              <span
                key={envelope.id}
                className={cn("h-1.5 rounded-full bg-foreground/25 transition-all", envelope.id === item.id ? "w-4 bg-foreground/70" : "w-1.5")}
              />
            ))}
          </span>
          <Button variant="ghost" size="icon" aria-label="Sobre siguiente" disabled={busy} onClick={() => onStep(1)} className="rounded-full">
            <ChevronRight />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={extracted ? "Regresar sobre" : "Atrás"}
          disabled={busy || stage === "closed"}
          onClick={onBack}
          className="rounded-full bg-card/80 shadow-sm"
        >
          <RotateCcw />
        </Button>
      </div>
    </section>
  );
}
