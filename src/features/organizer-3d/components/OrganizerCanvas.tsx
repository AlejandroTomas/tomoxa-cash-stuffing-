"use client";

import { useEffect, useRef } from "react";
import { reportError } from "@/core/logger";
import { WebGLUnavailableError } from "../errors/organizer-errors";
import type { OrganizerStyleId } from "../domain/organizerStyle";
import type { OrganizerSceneApi, SceneIntent } from "../scene/contract";
import { createSceneFor } from "../scene/createScene";

interface OrganizerCanvasProps {
  /** Qué organizador dibujar. Para cambiarlo, el padre vuelve a montar el lienzo (`key`). */
  style: OrganizerStyleId;
  /** Desvanecido mientras se cambia de estilo. */
  fading?: boolean;
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

/** Monta una única escena Three.js (la del estilo) y la libera al desmontar. Solo cliente. */
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
      if (!supportsWebGL()) throw new WebGLUnavailableError();
      // Sin WebGL es un caso esperado (aviso); cualquier otra falla al crear la escena es un bug (error).
      api = createSceneFor(callbacks.current.style, element);
      api.onIntent((intent) => callbacks.current.onIntent(intent));
      callbacks.current.onReady(api);
    } catch (error) {
      const message = reportError(error, {
        context: "organizer3d.scene",
        fallbackMessage: "Este dispositivo no puede mostrar el organizador 3D.",
      });
      callbacks.current.onUnavailable(message);
    }
    return () => {
      callbacks.current.onReady(null);
      api?.dispose();
    };
  }, []);

  return <div ref={mount} className={`absolute inset-0 transition-opacity duration-300 ease-out motion-reduce:transition-none ${props.fading ? "opacity-0" : "opacity-100"}`} />;
}
