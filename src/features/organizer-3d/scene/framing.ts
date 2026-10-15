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

export type FramingStage = "closed" | "open";

/** Por debajo de esta proporción (ancho/alto) la tapa abierta sale parcialmente de cuadro. */
export const WIDE_ASPECT = 1.3;

const W = BINDER.width;
const H = BINDER.height;

/** Qué encuadrar en cada etapa. En pantallas angostas se prioriza que los sobres no se corten. */
export function frameFor(stage: FramingStage, aspect: number): FrameBox {
  if (stage === "closed") {
    // Del lomo (que sobresale a la izquierda) a la correa abrochada (a la derecha).
    const left = -W / 2 - (BINDER.frontZ + BINDER.panel - BINDER.backZ) / 2 - 0.15;
    const right = W / 2 + 0.3;
    return { cx: (left + right) / 2, cy: 0, width: right - left, height: H + 0.5 };
  }
  if (aspect >= WIDE_ASPECT) {
    // Carpeta completa: tapa abierta a la izquierda + correa a la derecha.
    const left = -W / 2 - W - 0.45;
    const right = W / 2 + 2.25;
    return { cx: (left + right) / 2, cy: 0, width: right - left, height: H + 0.5 };
  }
  // Solo la tapa trasera con los sobres; la tapa abierta asoma por la izquierda.
  return { cx: -0.05, cy: 0, width: W + 0.9, height: H + 0.5 };
}

/** Distancia mínima para que `box` quepa en una cámara de perspectiva con `fovDeg` vertical. */
export function fitDistance(box: FrameBox, fovDeg: number, aspect: number, margin = 1.08): number {
  const tan = Math.tan((fovDeg * Math.PI) / 360);
  const byHeight = (box.height * margin) / 2 / tan;
  const byWidth = (box.width * margin) / 2 / (tan * Math.max(aspect, 0.01));
  return Math.max(byHeight, byWidth);
}

/** FOV vertical según la forma del lienzo: en vertical se abre un poco para no alejar tanto la cámara. */
export function fovFor(aspect: number): number {
  return aspect < 0.85 ? 36 : 30;
}

export function rigFor(stage: FramingStage, aspect: number): CameraRig {
  const box = frameFor(stage, aspect);
  return { tx: box.cx, ty: box.cy, distance: fitDistance(box, fovFor(aspect), aspect) };
}

/**
 * Qué tan cerca de la cámara (Z) puede presentarse un objeto de `width`×`height`
 * centrado a `offsetX` del punto de mira sin salirse del cuadro (deja `fill` de holgura).
 */
export function presentDepth(rig: CameraRig, aspect: number, width: number, height: number, offsetX = 0, fill = 0.9, maxZ = 4.5): number {
  const tan = Math.tan((fovFor(aspect) * Math.PI) / 360);
  const byWidth = rig.distance - (width / 2 + Math.abs(offsetX)) / (fill * tan * aspect);
  const byHeight = rig.distance - height / 2 / (fill * tan);
  return Math.max(0, Math.min(maxZ, byWidth, byHeight));
}
