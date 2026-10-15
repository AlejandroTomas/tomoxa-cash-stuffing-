import { useEffect, useState } from "react";

/**
 * Devuelve `value` con retraso: solo se actualiza cuando deja de cambiar
 * durante `delay` ms. Para búsquedas mientras se escribe.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}
