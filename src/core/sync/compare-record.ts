/**
 * Compara lo que se mandó en un CREATE contra lo que el servidor tiene.
 *
 * Sirve para no dar por sincronizado un registro que existe pero con OTROS
 * datos: pasa si alguien usó `create` sobre un registro que ya existía, o si
 * el servidor fusionó en vez de rechazar. En los dos casos lo que se mandó no
 * quedó guardado.
 *
 * Es conservadora a propósito, para no bloquear un registro correcto:
 * - Solo compara campos que vienen con valor en los dos lados. Un `null` del
 *   servidor puede ser un default o un campo que no se pidió.
 * - Fechas ISO se comparan como instante, y strings con JSON como valor.
 */

export interface FieldDifference {
  field: string;
  sent: unknown;
  stored: unknown;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

function parseJsonText(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function equalValues(sent: unknown, stored: unknown): boolean {
  if (Object.is(sent, stored)) return true;

  if (typeof sent === "number" && typeof stored === "number") {
    return sent === stored;
  }

  if (typeof sent === "string" && typeof stored === "string") {
    if (ISO_DATE.test(sent) && ISO_DATE.test(stored)) {
      const a = Date.parse(sent);
      const b = Date.parse(stored);
      if (!Number.isNaN(a) && !Number.isNaN(b)) return a === b;
    }
    const sentJson = parseJsonText(sent);
    const storedJson = parseJsonText(stored);
    if (sentJson !== undefined && storedJson !== undefined) {
      return equalValues(sentJson, storedJson);
    }
    return false;
  }

  if (Array.isArray(sent) && Array.isArray(stored)) {
    return sent.length === stored.length && sent.every((item, i) => equalValues(item, stored[i]));
  }

  if (sent !== null && stored !== null && typeof sent === "object" && typeof stored === "object") {
    const sentRecord = sent as Record<string, unknown>;
    const storedRecord = stored as Record<string, unknown>;
    // Un objeto anidado se compara con la misma regla: solo lo que trae valor en los dos.
    return Object.keys(sentRecord).every((key) => {
      const a = sentRecord[key];
      const b = storedRecord[key];
      return a == null || b == null || equalValues(a, b);
    });
  }

  return false;
}

/** Campos con valor en los dos lados que no coinciden. Vacío = es el mismo registro. */
export function diffSentVsStored(
  sent: Record<string, unknown>,
  stored: Record<string, unknown>
): FieldDifference[] {
  return Object.keys(sent)
    .filter((field) => field !== "id")
    .filter((field) => {
      const a = sent[field];
      const b = stored[field];
      return a != null && b != null && !equalValues(a, b);
    })
    .map((field) => ({ field, sent: sent[field], stored: stored[field] }));
}

export function describeDifferences(differences: FieldDifference[]): string {
  return differences
    .slice(0, 5)
    .map(
      ({ field, sent, stored }) =>
        `${field}: enviado ${JSON.stringify(sent)}, en servidor ${JSON.stringify(stored)}`
    )
    .join("; ");
}
