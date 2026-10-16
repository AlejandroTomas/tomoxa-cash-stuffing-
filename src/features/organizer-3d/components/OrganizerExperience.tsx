"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpen, ChevronRight } from "lucide-react";
import { toast } from "@/core/toast";
import type { EnvelopeStyle } from "../domain/envelopeStyle";
import { AccountsSheet } from "@/features/ledger/components/AccountsSheet";
import { RecordMovementDialog, type RecordDefaults } from "@/features/ledger/components/RecordMovementDialog";
import { MAX_ACTIVE_ENVELOPES, UNASSIGNED_ENVELOPE_ID } from "@/features/ledger/domain/envelopes";
import { paymentDueSoon } from "@/features/ledger/domain/cards";
import { selectCardSummaries, selectLedgerHealth } from "@/features/ledger/selector";
import { toLocalIsoDate } from "@/utils/localDate";
import { useAppSelector } from "@/hooks/useReduxHooks";
import type { MovementDraft } from "@/features/ledger/domain/validation";
import { showDialog } from "@/utils/dialogService";
import type { EnvelopeDocument } from "../domain/document";
import type { EnvelopeItem } from "../domain/envelopeView";
import { swipeHint } from "../domain/gestures";
import type { OrganizerView } from "../domain/organizerView";
import { cn } from "@/lib/utils";
import { DocumentsPanel } from "./DocumentsPanel";
import { EnvelopeDetailCard, formatAmount, glass } from "./EnvelopeDetailCard";
import { EditEnvelopeDialog } from "./EditEnvelopeDialog";
import { EnvelopeTiles } from "./EnvelopeTiles";
import { MoveMoneyDialog } from "./MoveMoneyDialog";
import { handwriting } from "./fonts";
import { OrganizerBackdrop } from "./OrganizerBackdrop";
import { OrganizerNav } from "./OrganizerNav";
import { useOrganizerController } from "./useOrganizerController";

const OrganizerCanvas = dynamic(() => import("./OrganizerCanvas"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Preparando tu carpeta…</div>,
});

function announce(view: OrganizerView, envelopes: readonly EnvelopeItem[]): string {
  const name = envelopes.find((item) => item.id === view.activeId)?.name ?? "";
  if (view.stage === "closed") return "Carpeta cerrada.";
  if (view.stage === "open") return "Carpeta abierta. Elige un sobre.";
  if (view.stage === "focused") return `Sobre ${name} seleccionado.`;
  if (view.stage === "browsing") return `Sobre ${name} abierto. Elige un documento.`;
  if (view.stage === "reading") return "Documento fuera del sobre.";
  return `Sobre ${name} fuera de la carpeta.`;
}

/** Cambio entre la tarjeta del sobre y el panel de documentos. */
const cardSwap = (reduceMotion: boolean | null) => ({
  initial: reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: reduceMotion ? undefined : { opacity: 0, y: -10, scale: 0.98 },
  transition: { duration: 0.22, ease: "easeOut" as const },
});

/** En escritorio la tarjeta no baja más allá de la fila de sobres; si no cabe, se desplaza dentro. */
const cardHeight = "lg:max-h-[calc(84dvh-(min(51vw,1000px)-5rem)*0.139-1.5rem)] lg:overflow-y-auto";

function overlaps(outer: DOMRect, inner: DOMRect): boolean {
  return inner.left < outer.right && inner.right > outer.left && inner.top < outer.bottom && inner.bottom > outer.top;
}

/**
 * Aurora Organizer: carpeta 3D a pantalla completa con la interfaz de vidrio
 * encima (navegación, detalle del sobre, fila de sobres). Los saldos y
 * movimientos vienen del libro (`features/ledger`), guardado en el dispositivo.
 */
