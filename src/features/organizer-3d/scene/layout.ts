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
  openAngle: -Math.PI + 0.06,
  /** Pose de la carpeta sobre la mesa: inclinada hacia atrás y girada en 3/4. */
  tilt: { x: -0.66, y: -0.3, z: 0.07 },
} as const;

export const RINGS = {
  x: -1.62,
  z: -0.04,
  radius: 0.52,
  tube: 0.045,
  ys: [-2.15, -1.29, -0.43, 0.43, 1.29, 2.15],
} as const;

export const ENVELOPE = {
  width: 3.6,
  height: 2.1,
  /** Separación vertical entre sobres: deja visible el encabezado con la etiqueta. */
  stagger: 0.66,
  depthStep: 0.1,
  topY: 1.6,
  x: 0.26,
  firstZ: -0.36,
  /** Con la carpeta abierta los sobres se levantan en abanico, girando sobre su borde inferior. */
  fan: 0.36,
} as const;

export interface SlotPose {
  x: number;
  y: number;
  z: number;
  /** Rotación en X (abanico). */
  rx: number;
}

/** Con hasta este número de sobres se usa la separación cómoda; con más, se reparte el mismo espacio. */
export const COMFORT_COUNT = 6;

export interface StackLayout {
  stagger: number;
  depthStep: number;
}

/** Separación vertical y de profundidad para `count` sobres, sin salirse de la carpeta. */
export function stackLayout(count: number): StackLayout {
  if (count <= COMFORT_COUNT) return { stagger: ENVELOPE.stagger, depthStep: ENVELOPE.depthStep };
  const steps = count - 1;
  return { stagger: (ENVELOPE.stagger * (COMFORT_COUNT - 1)) / steps, depthStep: (ENVELOPE.depthStep * (COMFORT_COUNT - 1)) / steps };
}

/**
 * Parte de la separación que no sirve para la etiqueta: el borde soldado de
 * arriba y lo que tapa de más el sobre de enfrente (por la perspectiva y el abanico).
 */
const LABEL_MARGIN = 0.2;

/**
 * Escala de la etiqueta impresa: con más de seis sobres la franja visible de
 * cada uno se reduce y la etiqueta se achica igual (si no, el de enfrente la tapa).
 */
export const labelScale = (count = COMFORT_COUNT) => Math.min(1, (stackLayout(count).stagger - LABEL_MARGIN) / (ENVELOPE.stagger - LABEL_MARGIN));

/**
 * Lugar de reposo del sobre `index` de `count`. Cerrada: planos y apilados.
 * Abierta: girados `fan` sobre su borde inferior (como un archivador).
 */
export function slotPose(index: number, fanned = false, count = COMFORT_COUNT): SlotPose {
  const { stagger, depthStep } = stackLayout(count);
  const x = ENVELOPE.x + index * 0.014;
  const y = ENVELOPE.topY - index * stagger;
  const z = ENVELOPE.firstZ + index * depthStep;
  if (!fanned) return { x, y, z, rx: 0 };
  const rx = ENVELOPE.fan - index * 0.012;
  const half = ENVELOPE.height / 2;
  // Girar sobre el centro y compensar para que el borde inferior quede en su lugar.
  return { x, y: y - half * (1 - Math.cos(rx)), z: z + half * Math.sin(rx), rx };
}

/**
 * Cuánto sube un sobre (en su plano) para salir del bolsillo: su borde inferior
 * debe quedar por encima del borde superior del sobre de enfrente, más holgura.
 * Con menos, al ir al frente o al regresar atraviesa a los de enfrente.
 */
export const pocketClearance = (count = COMFORT_COUNT) => ENVELOPE.height - stackLayout(count).stagger + 0.45;
export const POCKET_CLEARANCE = pocketClearance();

/** Documentos (tickets) dentro de un sobre abierto. */
export const DOCUMENT = {
  width: 1.25,
  height: 1.7,
  /** Máximo de documentos en el abanico; el resto queda en la lista HTML. */
  maxFan: 8,
  /** Altura del documento guardado (centro, en coordenadas del sobre). */
  insideY: -0.3,
  /** Cuánto sube un documento visible: asoma por arriba del sobre. */
  rise: 1.2,
} as const;

export interface DocumentPose {
  x: number;
  y: number;
  z: number;
  rz: number;
}

/** Documento guardado dentro del sobre (coordenadas del sobre). */
export function insidePose(order = 0): DocumentPose {
  return { x: 0.05 * (order % 3) - 0.05, y: DOCUMENT.insideY, z: -0.03 + order * 0.0015, rz: 0 };
}

/**
 * Posición del documento `index` (0 = más reciente) de `count` visibles: en
 * abanico sobre el borde superior del sobre. El más reciente queda a la
 * derecha y al frente, completo; de los anteriores asoma su esquina izquierda
 * (tipo, concepto y monto).
 */
