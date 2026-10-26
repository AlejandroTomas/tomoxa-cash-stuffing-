import { CARD, DOCUMENT, fanPose, fanTop, insidePose } from "./layout";
import { apparentSize, facing, normalize, type FrameTarget, type Pose, type SlotDeck, type Vec3 } from "./slotModel";

/**
 * Tarjetero de escritorio de la cajonera y el archivador: una base escalonada
 * junto al organizador donde las tarjetas de crédito van de pie, una detrás de
 * otra y cada una más alta, así de todas asoma la parte de arriba. Mesa = plano
 * XZ (y = 0), +Z hacia el frente. Sin Three.js: se prueba en Node.
 */
export const STAND = {
  /** Escala de la tarjeta de pie (la presentada va a escala 1, como un sobre). */
  cardScale: 0.48,
  /** Las tarjetas se recargan un poco hacia atrás. */
  lean: -0.14,
  /** Fondo de cada escalón (separación entre tarjetas) y cuánto sube cada uno. */
  step: 0.34,
  rise: 0.3,
  /** Altura del escalón del frente. */
  baseHeight: 0.2,
  /** Cuánto se hunde la tarjeta en su ranura. */
  sink: 0.08,
  /** Margen a los lados de las tarjetas. */
  sidePad: 0.18,
  /** Escalones que se ven aunque haya menos tarjetas. */
  minSlots: 2,
} as const;

/** Dónde va el tarjetero: centro de su base sobre la mesa y giro (hacia la cámara). */
export interface StandPlacement {
  x: number;
  z: number;
  ry: number;
}

export const standSlots = (count: number) => Math.max(count, STAND.minSlots);

const cardH = () => CARD.height * STAND.cardScale;

/** Ancho (X), alto del escalón más alto (Y) y fondo (Z) de la base. */
export function standSize(count: number): Vec3 {
  const slots = standSlots(count);
  return {
    x: CARD.width * STAND.cardScale + 2 * STAND.sidePad,
    y: STAND.baseHeight + (slots - 1) * STAND.rise,
    z: slots * STAND.step + 0.12,
  };
}

/** Escalón `index` (0 = el del frente, el más bajo), en coordenadas del tarjetero. */
export function standStep(index: number, count: number): { z: number; height: number } {
  const size = standSize(count);
  return { z: size.z / 2 - 0.06 - STAND.step / 2 - index * STAND.step, height: STAND.baseHeight + index * STAND.rise };
}

/** Coordenadas del tarjetero → mesa (giro en Y y traslado). */
function toTable(placement: StandPlacement, local: Vec3): Vec3 {
  const cos = Math.cos(placement.ry);
  const sin = Math.sin(placement.ry);
  return { x: placement.x + local.x * cos + local.z * sin, y: local.y, z: placement.z - local.x * sin + local.z * cos };
}

/** Tarjeta en su ranura, subida `lift` en su propio plano (0 = en reposo). */
function cardInSlot(index: number, count: number, placement: StandPlacement, lift = 0): Pose {
  const step = standStep(index, count);
  const along = cardH() / 2 - STAND.sink + lift;
  const local = { x: 0, y: step.height + along * Math.cos(STAND.lean), z: step.z + along * Math.sin(STAND.lean) };
  return { ...toTable(placement, local), rx: STAND.lean, ry: placement.ry, rz: 0, scale: STAND.cardScale };
}

export const standRest = (index: number, count: number, placement: StandPlacement) => cardInSlot(index, count, placement);

/** Asoma de su ranura (para recibir o soltar fichas). */
export const standAjar = (index: number, count: number, placement: StandPlacement) => cardInSlot(index, count, placement, 0.5);

/** Punta de arriba de la tarjeta `index` en reposo (altura sobre la mesa). */
export function standCardTop(index: number, count: number): number {
  const step = standStep(index, count);
  return step.height + (cardH() - STAND.sink) * Math.cos(STAND.lean);
}

/** Centro del tarjetero (para encuadrar). */
export function standCenter(count: number, placement: StandPlacement): Vec3 {
  const top = standCardTop(standSlots(count) - 1, count);
  return { x: placement.x, y: top / 2, z: placement.z };
}

/**
 * Presentada: delante del tarjetero, sobre la línea de la cámara, de cara a
 * ella y a escala de sobre. `reach` = qué tan adelante (libra al organizador).
 */
