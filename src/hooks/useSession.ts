"use client";

import { useSyncExternalStore } from "react";

import { getSession, onSessionChange, type Session } from "@/core/session";

const subscribe = (onChange: () => void) => onSessionChange(onChange);

/** La sesión actual (o `null`). Se actualiza al iniciar/cerrar sesión, también desde otra pestaña. */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, () => null);
}
