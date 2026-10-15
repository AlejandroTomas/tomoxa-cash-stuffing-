"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reportError } from "@/core/logger";
import { neighborEnvelope, type EnvelopeId } from "../mocks/envelopes.mock";
import { initialView, transitionView, type OrganizerAction, type OrganizerView } from "../domain/organizerView";
import type { OrganizerSceneApi, SceneIntent } from "../scene/organizerScene";

/**
 * Orquesta la máquina de estados y la escena: una acción a la vez, la UI se
 * bloquea mientras anima y el estado cambia cuando la animación termina.
 * Sin escena (sin WebGL) las transiciones son instantáneas.
 */
export function useOrganizerController() {
  const [view, setView] = useState<OrganizerView>(initialView);
  const [busy, setBusy] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const sceneRef = useRef<OrganizerSceneApi | null>(null);
  const viewRef = useRef<OrganizerView>(initialView);
  const busyRef = useRef(false);

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

  const step = useCallback(
    (direction: -1 | 1) => void selectEnvelope(neighborEnvelope(viewRef.current.activeId, direction)),
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

  const onReady = useCallback((api: OrganizerSceneApi | null) => {
    sceneRef.current = api;
    setSceneReady(Boolean(api));
  }, []);

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
    busy,
    sceneReady,
    unavailable,
    perform,
    selectEnvelope,
    step,
    back,
    canvas: { onReady, onIntent, onUnavailable: setUnavailable },
  };
}
