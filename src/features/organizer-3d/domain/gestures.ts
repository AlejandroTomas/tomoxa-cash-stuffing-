import type { OrganizerAction, OrganizerView } from "./organizerView";

export type SwipeDirection = "left" | "right" | "up" | "down";

export interface PointerTrack {
  /** Desplazamiento en px (pantalla: +y hacia abajo). */
  dx: number;
  dy: number;
  /** Duración del gesto en ms. */
  dt: number;
}

/** Por debajo de esto (px) es un toque, no un gesto. */
export const TAP_SLOP = 10;
/** Distancia para contar como deslizamiento aunque sea lento. */
export const SWIPE_DISTANCE = 60;
/** Velocidad (px/ms) para contar como deslizamiento aunque sea corto. */
export const SWIPE_VELOCITY = 0.45;
const MIN_FLICK = 24;

/** Toque, deslizamiento (con dirección dominante) o nada (arrastre corto y lento). */
export function classifyGesture({ dx, dy, dt }: PointerTrack): "tap" | SwipeDirection | null {
  const distance = Math.hypot(dx, dy);
  if (distance <= TAP_SLOP) return "tap";
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const along = horizontal ? Math.abs(dx) : Math.abs(dy);
  const velocity = along / Math.max(dt, 1);
  const isSwipe = along >= SWIPE_DISTANCE || (along >= MIN_FLICK && velocity >= SWIPE_VELOCITY);
  if (!isSwipe) return null;
  if (horizontal) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

/** Sobre el que empezó el gesto (para "deslizar hacia arriba sobre el sobre"). */
export interface SwipeTarget {
  envelope?: string;
  document?: string;
}

/** Qué hace un deslizamiento según el estado. Paso de sobre/documento: `step`. */
export type SwipeCommand =
  | { kind: "action"; action: OrganizerAction }
  | { kind: "stepEnvelope"; direction: -1 | 1 }
  | { kind: "stepDocument"; direction: -1 | 1 };

const next = (direction: SwipeDirection): -1 | 1 => (direction === "left" ? 1 : -1);

export function swipeCommand(view: OrganizerView, direction: SwipeDirection, target: SwipeTarget = {}): SwipeCommand | null {
  const horizontal = direction === "left" || direction === "right";
  switch (view.stage) {
    case "closed":
      // La tapa abre hacia la izquierda: se "arrastra" con el dedo.
      return direction === "left" ? { kind: "action", action: { type: "OPEN" } } : null;
    case "open":
      if (horizontal) return { kind: "stepEnvelope", direction: next(direction) };
      // Arriba sobre un sobre: lo saca ya abierto.
      if (direction === "up" && target.envelope) return { kind: "action", action: { type: "OPEN_ENVELOPE", id: target.envelope } };
      return null;
    case "browsing":
      if (horizontal) return { kind: "stepDocument", direction: next(direction) };
      if (direction === "down") return { kind: "action", action: { type: "CLOSE_ENVELOPE" } };
      if (direction === "up" && target.document) return { kind: "action", action: { type: "PICK_DOCUMENT", id: target.document } };
      return null;
    case "reading":
      if (horizontal) return { kind: "stepDocument", direction: next(direction) };
      if (direction === "down") return { kind: "action", action: { type: "RETURN_DOCUMENT" } };
      return null;
  }
}

/** Texto de ayuda para pantallas táctiles, según el estado. */
export function swipeHint(stage: OrganizerView["stage"]): string {
  switch (stage) {
    case "closed":
      return "Desliza a la izquierda para abrir";
    case "open":
      return "Toca un sobre para abrirlo";
    case "browsing":
      return "Desliza entre documentos · abajo lo regresas";
    case "reading":
      return "Desliza entre documentos · abajo lo guarda";
  }
}
