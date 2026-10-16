"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reportError } from "@/core/logger";
import type { Movement } from "@/features/ledger/domain/types";
import type { MovementDraft } from "@/features/ledger/domain/validation";
import { moneyFlowOf, reversalFlowOf, type MoneyFlow } from "../domain/transfer";
import { describeFilter, EMPTY_FILTER, filterDocuments, type DocumentFilter } from "../domain/documentFilter";
import type { EnvelopeStyle } from "../domain/envelopeStyle";
import { neighborEnvelope, type EnvelopeId } from "../domain/envelopeView";
import { swipeCommand } from "../domain/gestures";
import { backAction, initialView, isEnvelopeOut, transitionView, type OrganizerAction, type OrganizerView } from "../domain/organizerView";
import type { OrganizerSceneApi, SafeArea, SceneIntent } from "../scene/organizerScene";
import type { OrganizerStyleId } from "../domain/organizerStyle";
import { useLedgerData } from "./useLedgerData";
import { useOrganizerStyle } from "./useOrganizerStyle";

/** Espera al siguiente cuadro (para que React pinte los datos recién guardados). */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Cuánto dura el desvanecido del lienzo al cambiar de estilo (ms). */
const STYLE_FADE_MS = 220;

/** Sobre que se muestra en la tarjeta de detalle al entrar (si existe). */
export const DEFAULT_ENVELOPE: EnvelopeId = "card";

/**
 * Orquesta la máquina de estados, la escena y el libro: una acción a la vez, la
 * UI se bloquea mientras anima y el estado cambia cuando la animación termina.
 * Sin escena (sin WebGL) las transiciones son instantáneas.
 */
