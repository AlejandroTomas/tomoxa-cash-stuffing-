import { useCallback, useSyncExternalStore } from "react";

/**
 * `true` si la media query coincide. En el servidor y en la hidratación devuelve
 * `serverValue` (default false) y se corrige justo después.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** Computadora (≥1024px). Tablets y teléfonos quedan en `false`. */
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
