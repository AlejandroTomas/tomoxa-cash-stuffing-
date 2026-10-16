"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reportError } from "@/core/logger";
import { describeFilter, EMPTY_FILTER, filterDocuments, type DocumentFilter } from "../domain/documentFilter";
import type { EnvelopeStyle } from "../domain/envelopeStyle";
import type { Transfer } from "../domain/transfer";
import { neighborEnvelope, type EnvelopeId } from "../mocks/envelopes.mock";
import { useDemoLedger } from "./useDemoLedger";
import { backAction, initialView, isEnvelopeOut, transitionView, type OrganizerAction, type OrganizerView } from "../domain/organizerView";
import type { OrganizerSceneApi, SafeArea, SceneIntent } from "../scene/organizerScene";

/**
 * Orquesta la máquina de estados y la escena: una acción a la vez, la UI se
 * bloquea mientras anima y el estado cambia cuando la animación termina.
 * Sin escena (sin WebGL) las transiciones son instantáneas.
 */
/** Sobre que se muestra en la tarjeta de detalle al entrar. */
export const DEFAULT_ENVELOPE: EnvelopeId = "card";

export function useOrganizerController() {
  const [view, setView] = useState<OrganizerView>(initialView);
  /** Último sobre elegido: la tarjeta de detalle lo muestra aunque la carpeta esté cerrada. */
  const [selectedId, setSelectedId] = useState<EnvelopeId>(DEFAULT_ENVELOPE);
  const [busy, setBusy] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const sceneRef = useRef<OrganizerSceneApi | null>(null);
  const viewRef = useRef<OrganizerView>(initialView);
  const busyRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // ── Documentos del sobre seleccionado y su filtro ─────────────────────────
  const ledger = useDemoLedger();
  const { documentsFor, recordTransfer, saveStyle, withStyle, envelopeOf } = ledger;
  const [filter, setFilterState] = useState<DocumentFilter>(EMPTY_FILTER);
  const documents = useMemo(() => documentsFor(selectedId), [documentsFor, selectedId]);
  const envelopesRef = useRef(ledger.envelopes);
  useEffect(() => {
    envelopesRef.current = ledger.envelopes;
  }, [ledger.envelopes]);
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
        else if (action.type === "FOCUS") await scene.focus(action.id);
        else if (action.type === "CLEAR_FOCUS") await scene.clearFocus();
        else if (action.type === "EXTRACT" && before.activeId) await scene.extract(before.activeId);
        else if (action.type === "RETURN" && before.activeId) await scene.returnEnvelope(before.activeId);
        else if (action.type === "OPEN_ENVELOPE") {
          const { all, visible } = documentsRef.current;
          await scene.openEnvelope(all, visible.map((doc) => doc.id), describeFilter(filterRef.current));
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

  /** Guarda lo que esté fuera (documento → solapa → sobre) hasta dejar el sobre enfocado. */
  const putEnvelopeBack = useCallback(async () => {
    while (isEnvelopeOut(viewRef.current.stage)) {
      const action = backAction(viewRef.current.stage);
      if (!action || !(await perform(action))) return;
    }
  }, [perform]);

  /** Lleva a cualquier sobre al frente desde cualquier estado (abre o regresa lo necesario). */
  const selectEnvelope = useCallback(
    async (id: EnvelopeId) => {
      if (busyRef.current) return;
      if (viewRef.current.stage === "closed") await perform({ type: "OPEN" });
      const current = viewRef.current;
      if (isEnvelopeOut(current.stage)) {
        if (current.activeId === id) return;
        await putEnvelopeBack();
      }
      await perform({ type: "FOCUS", id });
    },
    [perform, putEnvelopeBack],
  );

  /** Extrae el sobre seleccionado, abriendo y enfocando antes si hace falta. */
  const extractSelected = useCallback(async () => {
    if (busyRef.current) return;
    if (viewRef.current.activeId !== selectedId || viewRef.current.stage !== "focused") await selectEnvelope(selectedId);
    await perform({ type: "EXTRACT" });
  }, [perform, selectEnvelope, selectedId]);

  /** Abre o cierra la carpeta (el botón "Abrir carpeta"). */
  const toggleBinder = useCallback(async () => {
    if (viewRef.current.stage === "closed") {
      // Abre con todos los sobres en su lugar; el seleccionado se ve en la tarjeta.
      await perform({ type: "OPEN" });
    } else await perform({ type: "CLOSE" });
  }, [perform]);

  const step = useCallback(
    (direction: -1 | 1) => void selectEnvelope(neighborEnvelope(viewRef.current.activeId ?? selectedIdRef.current, direction)),
    [selectEnvelope],
  );

  /**
   * Mueve dinero (demo): deja la carpeta abierta y sin sobres fuera, anima las
   * fichas y luego actualiza saldos y movimientos. Devuelve si se aplicó.
   */
  const moveMoney = useCallback(
    async (transfer: Transfer): Promise<boolean> => {
      if (busyRef.current) return false;
      if (viewRef.current.stage === "closed") await perform({ type: "OPEN" });
      await putEnvelopeBack();
      if (viewRef.current.stage === "focused") await perform({ type: "CLEAR_FOCUS" });
      busyRef.current = true;
      setBusy(true);
      try {
        await sceneRef.current?.transfer(transfer.from, transfer.to);
        recordTransfer(transfer);
        setSelectedId(transfer.to);
        return true;
      } catch (error) {
        reportError(error, { context: "organizer3d.transfer" });
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [perform, putEnvelopeBack, recordTransfer],
  );

  /** Vista previa en vivo del estilo en la carpeta; `null` vuelve al estilo guardado. */
  const previewStyle = useCallback(
    (id: EnvelopeId, style: EnvelopeStyle | null) => sceneRef.current?.restyleEnvelope(style ? withStyle(id, style) : envelopeOf(id)),
    [withStyle, envelopeOf],
  );

  const commitStyle = useCallback(
    (id: EnvelopeId, style: EnvelopeStyle) => {
      saveStyle(id, style);
      sceneRef.current?.restyleEnvelope(withStyle(id, style));
    },
    [saveStyle, withStyle],
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

  /** Retrocede un nivel: documento → sobre abierto → extraído → enfocado → abierta → cerrada. */
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
      if (intent.type === "document") {
        if (current.stage === "reading" && current.documentId === intent.id) void perform({ type: "RETURN_DOCUMENT" });
        else void perform({ type: "PICK_DOCUMENT", id: intent.id });
        return;
      }
      // Con el sobre fuera, tocarlo lo abre; los demás sobres no responden.
      if (isEnvelopeOut(current.stage)) {
        if (intent.id === current.activeId && current.stage === "extracted") void perform({ type: "OPEN_ENVELOPE" });
        return;
      }
      if (current.stage === "focused" && intent.id === current.activeId) void perform({ type: "EXTRACT" });
      else void selectEnvelope(intent.id);
    },
    [perform, selectEnvelope],
  );

  /** Lleva una escena recién creada al estado visual actual, sin pasar por la máquina. */
  const syncScene = useCallback(async (api: OrganizerSceneApi, stage: OrganizerView["stage"], activeId: EnvelopeId | null) => {
    busyRef.current = true;
    setBusy(true);
    try {
      await api.open();
      if (activeId && stage !== "open") await api.focus(activeId);
      if (activeId && isEnvelopeOut(stage)) await api.extract(activeId);
      if (stage === "browsing" || stage === "reading") {
        const { all, visible } = documentsRef.current;
        await api.openEnvelope(all, visible.map((doc) => doc.id), describeFilter(filterRef.current));
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

  const onReady = useCallback(
    (api: OrganizerSceneApi | null) => {
      sceneRef.current = api;
      if (api && safeAreaRef.current) api.setSafeArea(safeAreaRef.current);
      // Una escena nueva (p. ej. recarga en caliente) recibe los nombres y colores editados.
      if (api) envelopesRef.current.forEach((item) => api.restyleEnvelope(item));
      setSceneReady(Boolean(api));
      if (!api) return;
      // Se difiere un tick: en desarrollo StrictMode monta, desmonta y vuelve a
      // montar la escena; solo la instancia que sobrevive recibe la intro.
      window.setTimeout(() => {
        if (sceneRef.current !== api) return;
        const { stage, activeId } = viewRef.current;
        // Intro: la carpeta se abre sola y muestra el sobre seleccionado.
        if (stage === "closed") void toggleBinder();
        // Escena nueva con el estado ya avanzado (p. ej. recarga en caliente): alcanzarlo.
        else void syncScene(api, stage, activeId);
      }, 0);
    },
    [toggleBinder, syncScene],
  );

  // Teclado: flechas cambian de sobre, Escape retrocede. No interfiere con campos ni diálogos.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [role='dialog'], [contenteditable='true']")) return;
      if (event.key === "Escape") {
        back();
        return;
      }
      const arrows: Record<string, -1 | 1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      const direction = arrows[event.key];
      const { stage } = viewRef.current;
      if (!direction || stage === "closed" || stage === "extracted") return;
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
    envelopes: ledger.envelopes,
    balances: ledger.balances,
    activityFor: ledger.activityFor,
    moveMoney,
    previewStyle,
    commitStyle,
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
    extractSelected,
    toggleBinder,
    step,
    back,
    setSafeArea,
    canvas: {
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
