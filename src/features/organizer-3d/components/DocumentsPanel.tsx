"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Search, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { KIND_LABELS, signOf, type EnvelopeDocument } from "../domain/document";
import { describeFilter, EMPTY_FILTER, quickFilters, weekStartOf, type DateFilter, type DocumentFilter } from "../domain/documentFilter";
import { parseLocalDate, toLocalIsoDate } from "@/utils/localDate";
import type { Stage } from "../domain/organizerView";
import type { EnvelopeItem } from "../domain/envelopeView";
import { DOCUMENT } from "../scene/layout";
import { formatAmount } from "./EnvelopeDetailCard";
import { HandwrittenText } from "./HandwrittenText";
import { ENVELOPE_ICONS } from "./envelopeIcons";

type Mode = DateFilter["type"];

const MODES: Array<{ mode: Mode; label: string }> = [
  { mode: "all", label: "Todo" },
  { mode: "weekday", label: "Día" },
  { mode: "week", label: "Semana" },
  { mode: "month", label: "Mes" },
  { mode: "date", label: "Fecha" },
];

/** Lunes primero, como el calendario de México. */
const WEEKDAYS = [
  { day: 1, short: "L", name: "lunes" },
  { day: 2, short: "M", name: "martes" },
  { day: 3, short: "X", name: "miércoles" },
  { day: 4, short: "J", name: "jueves" },
  { day: 5, short: "V", name: "viernes" },
  { day: 6, short: "S", name: "sábado" },
  { day: 0, short: "D", name: "domingo" },
];


interface DocumentsPanelProps {
  item: EnvelopeItem;
  stage: Stage;
  busy: boolean;
  documents: readonly EnvelopeDocument[];
  visible: readonly EnvelopeDocument[];
  documentId: string | null;
  filter: DocumentFilter;
  onFilter: (filter: DocumentFilter) => void;
  onPick: (id: string) => void;
  onReturnDocument: () => void;
  onStepDocument: (direction: -1 | 1) => void;
  onCloseEnvelope: () => void;
  /** Cancelar el movimiento del documento que está fuera (pide confirmación afuera). */
  onCancelMovement?: (document: EnvelopeDocument) => void;
  /** "Hoy" para los accesos rápidos (inyectable). */
  today?: Date;
}

const chip =
  "h-8 rounded-full border border-card/70 bg-card/70 px-3 text-xs font-medium text-foreground/80 outline-none transition-colors hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:border-primary/40 aria-pressed:bg-primary/15 aria-pressed:text-foreground";

