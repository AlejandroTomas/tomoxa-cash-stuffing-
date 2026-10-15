import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Valor persistido en `localStorage`, sincronizado entre componentes y
 * pestañas. Para preferencias del usuario (columnas visibles, filtros
 * recordados, vista elegida), nunca para datos que deban ser confiables.
 *
 * Sin error de hidratación: en el servidor y en la hidratación devuelve
 * `initial`; el valor guardado aparece justo después. Si `localStorage` no está
 * disponible (modo privado, cuota llena) no falla, pero el cambio no se guarda.
 */
const EVENT = "app:local-storage";

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange); // otras pestañas
  window.addEventListener(EVENT, onChange); // esta pestaña
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
};

export function useLocalStorage<T>(
  key: string | undefined,
  initial: T,
): [T, (next: T | ((current: T) => T)) => void] {
  // Se lee el string crudo: es un primitivo estable, así React no re-renderiza en bucle.
  const raw = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) : null),
    () => null,
  );

  const value = useMemo<T>(() => {
    if (raw === null) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
    // `initial` suele ser un literal nuevo en cada render; solo importa el valor guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      if (!key) return;
      const current = (() => {
        const stored = read(key);
        try {
          return stored === null ? initial : (JSON.parse(stored) as T);
        } catch {
          return initial;
        }
      })();
      const resolved = typeof next === "function" ? (next as (c: T) => T)(current) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // sin almacenamiento disponible: se ignora
      }
      window.dispatchEvent(new Event(EVENT));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, setValue];
}
