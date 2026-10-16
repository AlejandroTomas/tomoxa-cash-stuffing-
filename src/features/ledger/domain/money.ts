/** Montos en centavos ↔ texto (MXN). */

const amountFormat = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 180000 → "$ 1,800.00"; negativos: "−$ 100.00". */
export function formatMinor(minor: number): string {
  const text = `$ ${amountFormat.format(Math.abs(minor) / 100)}`;
  return minor < 0 ? `−${text}` : text;
}

/**
 * "1,234.50", "$ 1234.5", "800" → centavos. `null` si no es un monto válido
 * (letras, más de dos decimales, cero o negativo).
 */
export function parseAmountMinor(text: string): number | null {
  const clean = text.replace(/[\s$]/g, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [pesos, cents = ""] = clean.split(".");
  const minor = Number(pesos) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/** Centavos → texto para un campo de monto ("1234.5" → "1234.50", sin ".00"). */
export const minorToInput = (minor: number) => (minor / 100).toFixed(2).replace(/\.00$/, "");
