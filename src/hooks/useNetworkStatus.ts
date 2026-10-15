"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export interface NetworkStatus {
  isOffline: boolean;
  isOnline: boolean;
  /** `true` durante unos segundos después de recuperar la conexión. */
  wasOffline: boolean;
}

const RECOVERED_MS = 3000;

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/**
 * Estado de la red del navegador. En el servidor asume que hay conexión para no
 * pintar el aviso de "sin conexión" en el HTML inicial.
 *
 * `navigator.onLine === false` es confiable; `true` no lo es (una red sin
 * internet también dice `true`). Úsalo para avisar, no para decidir si mandar.
 */
export function useNetworkStatus(): NetworkStatus {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const onOnline = () => {
      setWasOffline(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setWasOffline(false), RECOVERED_MS);
    };
    const onOffline = () => {
      clearTimeout(timeout);
      setWasOffline(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { isOffline: !isOnline, isOnline, wasOffline };
}