export function OrganizerExperience() {
  const { view, selectedId, envelopes, budgets, activityFor, checkDraft, moveMoney, animateMovement, cancelMovement, settleBinder, previewStyle, commitStyle, createEnvelope, archiveEnvelope, documents, visibleDocuments, filter, setFilter, stepDocument, busy, unavailable, perform, selectEnvelope, extractSelected, toggleBinder, step, back, setSafeArea, canvas } =
    useOrganizerController();
  const reduceMotion = useReducedMotion();
  const sceneRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  // `undefined` mientras el libro carga del dispositivo.
  const item: EnvelopeItem | undefined = envelopes.find((envelope) => envelope.id === selectedId) ?? envelopes[0];
  const [dialog, setDialog] = useState<"move" | "edit" | "create" | "record" | "accounts" | null>(null);
  const [recordDefaults, setRecordDefaults] = useState<RecordDefaults>({});
  // Al cubrir un sobre sobregirado: origen, destino y monto propuestos.
  const [cover, setCover] = useState<{ from: string; to: string; amountMinor: number } | null>(null);
  const health = useAppSelector(selectLedgerHealth);
  const [today] = useState(() => toLocalIsoDate(new Date()));
  const cardDue = useAppSelector((state) => selectCardSummaries(state, today)).some((card) => paymentDueSoon(card.statement));
  // Un aviso por tema; si hay más de uno, se cuentan (el detalle está en Cuentas).
  const alerts = [cardDue && "Pagar tarjeta", health.unbackedDebt > 0 && "Deuda sin respaldo", health.overdrawn > 0 && "Sobregirado"].filter((text): text is string => Boolean(text));
  const alert = alerts.length > 1 ? `${alerts.length} avisos` : (alerts[0] ?? null);
  const openRecord = (defaults: RecordDefaults) => {
    setRecordDefaults(defaults);
    setDialog("record");
  };
  /** Propone mover `amountMinor` a `to`: desde Disponible si alcanza (al apartar presupuesto), si no desde el sobre con más dinero. */
  const openCover = (to: string, amountMinor: number, preferAvailable = false) => {
    const others = envelopes.filter((envelope) => envelope.id !== to);
    const available = others.find((envelope) => envelope.id === UNASSIGNED_ENVELOPE_ID && Math.round(envelope.amount * 100) >= amountMinor);
    const source = (preferAvailable && available) || [...others].sort((a, b) => b.amount - a.amount)[0];
    if (!source) return;
    setCover({ from: source.id, to, amountMinor });
    setDialog("move");
  };
  const itemId = item?.id ?? "";
  const onPreview = useCallback((style: EnvelopeStyle | null) => previewStyle(itemId, style), [previewStyle, itemId]);
  const otherNames = useMemo(
    () => envelopes.filter((envelope) => dialog === "create" || envelope.id !== itemId).map((envelope) => envelope.name),
    [envelopes, itemId, dialog],
  );

  const onTransfer = async (draft: MovementDraft) => {
    if (!(await moveMoney(draft))) return;
    const name = (id?: string) => envelopes.find((envelope) => envelope.id === id)?.name ?? "";
    toast.success(`Moviste ${formatAmount(draft.amountMinor / 100)} de ${name(draft.envelopeId)} a ${name(draft.toEnvelopeId)}.`);
  };

  const onCancelDocument = (document: EnvelopeDocument) =>
    showDialog({
      type: "question",
      title: "¿Cancelar este movimiento?",
      message: `${document.concept} (${formatAmount(document.amountMinor / 100)}). Se registra una cancelación con fecha de hoy y los saldos vuelven a como estaban; el original queda en el historial.`,
      confirmText: "Cancelar movimiento",
      cancelText: "No",
      onConfirm: () => {
        void cancelMovement(document.movementId).then((ok) => ok && toast.success(`Cancelado: ${document.concept}.`));
      },
    });

  const onArchive = (target: EnvelopeItem) =>
    showDialog({
      type: "question",
      title: `¿Archivar ${target.name}?`,
      message: "Sale de la carpeta y su historial se conserva. Solo se archivan sobres vacíos.",
      confirmText: "Archivar",
      cancelText: "Cancelar",
      onConfirm: () => {
        void archiveEnvelope(target.id).then((archived) => {
          if (archived) toast.success(`${target.name} se archivó.`);
        });
      },
    });

  // La carpeta se encuadra en la parte del lienzo que no tapa la interfaz.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const measure = () => {
      const s = scene.getBoundingClientRect();
      const nav = navRef.current?.getBoundingClientRect();
      const card = cardRef.current?.getBoundingClientRect();
      const pill = pillRef.current?.getBoundingClientRect();
      const tiles = tilesRef.current?.getBoundingClientRect();
      const cardOver = Boolean(card && overlaps(s, card));
      // Escritorio: la carpeta queda por encima de la fila de sobres. Móvil: por encima del botón.
      const bottomEdge = cardOver ? (tiles && overlaps(s, tiles) ? tiles.top : s.bottom - 16) : (pill?.top ?? s.bottom - 16);
      setSafeArea({
        top: nav && overlaps(s, nav) ? nav.bottom - s.top + 8 : 8,
        right: card && cardOver ? s.right - card.left + 16 : 8,
        bottom: Math.max(16, s.bottom - bottomEdge + 12),
        left: 8,
      });
    };
    const observer = new ResizeObserver(measure);
    [scene, navRef.current, cardRef.current, tilesRef.current].forEach((el) => el && observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, [setSafeArea]);

  return (
    <main className={`${handwriting.variable} relative isolate min-h-dvh overflow-x-clip lg:h-dvh lg:min-h-[720px] lg:overflow-hidden`}>
      <OrganizerBackdrop />
      <div ref={navRef} className="relative z-20 lg:absolute lg:inset-x-[3%] lg:top-[2.4%]">
        <OrganizerNav onAccounts={() => setDialog("accounts")} alert={alert} />
      </div>

      <section
        ref={sceneRef}
        aria-label="Carpeta 3D"
        aria-describedby="organizer-help"
        className="relative h-[58svh] min-h-[380px] lg:absolute lg:inset-0 lg:h-auto lg:min-h-0"
      >
        {unavailable ? (
          <div role="status" className="absolute inset-x-6 top-1/2 mx-auto flex max-w-sm -translate-y-1/2 flex-col items-center gap-2 rounded-3xl border border-card/70 bg-card/60 p-6 text-center backdrop-blur-xl lg:left-[8%] lg:mx-0">
            <BookOpen className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Tu organizador sigue disponible</p>
            <p className="text-xs text-muted-foreground">{unavailable} Usa los sobres de abajo para explorar.</p>
          </div>
        ) : (
          <OrganizerCanvas {...canvas} />
        )}
        <button
          ref={pillRef}
          type="button"
          disabled={busy}
          onClick={() => void toggleBinder()}
          className="absolute bottom-4 left-4 z-10 flex h-14 items-center gap-4 rounded-full border border-card/70 bg-card/45 pr-5 pl-6 text-[0.95rem] font-medium text-foreground shadow-lg shadow-foreground/5 outline-none backdrop-blur-xl transition-colors hover:bg-card/65 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-70 lg:bottom-[11%] lg:left-[3.7%] lg:h-[5.5rem] lg:gap-6 lg:pr-8 lg:pl-9 lg:text-lg"
        >
          <BookOpen className="size-6 lg:size-7" strokeWidth={1.6} aria-hidden="true" />
          {view.stage === "closed" ? "Abrir carpeta" : "Cerrar carpeta"}
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
        {!unavailable && (
          // Pista de gestos solo en pantallas táctiles.
          <p aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-2 hidden justify-center pointer-coarse:flex">
            <span className="rounded-full bg-card/60 px-3 py-1 text-xs text-foreground/75 backdrop-blur-md">{swipeHint(view.stage)}</span>
          </p>
        )}
        <p id="organizer-help" className="sr-only">
          Representación visual de la carpeta. Usa los botones de los sobres o el teclado: flechas para cambiar de sobre y Escape para regresar. En pantallas táctiles también puedes deslizar.
        </p>
        <p className="sr-only" aria-live="polite">
          {announce(view, envelopes)}
        </p>
      </section>

      <div className="relative z-10 flex flex-col gap-4 px-3 pb-6 lg:contents">
        <div ref={tilesRef} className="lg:absolute lg:right-[1.6%] lg:bottom-[2.6%] lg:z-10 lg:w-[min(51%,1000px)]">
          <EnvelopeTiles
            envelopes={envelopes}
            selectedId={selectedId}
            busy={busy}
            onSelect={(id) => void selectEnvelope(id)}
            onCreate={envelopes.length < MAX_ACTIVE_ENVELOPES ? () => setDialog("create") : undefined}
          />
        </div>
        <div ref={cardRef} className="lg:absolute lg:top-[13%] lg:right-[2%] lg:z-10 lg:w-[min(27.5%,540px)] lg:min-w-[380px]">
          <AnimatePresence mode="wait" initial={false}>
            {!item ? (
              <motion.div key="loading" {...cardSwap(reduceMotion)} className={cn("rounded-[1.75rem] p-6 text-sm text-muted-foreground", glass)}>
                Abriendo tu libro…
              </motion.div>
            ) : view.stage === "browsing" || view.stage === "reading" ? (
              <motion.div
                key="documents"
                {...cardSwap(reduceMotion)}
                className={cn("rounded-[1.75rem] p-5 lg:p-6", glass, cardHeight)}
              >
                <DocumentsPanel
                  item={item}
                  stage={view.stage}
                  busy={busy}
                  documents={documents}
                  visible={visibleDocuments}
                  documentId={view.documentId}
                  filter={filter}
                  onFilter={setFilter}
                  onPick={(id) => void perform({ type: "PICK_DOCUMENT", id })}
                  onReturnDocument={() => void perform({ type: "RETURN_DOCUMENT" })}
                  onStepDocument={stepDocument}
                  onCloseEnvelope={() => void perform({ type: "CLOSE_ENVELOPE" })}
                  onCancelMovement={onCancelDocument}
                />
              </motion.div>
            ) : (
              <motion.div
                key="detail"
                {...cardSwap(reduceMotion)}
              >
                <EnvelopeDetailCard
                  item={item}
                  envelopes={envelopes}
                  activity={activityFor(item.id)}
                  budget={budgets[item.id]}
                  onFund={(amountMinor) => openCover(item.id, amountMinor, true)}
                  onMoveMoney={() => {
                    setCover(null);
                    setDialog("move");
                  }}
                  onRecord={() => openRecord({ envelopeId: item.id })}
                  onEdit={() => setDialog("edit")}
                  onArchive={() => onArchive(item)}
                  stage={view.stage}
                  busy={busy}
                  onExtract={() => void extractSelected()}
                  onOpenEnvelope={() => void perform({ type: "OPEN_ENVELOPE" })}
                  onShow={() => void selectEnvelope(item.id)}
                  onStep={step}
                  onBack={back}
                  className={cardHeight}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {item && (
        <MoveMoneyDialog
          open={dialog === "move"}
          onOpenChange={(open) => setDialog(open ? "move" : null)}
          envelopes={envelopes}
          defaultFrom={cover?.from ?? item.id}
          defaultTo={cover?.to}
          defaultAmountMinor={cover?.amountMinor}
          checkDraft={checkDraft}
          onConfirm={(draft) => void onTransfer(draft)}
        />
      )}
      <RecordMovementDialog open={dialog === "record"} onOpenChange={(open) => setDialog(open ? "record" : null)} defaults={recordDefaults} onRecorded={(movement) => void animateMovement(movement)} />
      <AccountsSheet
        open={dialog === "accounts"}
        onOpenChange={(open) => setDialog(open ? "accounts" : null)}
        onPayCard={() => openRecord({ kind: "cardPayment" })}
        onCover={openCover}
        onCancelMovement={cancelMovement}
        onBeforeReplace={settleBinder}
      />
      <EditEnvelopeDialog
        open={dialog === "edit" || dialog === "create"}
        onOpenChange={(open) => setDialog(open ? dialog : null)}
        item={dialog === "edit" ? (item ?? null) : null}
        otherNames={otherNames}
        usedColors={envelopes.map((envelope) => envelope.color)}
        onPreview={onPreview}
        onSave={(style) => {
          if (dialog === "create") void createEnvelope(style).then((created) => created && toast.success(`${created.name} está en la carpeta.`));
          else if (item) void commitStyle(item.id, style);
        }}
      />
    </main>
  );
}
