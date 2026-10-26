"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { disableNotifications, enableNotifications, notifyPending, notifyStatus, type NotifyStatus } from "@/core/notify";
import { toast } from "@/core/toast";
import { useAppSelector } from "@/hooks/useReduxHooks";
import { toLocalIsoDate } from "@/utils/localDate";
import { paymentReminders } from "../domain/reminders";
import { selectCardSummaries, selectLedgerLoaded } from "../selector";

const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * Manda los avisos de pago pendientes (si están encendidos) al abrir la app,
 * al volver a ella y cada hora mientras está abierta. No pinta nada.
 */
export function usePaymentReminders() {
  const loaded = useAppSelector(selectLedgerLoaded);
  const [today, setToday] = useState(() => toLocalIsoDate(new Date()));
  const cards = useAppSelector((state) => selectCardSummaries(state, today));

  useEffect(() => {
    if (!loaded) return;
    void notifyPending(paymentReminders(cards, today));
  }, [loaded, cards, today]);

  useEffect(() => {
    // Cambiar `today` recalcula los avisos (y pasa de día si la app quedó abierta).
    const refresh = () => {
      if (document.visibilityState === "visible") setToday(toLocalIsoDate(new Date()));
    };
    const timer = window.setInterval(refresh, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
}

const STATUS_TEXT: Record<NotifyStatus, string> = {
  unsupported: "Este navegador no permite avisos. En iPhone, primero agrega Ahorroxa a la pantalla de inicio.",
  denied: "Los avisos están bloqueados para este sitio: actívalos en los ajustes del navegador.",
  off: "Apagados en este dispositivo.",
  on: "Encendidos en este dispositivo.",
};

/** Ajuste para encender o apagar los avisos de pago en este dispositivo. */
export function ReminderSettings() {
  // Se lee al montar (en el cliente): el permiso solo existe en el navegador.
  const [status, setStatus] = useState<NotifyStatus>(() => (typeof window === "undefined" ? "off" : notifyStatus()));
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    const next = await enableNotifications();
    setStatus(next);
    setBusy(false);
    if (next === "on") toast.success("Listo: te avisaremos de pagos y mensualidades.");
  };

  return (
    <section aria-labelledby="reminders-title" className="space-y-3">
      <div>
        <h3 id="reminders-title" className="text-sm font-medium text-muted-foreground">
          Recordatorios de pago
        </h3>
        <p className="text-xs text-muted-foreground">
          Te avisamos cuando se acerque la fecha límite de una tarjeta o toque apartar una mensualidad a meses. Por ahora el aviso llega al abrir Ahorroxa o mientras está abierta.
        </p>
        <p className="mt-1 text-xs text-foreground/80">{STATUS_TEXT[status]}</p>
      </div>
      {status === "on" ? (
        <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setStatus(disableNotifications())}>
          <BellOff /> Apagar
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={busy || status !== "off"} onClick={() => void enable()}>
          <BellRing /> Activar avisos
        </Button>
      )}
    </section>
  );
}
