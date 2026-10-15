"use client";

import { useEffect } from "react";

import { startOutbox } from "@/core/sync";

/**
 * Arranca el motor del outbox una vez en el navegador. Si `SYNC_ENTITIES`
 * está vacío no hace nada. Bórralo si el proyecto no usa `core/sync`.
 */
export function OutboxBootstrap() {
  useEffect(() => {
    startOutbox();
  }, []);
  return null;
}
