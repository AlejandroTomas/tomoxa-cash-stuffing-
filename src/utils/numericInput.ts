import type { ChangeEvent } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

/**
 * Filtros para campos numéricos de texto: `inputMode` solo cambia el teclado del
 * celular, en computadora se puede escribir cualquier cosa. Estos filtros quitan
 * lo que no cabe mientras se escribe; la validación final sigue en el esquema.
 */

/** Monto: dígitos, comas de miles y un punto con hasta dos decimales ("1,2a34.567" → "1,234.56"). */
export function sanitizeAmountText(text: string): string {
  const clean = text.replace(/[^\d.,]/g, "");
  const dot = clean.indexOf(".");
  if (dot === -1) return clean;
  const decimals = clean.slice(dot + 1).replace(/[.,]/g, "").slice(0, 2);
  return `${clean.slice(0, dot)}.${decimals}`;
}

/** Entero sin signo: solo dígitos, con largo máximo opcional ("1a5" → "15"). */
export function sanitizeDigits(text: string, maxLength?: number): string {
  const digits = text.replace(/\D/g, "");
  return maxLength === undefined ? digits : digits.slice(0, maxLength);
}

/** Envuelve un `register()` de react-hook-form para filtrar el texto antes de guardarlo. */
export function filteredField<T extends UseFormRegisterReturn>(field: T, sanitize: (text: string) => string): T {
  return {
    ...field,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const next = sanitize(event.target.value);
      if (next !== event.target.value) event.target.value = next;
      return field.onChange(event);
    },
  };
}