/** Documentos del sobre abierto: búsqueda con frase en caligrafía, lista y el documento que está fuera. */
export function DocumentsPanel({ item, stage, busy, documents, visible, documentId, filter, onFilter, onPick, onReturnDocument, onStepDocument, onCloseEnvelope, onCancelMovement, today = new Date() }: DocumentsPanelProps) {
  const reduceMotion = useReducedMotion();
  const Icon = ENVELOPE_ICONS[item.icon];
  const latest = documents[0]?.date ?? toLocalIsoDate(today);
  const picked = documentId ? documents.find((doc) => doc.id === documentId) : undefined;
  const months = useMemo(() => [...new Set(documents.map((doc) => doc.date.slice(0, 7)))], [documents]);
  const documentDays = useMemo(() => documents.map((doc) => parseLocalDate(doc.date)), [documents]);
  const setDate = (date: DateFilter) => onFilter({ ...filter, date });
  const mode = filter.date.type;

  /** Al cambiar de modo, arranca en algo con resultados: lo más reciente del sobre. */
  const selectMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "all") setDate({ type: "all" });
    if (next === "weekday") setDate({ type: "weekday", weekday: parseLocalDate(latest).getDay() });
    if (next === "week") setDate({ type: "week", weekStart: weekStartOf(latest) });
    if (next === "month") setDate({ type: "month", month: latest.slice(0, 7) });
    if (next === "date") setDate({ type: "date", date: latest });
  };

  const isDate = (candidate: DateFilter) => JSON.stringify(candidate) === JSON.stringify(filter.date);
  const pickerDate = filter.date.type === "date" ? filter.date.date : filter.date.type === "week" ? filter.date.weekStart : latest;

  return (
    <section aria-label={`Documentos de ${item.name}`} className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl text-primary-foreground" style={{ backgroundColor: item.color }}>
          <Icon className="size-5.5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">Documentos de {item.name}</h2>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            <span className="tabular-nums">{visible.length}</span> de <span className="tabular-nums">{documents.length}</span> movimientos
            {visible.length > DOCUMENT.maxFan && ` · ${DOCUMENT.maxFan} en el sobre`}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Cerrar sobre" disabled={busy || stage === "reading"} onClick={onCloseEnvelope} className="rounded-full bg-card/80">
          <X />
        </Button>
      </header>

      {/* La búsqueda, escrita a mano. */}
      <div className="rounded-2xl border border-card/70 bg-card/70 px-4 pt-2 pb-1">
        <HandwrittenText text={describeFilter(filter)} className="text-[1.7rem] text-foreground" />
      </div>

      <div className="flex flex-col gap-2.5">
        <div role="group" aria-label="Buscar por" className="flex gap-1 rounded-full border border-card/70 bg-card/60 p-1">
          {MODES.map(({ mode: value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => selectMode(value)}
              className="h-8 flex-1 rounded-full text-xs font-medium text-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm"
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "weekday" && (
          <div role="group" aria-label="Día de la semana" className="flex gap-1.5">
            {WEEKDAYS.map(({ day, short, name }) => (
              <button
                key={day}
                type="button"
                aria-label={name}
                aria-pressed={filter.date.type === "weekday" && filter.date.weekday === day}
                onClick={() => setDate({ type: "weekday", weekday: day })}
                className={cn(chip, "flex-1 px-0")}
              >
                {short}
              </button>
            ))}
          </div>
        )}

        {(mode === "week" || mode === "date") && (
          <div className="flex flex-wrap gap-1.5">
            {mode === "week" ? (
              <>
                <button type="button" className={chip} aria-pressed={isDate(quickFilters.thisWeek(today))} onClick={() => setDate(quickFilters.thisWeek(today))}>
                  Esta semana
                </button>
                <button type="button" className={chip} aria-pressed={isDate(quickFilters.lastWeek(today))} onClick={() => setDate(quickFilters.lastWeek(today))}>
                  Semana pasada
                </button>
              </>
            ) : (
              <>
                <button type="button" className={chip} aria-pressed={isDate(quickFilters.today(today))} onClick={() => setDate(quickFilters.today(today))}>
                  Hoy
                </button>
                <button type="button" className={chip} aria-pressed={isDate({ type: "date", date: latest })} onClick={() => setDate({ type: "date", date: latest })}>
                  Último movimiento
                </button>
              </>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className={cn(chip, "inline-flex items-center gap-1.5")}>
                  <CalendarDays className="size-3.5" aria-hidden="true" /> Elegir…
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={es}
                  weekStartsOn={1}
                  defaultMonth={parseLocalDate(pickerDate)}
                  selected={parseLocalDate(pickerDate)}
                  onSelect={(date) => {
                    if (!date) return;
                    setDate(mode === "week" ? { type: "week", weekStart: weekStartOf(date) } : { type: "date", date: toLocalIsoDate(date) });
                  }}
                  modifiers={{ withDocuments: documentDays }}
                  modifiersClassNames={{ withDocuments: "font-semibold underline decoration-primary decoration-2 underline-offset-4" }}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {mode === "month" && (
          <div role="group" aria-label="Mes" className="flex flex-wrap gap-1.5">
            {months.map((month) => (
              <button key={month} type="button" className={cn(chip, "capitalize")} aria-pressed={isDate({ type: "month", month })} onClick={() => setDate({ type: "month", month })}>
                {format(parseLocalDate(`${month}-01`), "MMMM yyyy", { locale: es })}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Buscar por concepto"
            placeholder="Buscar concepto: súper, nómina…"
            value={filter.text}
            onChange={(event) => onFilter({ ...filter, text: event.target.value })}
            className="h-10 rounded-full border-card/70 bg-card/70 pl-9"
          />
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {picked && (
          <motion.div
            key={picked.id}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-primary/30 bg-card/80 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline">{KIND_LABELS[picked.kind]}</Badge>
              <span className="text-xs text-muted-foreground first-letter:uppercase">{format(parseLocalDate(picked.date), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}</span>
            </div>
            <p className="mt-2 text-sm font-medium text-foreground">{picked.concept}</p>
            <p className="text-3xl font-semibold tracking-tight text-foreground">
              {signOf(picked)}
              {formatAmount(picked.amountMinor / 100)}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button className="flex-1 rounded-xl" disabled={busy} onClick={onReturnDocument}>
                <ArrowLeft /> Regresar al sobre
              </Button>
              <Button variant="outline" size="icon" aria-label="Documento anterior" disabled={busy || !visible.length} onClick={() => onStepDocument(-1)} className="rounded-xl">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon" aria-label="Documento siguiente" disabled={busy || !visible.length} onClick={() => onStepDocument(1)} className="rounded-xl">
                <ChevronRight />
              </Button>
            </div>
            {onCancelMovement && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onCancelMovement(picked)} className="mt-2 w-full rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Undo2 /> Cancelar movimiento
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {visible.length ? (
        <ul aria-label="Movimientos" className="flex flex-col gap-1.5">
          {visible.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                aria-pressed={doc.id === documentId}
                disabled={busy}
                onClick={() => (doc.id === documentId ? onReturnDocument() : onPick(doc.id))}
                className="flex w-full items-center gap-3 rounded-xl border border-card/70 bg-card/60 px-3 py-2.5 text-left text-sm outline-none transition-colors hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:border-primary/40 aria-pressed:bg-card disabled:cursor-wait"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-foreground">{doc.concept}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(parseLocalDate(doc.date), "EEE d MMM", { locale: es })} · {KIND_LABELS[doc.kind]}
                  </span>
                </span>
                <span className="shrink-0 font-medium text-foreground tabular-nums">
                  {signOf(doc)}
                  {formatAmount(doc.amountMinor / 100)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-5 text-center">
          <p className="text-sm text-foreground">Ningún movimiento coincide.</p>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => onFilter(EMPTY_FILTER)}>
            Quitar filtro
          </Button>
        </div>
      )}
    </section>
  );
}
