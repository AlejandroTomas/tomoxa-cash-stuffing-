import type { SyncErrorKind } from "./types";

/**
 * Mensaje seguro para el usuario según el tipo de error. El detalle técnico
 * (`lastError`) nunca se muestra fuera de desarrollo: va a `reportError`.
 */
const SAFE_MESSAGES: Record<SyncErrorKind, string> = {
  transient: "No se pudo comunicar con el servidor. Se reintenta solo.",
  unauthenticated: "La sesión venció. Se envía al volver a entrar.",
  conflict: "Otro cambio llegó primero. Se reintenta solo.",
  alreadyExists: "El servidor dice que ya existe, pero no se pudo confirmar. Revisar.",
  divergent: "Ya existe en el servidor con otros datos. Revisar.",
  validation: "El servidor rechazó los datos. Revisar.",
  permission: "Tu usuario no tiene permiso para esta operación.",
  notFound: "El registro ya no existe en el servidor.",
  unknown: "Ocurrió un error inesperado. Se reintenta solo.",
};

export function syncErrorMessage(kind: SyncErrorKind | undefined): string | null {
  return kind ? SAFE_MESSAGES[kind] : null;
}
