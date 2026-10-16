"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_ORGANIZER_STYLE, ORGANIZER_STYLE_STORAGE_KEY, parseOrganizerStyle, type OrganizerStyleId } from "../domain/organizerStyle";

const CHANGE_EVENT = "aurora:organizer-style";
/** Si el navegador no deja guardar (modo privado, almacenamiento bloqueado), el estilo vive en memoria. */
let memory: OrganizerStyleId | null = null;

function read(): OrganizerStyleId {
  if (memory) return memory;
  try {
    return parseOrganizerStyle(window.localStorage.getItem(ORGANIZER_STYLE_STORAGE_KEY));
  } catch {
    return DEFAULT_ORGANIZER_STYLE;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ORGANIZER_STYLE_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Estilo del organizador elegido por quien mira (preferencia del navegador, no
 * dato del libro). `null` en el servidor y durante la hidratación: así no se
 * monta una escena para cambiarla enseguida.
 */
export function useOrganizerStyle() {
  const style = useSyncExternalStore<OrganizerStyleId | null>(subscribe, read, () => null);
  const setStyle = useCallback((next: OrganizerStyleId) => {
    memory = next;
    try {
      window.localStorage.setItem(ORGANIZER_STYLE_STORAGE_KEY, next);
      memory = null;
    } catch {
      // Sin almacenamiento: se queda en memoria hasta recargar.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return { style, setStyle };
}
