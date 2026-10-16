import { BINDER } from "./layout";

/** Rectángulo (en el plano de la carpeta) que la cámara debe dejar a la vista. */
export interface FrameBox {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export interface CameraRig {
  /** Punto al que mira la cámara. */
  tx: number;
  ty: number;
  /** Distancia de la cámara a ese punto. */
  distance: number;
}

/** Zona libre del lienzo donde debe quedar la carpeta (lo que no tapa la interfaz). */
export interface Viewport {
  /** Proporción ancho/alto de la zona libre. */
  aspect: number;
  /** FOV vertical (grados) que corresponde a la zona libre. */
  fov: number;
}

export type FramingStage = "closed" | "open";

/** Por debajo de esta proporción (ancho/alto) la tapa abierta sale parcialmente de cuadro. */
export const WIDE_ASPECT = 1.2;

const W = BINDER.width;
const H = BINDER.height;
/** La carpeta está inclinada hacia atrás: se ve más baja de lo que mide. */
const VISIBLE_H = H * Math.cos(BINDER.tilt.x) + 1.1;

/** Qué encuadrar en cada etapa. En pantallas angostas se prioriza que los sobres no se corten. */
export function frameFor(stage: FramingStage, aspect: number): FrameBox {
  if (stage === "closed") {
    // Del lomo (que sobresale a la izquierda) a la correa abrochada (a la derecha).
    const left = -W / 2 - (BINDER.frontZ + BINDER.panel - BINDER.backZ) / 2 - 0.15;
    const right = W / 2 + 0.3;
    return { cx: (left + right) / 2, cy: 0, width: right - left, height: VISIBLE_H };
  }
  if (aspect >= WIDE_ASPECT) {
    // Protagonistas los sobres: la tapa abierta entra a medias por la izquierda (como la referencia).
    const left = -W / 2 - W * 0.92;
    const right = W / 2 + 1.1;
    return { cx: (left + right) / 2, cy: -0.2, width: right - left, height: VISIBLE_H };
  }
  // Solo la tapa trasera con los sobres; la tapa abierta asoma por la izquierda.
  return { cx: 0, cy: -0.2, width: W + 0.9, height: VISIBLE_H };
}

/** Distancia mínima para que `box` quepa en una cámara de perspectiva con `fovDeg` vertical. */
export function fitDistance(box: FrameBox, fovDeg: number, aspect: number, margin = 1.04): number {
  const tan = Math.tan((fovDeg * Math.PI) / 360);
  const byHeight = (box.height * margin) / 2 / tan;
  const byWidth = (box.width * margin) / 2 / (tan * Math.max(aspect, 0.01));
  return Math.max(byHeight, byWidth);
}

/** FOV vertical del lienzo completo según su forma. */
export function fovFor(aspect: number): number {
  return aspect < 0.85 ? 36 : 30;
}

/**
 * FOV efectivo de una franja de `fraction` (0–1) de la altura del lienzo: con
 * `setViewOffset` la carpeta se centra en esa franja como si fuera el lienzo.
 */
export function subFov(fovDeg: number, fraction: number): number {
  return (2 * Math.atan(Math.tan((fovDeg * Math.PI) / 360) * fraction) * 180) / Math.PI;
}

export function rigFor(stage: FramingStage, viewport: Viewport): CameraRig {
  const box = frameFor(stage, viewport.aspect);
  return { tx: box.cx, ty: box.cy, distance: fitDistance(box, viewport.fov, viewport.aspect) };
}

/**
 * Qué tan cerca de la cámara (Z) puede presentarse un objeto de `width`×`height`
 * centrado a `offsetX` del punto de mira sin salirse del cuadro (deja `fill` de holgura).
 */
export function presentDepth(rig: CameraRig, viewport: Viewport, width: number, height: number, offsetX = 0, fill = 0.9, maxZ = 4.5): number {
  const tan = Math.tan((viewport.fov * Math.PI) / 360);
  const byWidth = rig.distance - (width / 2 + Math.abs(offsetX)) / (fill * tan * viewport.aspect);
  const byHeight = rig.distance - height / 2 / (fill * tan);
  return Math.max(0, Math.min(maxZ, byWidth, byHeight));
}

/** Rectángulo en coordenadas normalizadas del lienzo (−1…1, +y hacia arriba). */
export interface NdcRect {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** Zona libre del lienzo (sin lo que tapa la interfaz, en px) en coordenadas normalizadas. */
export function freeNdc(width: number, height: number, safe: { top: number; right: number; bottom: number; left: number }): NdcRect {
  return {
    left: -1 + (2 * safe.left) / width,
    right: 1 - (2 * safe.right) / width,
    bottom: -1 + (2 * safe.bottom) / height,
    top: 1 - (2 * safe.top) / height,
  };
}

const clamp = (value: number, min: number, max: number) => (min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value)));

/**
 * Dónde aparece (o desaparece) en pantalla el dinero que llega de fuera o se va:
 * arriba a la derecha del sobre, pero dentro de la zona libre (con `margin` de
 * holgura) para que la barra o la tarjeta no lo tapen.
 */
export function outsideNdc(point: { x: number; y: number }, free: NdcRect, offset = { x: 0.3, y: 0.3 }, margin = 0.12): { x: number; y: number } {
  return {
    x: clamp(point.x + offset.x, free.left + margin, free.right - margin),
    y: clamp(point.y + offset.y, free.bottom + margin, free.top - margin),
  };
}
