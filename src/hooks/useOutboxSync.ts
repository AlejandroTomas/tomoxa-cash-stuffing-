"use client";

import { useCallback, useEffect, useState } from "react";

import { reportError } from "@/core/logger";
import { getOutbox, type OutboxEngine, type OutboxEntry, type OutboxSummary } from "@/core/sync";
import { useNetworkStatus } from "./useNetworkStatus";

const REFRESH_INTERVAL_MS = 300;

const EMPTY_SUMMARY: OutboxSummary = { PENDING: 0, SYNCING: 0, FAILED: 0, BLOCKED: 0, DONE: 0 };

export interface UseOutboxSyncReturn {
  summary: OutboxSummary;
  /** Todo lo que falta confirmar, en orden de llegada. */
  entries: OutboxEntry[];
  /** Pendientes de subir (incluye los que reintentan solos). Sin los bloqueados. */
  pendingCount: number;
  blockedCount: number;
  isSyncing: boolean;
  isOnline: boolean;
  /** Usuario con sesión. Las entradas de otro usuario esperan a su dueño. */
  currentUserId: string | null;
  syncNow: () => void;
  /** Devuelve a la cola lo bloqueado (todo, o solo `seq`). */
  retryBlocked: (seq?: number) => void;
  /** Manda con la sesión actual lo que encoló otro usuario (todo, o solo `seq`). */
  adoptEntries: (seq?: number) => void;
}

/**
 * Estado del outbox para la UI. Solo lee y dispara; no encola.
 * `engine` es el de la app por defecto; el showcase pasa el suyo.
 */
export function useOutboxSync(engine: OutboxEngine = getOutbox()): UseOutboxSyncReturn {
  const [summary, setSummary] = useState<OutboxSummary>(EMPTY_SUMMARY);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { isOnline } = useNetworkStatus();

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const [nextSummary, nextEntries, nextUser] = await Promise.all([
          engine.summary(),
          engine.listOutstanding(),
          engine.currentUserId(),
        ]);
        if (cancelled) return;
        setSummary(nextSummary);
        setEntries(nextEntries);
        setCurrentUserId(nextUser);
        setIsSyncing(engine.isSyncing());
      } catch (error) {
        reportError(error, { context: "useOutboxSync.refresh" });
      }
    };

    // Al vaciar una cola grande el motor avisa por cada entrada: se agrupan los
    // avisos en a lo más una lectura cada REFRESH_INTERVAL_MS.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        void refresh();
      }, REFRESH_INTERVAL_MS);
    };

    void refresh();
    const unsubscribe = engine.subscribe(scheduleRefresh);
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    };
  }, [engine]);

  const run = useCallback(
    (action: () => Promise<unknown>, context: string) => {
      action().catch((error: unknown) => reportError(error, { context: `useOutboxSync.${context}` }));
    },
    [],
  );

  return {
    summary,
    entries,
    pendingCount: summary.PENDING + summary.SYNCING + summary.FAILED,
    blockedCount: summary.BLOCKED,
    isSyncing,
    isOnline,
    currentUserId,
    // Lo pidió una persona: adelanta los reintentos en espera (ver `retryNow`).
    syncNow: useCallback(() => run(() => engine.retryNow(), "syncNow"), [engine, run]),
    retryBlocked: useCallback((seq?: number) => run(() => engine.retryBlocked(seq), "retryBlocked"), [engine, run]),
    adoptEntries: useCallback((seq?: number) => run(() => engine.adoptEntries(seq), "adoptEntries"), [engine, run]),
  };
}
