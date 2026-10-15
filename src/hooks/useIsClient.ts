import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => undefined;

/**
 * `false` en el servidor y durante la hidratación, `true` después. Para lo que
 * solo existe en el navegador (tema resuelto, `window`, `localStorage`) sin el
 * clásico `useEffect(() => setMounted(true))`.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
