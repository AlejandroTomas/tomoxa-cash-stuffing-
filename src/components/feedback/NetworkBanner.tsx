"use client";

import { useState, useEffect } from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { WifiOff, RefreshCw, Wifi, X } from "lucide-react";

export function NetworkBanner() {
  const { isOffline, wasOffline } = useNetworkStatus();
  // Estado visual separado del estado de red — permite animar la transición
  const [showContent, setShowContent] = useState<"offline" | "online" | null>(
    null,
  );
  const [squeezing, setSqueezing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [previous, setPrevious] = useState({ isOffline, wasOffline });

  const retry = () => window.location.reload();

  // Ajusta el estado visual cuando cambia la red (durante el render, no en un efecto).
  if (previous.isOffline !== isOffline || previous.wasOffline !== wasOffline) {
    setPrevious({ isOffline, wasOffline });
    if (isOffline) {
      setShowContent("offline");
      setSqueezing(false);
      setDismissed(false);
    } else if (wasOffline && showContent === "offline") {
      // Squeeze: encoge, cambia el contenido a la mitad y vuelve a abrir.
      setSqueezing(true);
      setDismissed(false);
    } else if (!wasOffline) {
      setShowContent(null);
      setDismissed(false);
    }
  }

  useEffect(() => {
    if (!squeezing) return undefined;
    const swapTimer = setTimeout(() => setShowContent("online"), 180);
    const openTimer = setTimeout(() => setSqueezing(false), 200);
    return () => {
      clearTimeout(swapTimer);
      clearTimeout(openTimer);
    };
  }, [squeezing]);

  if (!showContent || dismissed) return null;

  const isOnlineRecovered = showContent === "online";

  return (
    <div className="fixed bottom-6 left-0 right-0 z-9999 flex justify-center pointer-events-none">
      <div
        className={[
          "pointer-events-auto",
          "flex items-center justify-between gap-4",
          "px-5 py-3 rounded-xl shadow-2xl",
          "min-w-[320px] max-w-[90vw]",
          // Fondo siempre igual — claro y oscuro
          "bg-slate-900 dark:bg-slate-800 text-white border border-white/10",
          // Animación de entrada inicial
          !squeezing && showContent === "offline" ? "network-slide-up" : "",
          // Squeeze macOS
          squeezing ? "network-squeeze" : "network-unsqueeze",
        ].join(" ")}
        role="alert"
        aria-live="assertive"
      >
        {/* Icono + texto */}
        <div className="flex items-center gap-3">
          <div className={isOnlineRecovered ? "network-icon-pop" : ""}>
            {isOnlineRecovered ? (
              <Wifi className="text-emerald-400 shrink-0" size={26} />
            ) : (
              <WifiOff className="text-red-400 shrink-0" size={26} />
            )}
          </div>

          <div className="flex flex-col gap-0.5">
            <strong className="text-sm font-semibold">
              {isOnlineRecovered
                ? "Conexión restaurada"
                : "Sin conexión a internet"}
            </strong>
            <span className="text-xs opacity-75">
              {isOnlineRecovered
                ? "Ya puedes seguir usando la aplicación"
                : "Verifica tu conexión y vuelve a intentarlo"}
            </span>
          </div>
        </div>

        {/* Botón reintentar (solo offline) */}
        {!isOnlineRecovered && (
          <div className="flex items-center gap-2">
            <button
              onClick={retry}
              className="
                flex items-center gap-1.5
                text-sm font-medium text-white
                border border-white/30 rounded-lg
                px-3 py-1.5 shrink-0
                hover:bg-white/10 active:bg-white/20
                transition-colors duration-150
              "
            >
              <RefreshCw size={14} />
              Reintentar
            </button>

            <button
              onClick={() => setDismissed(true)}
              aria-label="Cerrar aviso"
              className="
                p-1.5 rounded-lg border border-white/20 text-white/90
                hover:bg-white/10 hover:text-white
                active:bg-white/20 transition-colors duration-150
              "
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Botón cerrar en estado online restaurado */}
        {isOnlineRecovered && (
          <button
            onClick={() => setDismissed(true)}
            aria-label="Cerrar aviso"
            className="
              p-1.5 rounded-lg border border-white/20 text-white/90
              hover:bg-white/10 hover:text-white
              active:bg-white/20 transition-colors duration-150
            "
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
