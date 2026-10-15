"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reportError } from "@/core/logger";
import { neighborEnvelope, type EnvelopeId } from "../mocks/envelopes.mock";
import { initialView, transitionView, type OrganizerAction, type OrganizerView } from "../domain/organizerView";
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

  /** Lleva a cualquier sobre al frente desde cualquier estado (abre o regresa lo necesario). */
  const selectEnvelope = useCallback(
    async (id: EnvelopeId) => {
      if (busyRef.current) return;
      if (viewRef.current.stage === "closed") await perform({ type: "OPEN" });
      const current = viewRef.current;
      if (current.stage === "extracted") {
        if (current.activeId === id) return;
        await perform({ type: "RETURN" });
      }
      await perform({ type: "FOCUS", id });
    },
    [perform],
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

  /** Retrocede un nivel: extraído → enfocado → abierto → cerrado. */
  const back = useCallback(() => {
    const { stage } = viewRef.current;
    if (stage === "extracted") void perform({ type: "RETURN" });
    else if (stage === "focused") void perform({ type: "CLEAR_FOCUS" });
    else if (stage === "open") void perform({ type: "CLOSE" });
  }, [perform]);

  const onIntent = useCallback(
    (intent: SceneIntent) => {
      const current = viewRef.current;
      if (intent.type === "binder") {
        if (current.stage === "closed") void perform({ type: "OPEN" });
        return;
      }
      if (current.stage === "extracted") {
        if (intent.id === current.activeId) void perform({ type: "RETURN" });
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
      if (activeId && stage === "extracted") await api.extract(activeId);
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
      if (!direction || viewRef.current.stage === "closed") return;
      event.preventDefault();
      step(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [back, step]);

  return {
    view,
    selectedId,
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
        void toggleBinder();
      },
    },
  };
}