export function fanPose(index: number, count: number): DocumentPose {
  const n = Math.max(1, Math.min(count, DOCUMENT.maxFan));
  const t = n === 1 ? 0.5 : 1 - index / (n - 1);
  const spread = Math.min(ENVELOPE.width - DOCUMENT.width - 0.35, (n - 1) * 0.42);
  const offset = t - 0.5;
  return {
    x: -spread / 2 + spread * t,
    y: DOCUMENT.insideY + DOCUMENT.rise - Math.abs(offset) * 0.18,
    z: -0.028 + (n - 1 - index) * 0.0035,
    rz: n === 1 ? 0 : -offset * 0.2,
  };
}

/** Punta más alta del abanico lleno (con el giro, la esquina sube un poco más que el centro). */
export function fanTop(count: number = DOCUMENT.maxFan): number {
  let top = DOCUMENT.insideY + DOCUMENT.height / 2;
  for (let index = 0; index < count; index++) {
    const pose = fanPose(index, count);
    top = Math.max(top, pose.y + (DOCUMENT.height / 2) * Math.cos(pose.rz) + (DOCUMENT.width / 2) * Math.abs(Math.sin(pose.rz)));
  }
  return top;
}

/**
 * Altura (centro, en coordenadas del sobre) a la que un documento cruza entre el
 * abanico y el frente: su borde inferior libra la punta de los demás y la boca
 * del sobre, así pasa por delante sin tocarlos y nadie más se mueve.
 */
export const DOCUMENT_TRAVEL_Y = Math.max(fanTop(), ENVELOPE.height / 2) + DOCUMENT.height / 2 + 0.06;

/**
 * Tarjeta de crédito del tarjetero (la reserva de una tarjeta). Mide como un
 * sobre al presentarse; en su bolsillo se ve a escala `WALLET.scale`.
 */
export const CARD = { width: 3.4, height: 2.14, depth: 0.024, radius: 0.18 } as const;

/**
 * Tarjetero en el interior de la tapa delantera (coordenadas de la tapa:
 * x = 0 en el lomo, +Y arriba, -Z = cara interior, hacia la cámara con la tapa
 * abierta). Bolsillos escalonados como en una cartera: de cada tarjeta asoma
 * su franja superior; el bolsillo de abajo queda por delante del de arriba.
 */
export const WALLET = {
  scale: 0.8,
  /** Centro de las tarjetas (deja libre la banda porta pluma junto al lomo). */
  x: 2.62,
  /** Borde superior de la primera tarjeta. */
  topY: 2.3,
  /** Fondo de los bolsillos. */
  bottomY: -2.45,
  /** Separación vertical cómoda entre tarjetas. */
  step: 0.62,
  /** Cuánto asoma cada tarjeta por encima de su bolsillo. */
  peek: 0.5,
  /** Centro de la primera tarjeta en Z y cuánto avanza cada una hacia la cámara. */
  firstZ: -0.09,
  depthStep: 0.046,
  pocketWidth: 3.0,
  pocketDepth: 0.016,
  /** Bolsillos que se ven aunque haya menos tarjetas (un tarjetero vacío también tiene ranuras). */
  minPockets: 3,
} as const;

const cardH = () => CARD.height * WALLET.scale;

/** Bolsillos que dibuja el tarjetero para `count` tarjetas. */
export const pocketCount = (count: number) => Math.max(count, WALLET.minPockets);

/** Separación vertical para `count` tarjetas: con muchas se aprietan para no salir del tarjetero. */
export function walletStep(count: number): number {
  const n = pocketCount(count);
  if (n <= 1) return WALLET.step;
  return Math.min(WALLET.step, (WALLET.topY - WALLET.bottomY - cardH() - 0.15) / (n - 1));
}

export interface WalletPose {
  x: number;
  y: number;
  z: number;
}

/** Centro de la tarjeta `index` en su bolsillo. */
export function walletSlot(index: number, count: number): WalletPose {
  const top = WALLET.topY - index * walletStep(count);
  return { x: WALLET.x, y: top - cardH() / 2, z: WALLET.firstZ - index * WALLET.depthStep };
}

/** Bolsillo `index`: de su borde superior (un poco abajo del de la tarjeta) al fondo, delante de su tarjeta. */
export function pocketRect(index: number, count: number): { x: number; y: number; z: number; width: number; height: number } {
  const slot = walletSlot(index, count);
  const top = slot.y + cardH() / 2 - WALLET.peek;
  return { x: WALLET.x, y: (top + WALLET.bottomY) / 2, z: slot.z - 0.02, width: WALLET.pocketWidth, height: top - WALLET.bottomY };
}

/** Tarjeta fuera de su bolsillo, en el mismo plano: su borde inferior libra el bolsillo. */
export function walletExit(index: number, count: number): WalletPose {
  const slot = walletSlot(index, count);
  return { ...slot, y: slot.y + cardH() - WALLET.peek + 0.18 };
}
