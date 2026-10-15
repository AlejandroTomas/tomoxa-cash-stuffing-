/**
 * Medidas de la carpeta y de los sobres, en unidades de escena (≈ 1 = 3 cm).
 * Plano XY = cara de la carpeta; +Z = hacia la cámara. Sin dependencias de
 * Three.js para poder probarlo en Node.
 */
export const BINDER = {
  width: 4.4,
  height: 5.8,
  /** Grosor de cada tapa. */
  panel: 0.1,
  radius: 0.34,
  /** Centro de la tapa trasera. */
  backZ: -0.55,
  /** Cara interior de la tapa delantera cuando está cerrada. */
  frontZ: 0.5,
  /** Ángulo final de la tapa abierta (un poco menos de 180° para que se vea su interior). */
  openAngle: -Math.PI + 0.07,
  /** Inclinación de toda la carpeta, como si estuviera sobre una mesa. */
  tiltX: -0.3,
} as const;

export const RINGS = {
  x: -1.56,
  z: -0.06,
  radius: 0.5,
  tube: 0.034,
  ys: [-1.75, 0, 1.75],
} as const;

export const ENVELOPE = {
  width: 3.6,
  height: 2.5,
  /** Separación vertical entre sobres: deja visible el encabezado con la etiqueta. */
  stagger: 0.52,
  depthStep: 0.12,
  topY: 1.42,
  x: 0.24,
  firstZ: -0.38,
} as const;

export interface SlotPose {
  x: number;
  y: number;
  z: number;
}

/** Lugar de reposo del sobre `index` dentro de la carpeta. */
export function slotPose(index: number): SlotPose {
  return {
    x: ENVELOPE.x + index * 0.012,
    y: ENVELOPE.topY - index * ENVELOPE.stagger,
    z: ENVELOPE.firstZ + index * ENVELOPE.depthStep,
  };
}

/**
 * Pose de "enfocado": asoma de su bolsillo hacia arriba sin salir de su plano,
 * para no atravesar los sobres que tiene enfrente.
 */
export function focusPose(index: number): SlotPose {
  const slot = slotPose(index);
  return { x: slot.x, y: slot.y + 0.62, z: slot.z + 0.015 };
}