export function standPresent(count: number, placement: StandPlacement, view: Vec3, reach: number): Pose {
  const center = standCenter(count, placement);
  const v = normalize(view);
  const { rx, ry } = facing(v);
  return { x: center.x + v.x * reach, y: center.y + v.y * reach + 0.5, z: center.z + v.z * reach, rx: rx * 0.6, ry, rz: 0, scale: 1 };
}

/** Sube derecho hasta salir de su ranura (libra la punta de las de atrás) y viene al frente. */
export function standExitPath(index: number, count: number, placement: StandPlacement, view: Vec3, reach: number): Pose[] {
  const backTop = standCardTop(standSlots(count) - 1, count);
  const clear = backTop - standCardTop(index, count) + cardH() * 0.35 + 0.15;
  return [cardInSlot(index, count, placement, clear / Math.cos(STAND.lean)), standPresent(count, placement, view, reach)];
}

/** Caja del tarjetero vista desde la cámara (para sumarla al encuadre del organizador). */
export function standFrame(count: number, placement: StandPlacement, view: Vec3): FrameTarget {
  const size = standSize(count);
  const seen = apparentSize({ x: size.x, y: standCardTop(standSlots(count) - 1, count), z: size.z }, view);
  return { center: standCenter(count, placement), width: seen.width, height: seen.height };
}

/** Con una tarjeta presentada: ella y sus documentos, con el tarjetero a la vista detrás. */
export function standPresentFrame(count: number, placement: StandPlacement, view: Vec3, reach: number): FrameTarget {
  const present = standPresent(count, placement, view, reach);
  const center = standCenter(count, placement);
  const t = 0.75;
  return {
    center: { x: center.x + (present.x - center.x) * t, y: center.y + (present.y - center.y) * t, z: center.z + (present.z - center.z) * t },
    width: CARD.width * 2.1,
    height: (CARD.height + DOCUMENT.height) * 1.35,
  };
}

/**
 * Documentos de una tarjeta presentada (coordenadas de la tarjeta): en abanico
 * asomando por detrás de su borde de arriba, como en la carpeta. Por debajo
 * del borde no se dibujan (salen de detrás de la tarjeta).
 */
export function cardDeck(): SlotDeck {
  const flat = (pose: { x: number; y: number; z: number; rz: number }): Pose => ({ ...pose, rx: 0, ry: 0, scale: 1 });
  return {
    maxShown: DOCUMENT.maxFan,
    shown: (index, count) => flat(fanPose(index, count)),
    inside: (slot) => flat(insidePose(slot)),
    travelY: Math.max(fanTop(), CARD.height / 2) + DOCUMENT.height / 2 + 0.06,
    clipY: CARD.height / 2 - 0.02,
    reading: { x: 0, y: 0.95, z: 0.7, scale: 1.22 },
  };
}

/**
 * Une dos encuadres (el del organizador y el del tarjetero) en uno que deja
 * ver ambos: se miden en los ejes de la cámara (derecha y arriba).
 */
export function mergeFrames(a: FrameTarget, b: FrameTarget, view: Vec3): FrameTarget {
  const v = normalize(view);
  // Derecha = arriba(0,1,0) × vista hacia atrás; arriba de cámara = vista × derecha.
  const right = normalize({ x: v.z, y: 0, z: -v.x });
  const up = { x: v.y * right.z - v.z * right.y, y: v.z * right.x - v.x * right.z, z: v.x * right.y - v.y * right.x };
  const dot = (p: Vec3, axis: Vec3) => p.x * axis.x + p.y * axis.y + p.z * axis.z;
  const span = (frame: FrameTarget) => ({
    left: dot(frame.center, right) - frame.width / 2,
    rightEdge: dot(frame.center, right) + frame.width / 2,
    bottom: dot(frame.center, up) - frame.height / 2,
    top: dot(frame.center, up) + frame.height / 2,
  });
  const sa = span(a);
  const sb = span(b);
  const left = Math.min(sa.left, sb.left);
  const rightEdge = Math.max(sa.rightEdge, sb.rightEdge);
  const bottom = Math.min(sa.bottom, sb.bottom);
  const top = Math.max(sa.top, sb.top);
  // Mueve el centro de `a` lo que cambió el centro de la caja en los ejes de la cámara.
  const dx = (left + rightEdge) / 2 - dot(a.center, right);
  const dy = (bottom + top) / 2 - dot(a.center, up);
  return {
    center: { x: a.center.x + right.x * dx + up.x * dy, y: a.center.y + right.y * dx + up.y * dy, z: a.center.z + right.z * dx + up.z * dy },
    width: rightEdge - left,
    height: top - bottom,
  };
}