export function useOrganizerController() {
  const ledger = useLedgerData();
  const { envelopes, documentsFor, withStyle, cancel } = ledger;
  const [view, setView] = useState<OrganizerView>(initialView);
  const [chosenId, setSelectedId] = useState<EnvelopeId>(DEFAULT_ENVELOPE);
  const [busy, setBusy] = useState(false);
  // La escena montada (no solo un booleano: al cambiar de estilo se reemplaza en un mismo render y los efectos deben volver a correr).
  const [sceneApi, setSceneApi] = useState<OrganizerSceneApi | null>(null);
  const sceneReady = sceneApi !== null;
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const sceneRef = useRef<OrganizerSceneApi | null>(null);
  const { style, setStyle } = useOrganizerStyle();
  // Mientras se cambia de estilo, el lienzo se desvanece y la escena anterior se libera.
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(fadeTimer.current), []);
  const viewRef = useRef<OrganizerView>(initialView);
  const busyRef = useRef(false);

  /** Último sobre elegido; si ya no existe (archivado), el primero de la carpeta. */
  const selectedId = envelopes.some((item) => item.id === chosenId) ? chosenId : (envelopes[0]?.id ?? chosenId);
  const selectedIdRef = useRef(selectedId);
  const envelopesRef = useRef(envelopes);
  const documentsForRef = useRef(documentsFor);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    envelopesRef.current = envelopes;
    documentsForRef.current = documentsFor;
  }, [selectedId, envelopes, documentsFor]);

  // ── Documentos del sobre seleccionado y su filtro ─────────────────────────
  const [filter, setFilterState] = useState<DocumentFilter>(EMPTY_FILTER);
  const documents = useMemo(() => documentsFor(selectedId), [documentsFor, selectedId]);
  const visibleDocuments = useMemo(() => filterDocuments(documents, filter), [documents, filter]);
  const documentsRef = useRef({ all: documents, visible: visibleDocuments });
  const filterRef = useRef(filter);
  useEffect(() => {
    documentsRef.current = { all: documents, visible: visibleDocuments };
    filterRef.current = filter;
  }, [documents, visibleDocuments, filter]);
  // Cada sobre empieza sin filtro.
  const [filterOwner, setFilterOwner] = useState(selectedId);
  if (filterOwner !== selectedId) {
    setFilterOwner(selectedId);
    setFilterState(EMPTY_FILTER);
  }

  /** Cambia el filtro y reacomoda el abanico (sin bloquear la interfaz). */
  const setFilter = useCallback((next: DocumentFilter) => {
    setFilterState(next);
    const ids = filterDocuments(documentsRef.current.all, next).map((doc) => doc.id);
    sceneRef.current?.showDocuments(ids, describeFilter(next));
  }, []);

  const perform = useCallback(async (action: OrganizerAction): Promise<boolean> => {
    if (busyRef.current) return false;
    const before = viewRef.current;
    const after = transitionView(before, action);
    if (after === before) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      const scene = sceneRef.current;
      if (scene) {
        if (action.type === "OPEN") await scene.open();
        else if (action.type === "CLOSE") await scene.close();
        else if (action.type === "OPEN_ENVELOPE") {
          // Otro sobre empieza sin filtro; el mismo conserva el suyo.
          const all = documentsForRef.current(action.id);
          const chosen = action.id === selectedIdRef.current ? filterRef.current : EMPTY_FILTER;
          await scene.openEnvelope(action.id, all, filterDocuments(all, chosen).map((doc) => doc.id), describeFilter(chosen));
        } else if (action.type === "CLOSE_ENVELOPE") await scene.closeEnvelope();
        else if (action.type === "PICK_DOCUMENT") await scene.pickDocument(action.id);
        else if (action.type === "RETURN_DOCUMENT") await scene.returnDocument();
      }
      viewRef.current = after;
      setView(after);
      if (after.activeId) setSelectedId(after.activeId);
      return true;
    } catch (error) {
      reportError(error, { context: "organizer3d.animation", details: { action: action.type } });
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  /** Guarda lo que esté fuera (documento → sobre) hasta dejar la carpeta abierta sin ningún sobre fuera. */
  const putEnvelopeBack = useCallback(async () => {
    while (isEnvelopeOut(viewRef.current.stage)) {
      const action = backAction(viewRef.current.stage);
      if (!action || !(await perform(action))) return;
    }
  }, [perform]);

  /** Carpeta abierta y ningún sobre fuera (para mover dinero o reacomodar). */
  const settleBinder = useCallback(async () => {
    if (viewRef.current.stage === "closed") await perform({ type: "OPEN" });
    await putEnvelopeBack();
  }, [perform, putEnvelopeBack]);

  /** Saca un sobre ya abierto desde cualquier estado (abre la carpeta o regresa el que esté fuera). */
  const openEnvelope = useCallback(
    async (id: EnvelopeId) => {
      if (busyRef.current) return;
      const current = viewRef.current;
      if (isEnvelopeOut(current.stage) && current.activeId === id) return;
      if (current.stage === "closed") await perform({ type: "OPEN" });
      await putEnvelopeBack();
      await perform({ type: "OPEN_ENVELOPE", id });
    },
    [perform, putEnvelopeBack],
  );

  /** Elige un sobre para la tarjeta de detalle; si hay uno abierto, abre el elegido en su lugar. */
  const selectEnvelope = useCallback(
    async (id: EnvelopeId) => {
      if (busyRef.current) return;
      if (isEnvelopeOut(viewRef.current.stage)) await openEnvelope(id);
      else setSelectedId(id);
    },
    [openEnvelope],
  );

  /** Abre el sobre de la tarjeta de detalle. */
  const openSelected = useCallback(() => openEnvelope(selectedId), [openEnvelope, selectedId]);

  /** Abre o cierra la carpeta (el botón "Abrir carpeta"). */
  const toggleBinder = useCallback(async () => {
    if (viewRef.current.stage === "closed") await perform({ type: "OPEN" });
    else await perform({ type: "CLOSE" });
  }, [perform]);

  const step = useCallback(
    (direction: -1 | 1) => {
      const ids = envelopesRef.current.map((item) => item.id);
      const next = neighborEnvelope(ids, selectedIdRef.current, direction);
      if (next) void selectEnvelope(next);
    },
    [selectEnvelope],
  );

  /** Ejecuta `task` con la interfaz bloqueada (animaciones + guardado). */
  const runBusy = useCallback(async <T,>(context: string, task: () => Promise<T>): Promise<T | null> => {
    busyRef.current = true;
    setBusy(true);
    try {
      return await task();
    } catch (error) {
      // Los errores de los thunks ya los muestra el panel de alertas.
      reportError(error, { context });
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  /** Mueve dinero entre sobres: anima las fichas y registra el movimiento (ya validado). */
  const moveMoney = useCallback(
    async (draft: MovementDraft): Promise<boolean> => {
      if (busyRef.current || draft.kind !== "assignment" || !draft.envelopeId || !draft.toEnvelopeId) return false;
      await settleBinder();
      const from = draft.envelopeId;
      const to = draft.toEnvelopeId;
      const done = await runBusy("organizer3d.transfer", async () => {
        await sceneRef.current?.transfer(from, to);
        await ledger.record(draft);
        return true;
      });
      if (done) setSelectedId(to);
      return Boolean(done);
    },
    [ledger, runBusy, settleBinder],
  );

  /**
   * Anima las fichas de un movimiento ya guardado. Solo con la carpeta abierta y
   * sin un sobre fuera: si no, no hace falta mostrarlo.
   */
  const animateFlow = useCallback(
    async (flow: MoneyFlow | null) => {
      if (!flow || busyRef.current || viewRef.current.stage !== "open") return;
      await runBusy("organizer3d.animateMovement", async () => sceneRef.current?.transfer(flow.from, flow.to));
    },
    [runBusy],
  );

  /** Anima un movimiento recién registrado (ingreso, gasto, pago de tarjeta). */
  const animateMovement = useCallback((movement: Movement) => animateFlow(moneyFlowOf(movement)), [animateFlow]);

  /**
   * Cancela un movimiento: regresa el sobre que esté fuera, cancela, las fichas
   * hacen el camino inverso del original y, si el sobre estaba abierto, se
   * vuelve a abrir con sus documentos ya actualizados.
   */
  const cancelMovement = useCallback(
    async (movementId: string): Promise<boolean> => {
      if (busyRef.current) return false;
      const { stage, activeId } = viewRef.current;
      const reopenId = isEnvelopeOut(stage) ? activeId : null;
      await putEnvelopeBack();
      let original: Movement | undefined;
      try {
        original = await cancel(movementId);
      } catch (error) {
        // El error del thunk ya se mostró en las alertas.
        reportError(error, { context: "organizer3d.cancelMovement" });
        return false;
      }
      if (original) await animateFlow(reversalFlowOf(original));
      if (reopenId) {
        await nextFrame();
        await openEnvelope(reopenId);
      }
      return true;
    },
    [putEnvelopeBack, cancel, animateFlow, openEnvelope],
  );

  /** Vista previa en vivo del estilo en la carpeta; `null` vuelve al estilo guardado. */
  const previewStyle = useCallback(
    (id: EnvelopeId, style: EnvelopeStyle | null) => {
      const item = style ? withStyle(id, style) : envelopesRef.current.find((envelope) => envelope.id === id);
      if (item) sceneRef.current?.restyleEnvelope(item);
    },
    [withStyle],
  );

  /** Guarda nombre, color, icono y descripción (la carpeta se actualiza sola al cambiar los datos). */
  const commitStyle = useCallback((id: EnvelopeId, style: EnvelopeStyle) => runBusy("organizer3d.saveEnvelope", () => ledger.saveStyle(id, style)), [ledger, runBusy]);

  /** Crea un sobre: la carpeta se reacomoda y el nuevo queda seleccionado. */
  const createEnvelope = useCallback(
    async (style: EnvelopeStyle) => {
      await settleBinder();
      const created = await runBusy("organizer3d.createEnvelope", () => ledger.createEnvelope(style));
      if (created) setSelectedId(created.id);
      return created;
    },
    [ledger, runBusy, settleBinder],
  );

  /** Archiva un sobre vacío: sale de la carpeta y se elige su vecino. */
  const archiveEnvelope = useCallback(
    async (id: EnvelopeId) => {
      await settleBinder();
      const ids = envelopesRef.current.map((item) => item.id);
      const neighbor = neighborEnvelope(ids.filter((other) => other !== id), null, 1);
      const archived = await runBusy("organizer3d.archiveEnvelope", () => ledger.archive(id));
      if (archived && neighbor) setSelectedId(neighbor);
      return archived;
    },
    [ledger, runBusy, settleBinder],
  );

  /** Saca el documento siguiente/anterior entre los que pasan el filtro. */
  const stepDocument = useCallback(
    (direction: -1 | 1) => {
      const { visible } = documentsRef.current;
      if (!visible.length) return;
      const current = visible.findIndex((doc) => doc.id === viewRef.current.documentId);
      const index = current === -1 ? (direction === 1 ? 0 : visible.length - 1) : (current + direction + visible.length) % visible.length;
      void perform({ type: "PICK_DOCUMENT", id: visible[index].id });
    },
    [perform],
  );

  /** Retrocede un nivel: documento → sobre abierto → abierta → cerrada. */
  const back = useCallback(() => {
    const action = backAction(viewRef.current.stage);
    if (action) void perform(action);
  }, [perform]);

  const onIntent = useCallback(
    (intent: SceneIntent) => {
      const current = viewRef.current;
      if (intent.type === "binder") {
        if (current.stage === "closed") void perform({ type: "OPEN" });
        return;
      }
      if (intent.type === "swipe") {
        const command = swipeCommand(current, intent.direction, { envelope: intent.envelope, document: intent.document });
        if (!command) return;
        if (command.kind === "stepEnvelope") step(command.direction);
        else if (command.kind === "stepDocument") stepDocument(command.direction);
        else void perform(command.action);
        return;
      }
      if (intent.type === "document") {
        if (current.stage === "reading" && current.documentId === intent.id) void perform({ type: "RETURN_DOCUMENT" });
        else void perform({ type: "PICK_DOCUMENT", id: intent.id });
        return;
      }
      // Tocar un sobre lo saca ya abierto (si había otro fuera, ese regresa primero).
      void openEnvelope(intent.id);
    },
    [perform, openEnvelope, step, stepDocument],
  );

  /** Lleva una escena recién creada al estado visual actual, sin pasar por la máquina. */
  const syncScene = useCallback(async (api: OrganizerSceneApi, stage: OrganizerView["stage"], activeId: EnvelopeId | null) => {
    busyRef.current = true;
    setBusy(true);
    try {
      await api.open();
      if (activeId && isEnvelopeOut(stage)) {
        // El sobre abierto es el seleccionado: sus documentos y su filtro son los actuales.
        const { all, visible } = documentsRef.current;
        await api.openEnvelope(activeId, all, visible.map((doc) => doc.id), describeFilter(filterRef.current));
        if (stage === "reading" && viewRef.current.documentId) await api.pickDocument(viewRef.current.documentId);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const safeAreaRef = useRef<SafeArea | null>(null);
  /** Zona del lienzo que no tapa la interfaz; la escena encuadra ahí la carpeta. */
  const setSafeArea = useCallback((area: SafeArea) => {
    safeAreaRef.current = area;
    sceneRef.current?.setSafeArea(area);
  }, []);

  const onReady = useCallback((api: OrganizerSceneApi | null) => {
    sceneRef.current = api;
    if (api && safeAreaRef.current) api.setSafeArea(safeAreaRef.current);
    setSceneApi(api);
    if (api) setFading(false);
  }, []);

  /**
   * Cambia de organizador sin recargar: el lienzo se desvanece, la escena
   * anterior se libera (timelines, geometrías, contexto WebGL) y la nueva se
   * monta en el mismo estado (mismo sobre elegido, abierto o no). No toca datos.
   */
  const changeStyle = useCallback(
    (next: OrganizerStyleId) => {
      if (next === style) return;
      window.clearTimeout(fadeTimer.current);
      // Si un estilo no pudo montarse, el siguiente lo vuelve a intentar.
      setUnavailable(null);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      if (reduce) {
        setStyle(next);
        return;
      }
      setFading(true);
      fadeTimer.current = window.setTimeout(() => setStyle(next), STYLE_FADE_MS);
    },
    [style, setStyle],
  );

  // Los sobres del libro llegan a la escena (y la reacomodan si cambian).
  useEffect(() => {
    if (sceneReady && ledger.loaded) void sceneRef.current?.setEnvelopes(envelopes);
  }, [sceneApi, sceneReady, ledger.loaded, envelopes]);

  // Intro: con la escena lista y el libro cargado, la carpeta se abre sola. Se
  // difiere un tick: en desarrollo StrictMode monta la escena dos veces y solo la
  // instancia que sobrevive debe recibirla.
  const introFor = useRef<OrganizerSceneApi | null>(null);
  useEffect(() => {
    const api = sceneRef.current;
    if (!sceneReady || !ledger.loaded || !api || introFor.current === api) return;
    const timer = window.setTimeout(async () => {
      if (sceneRef.current !== api) return;
      introFor.current = api;
      await api.setEnvelopes(envelopesRef.current);
      const { stage, activeId } = viewRef.current;
      if (stage === "closed") void toggleBinder();
      else void syncScene(api, stage, activeId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sceneApi, sceneReady, ledger.loaded, toggleBinder, syncScene]);

  // Teclado: flechas cambian de sobre, Escape retrocede. No interfiere con campos ni diálogos.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [role='dialog'], [contenteditable='true']")) return;
      // Con un diálogo u hoja abiertos, Escape es para cerrarlos (aunque el foco haya quedado en la página).
      if (document.querySelector("[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']")) return;
      if (event.key === "Escape") {
        back();
        return;
      }
      const arrows: Record<string, -1 | 1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      const direction = arrows[event.key];
      const { stage } = viewRef.current;
      if (!direction || stage === "closed") return;
      event.preventDefault();
      // Con el sobre abierto las flechas recorren sus documentos.
      if (stage === "browsing" || stage === "reading") stepDocument(direction);
      else step(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [back, step, stepDocument]);

  return {
    view,
    selectedId,
    loaded: ledger.loaded,
    envelopes,
    budgets: ledger.budgets,
    balanceOf: ledger.balanceOf,
    activityFor: ledger.activityFor,
    checkDraft: ledger.checkDraft,
    moveMoney,
    animateMovement,
    cancelMovement,
    settleBinder,
    previewStyle,
    commitStyle,
    createEnvelope,
    archiveEnvelope,
    documents,
    visibleDocuments,
    filter,
    setFilter,
    stepDocument,
    busy,
    sceneReady,
    unavailable,
    perform,
    selectEnvelope,
    openSelected,
    toggleBinder,
    step,
    back,
    setSafeArea,
    style,
    changeStyle,
    canvas: {
      style,
      fading,
      onReady,
      onIntent,
      onUnavailable: (message: string) => {
        setUnavailable(message);
        // Sin 3D la carpeta "abre" al instante para que la interfaz quede igual.
        // Solo abre (no alterna): puede avisar más de una vez (StrictMode monta dos veces).
        if (viewRef.current.stage === "closed") void perform({ type: "OPEN" });
      },
    },
  };
}
