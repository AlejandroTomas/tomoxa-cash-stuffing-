"use client";

import { useEffect, useRef } from "react";
import { reportError } from "@/core/logger";
import { createOrganizerScene, type OrganizerSceneApi, type SceneIntent } from "../scene/organizerScene";

interface OrganizerCanvasProps {
  onReady: (api: OrganizerSceneApi | null) => void;
  onIntent: (intent: SceneIntent) => void;
  /** WebGL no disponible o la escena no pudo iniciar: el padre muestra el modo sin 3D. */
  onUnavailable: (message: string) => void;
}

function supportsWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Monta una única escena Three.js y la libera al desmontar. Solo cliente. */
export default function OrganizerCanvas(props: OrganizerCanvasProps) {
  const mount = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  useEffect(() => {
    callbacks.current = props;
  });

  useEffect(() => {
    const element = mount.current;
    if (!element) return;
    let api: OrganizerSceneApi | null = null;
    try {
      if (!supportsWebGL()) throw new Error("WebGL no disponible");
      api = createOrganizerScene(element);
      api.onIntent((intent) => callbacks.current.onIntent(intent));
      callbacks.current.onReady(api);
    } catch (error) {
      const message = reportError(error, {
        context: "organizer3d.scene",
        fallbackMessage: "Este dispositivo no puede mostrar la carpeta 3D.",
      });
      callbacks.current.onUnavailable(message);
    }
    return () => {
      callbacks.current.onReady(null);
      api?.dispose();
    };
  }, []);

  return <div ref={mount} className="absolute inset-0" />;
}
