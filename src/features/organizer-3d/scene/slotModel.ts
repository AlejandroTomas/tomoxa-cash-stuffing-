import type * as THREE from "three";
import type { EnvelopeItem } from "../domain/envelopeView";

/**
 * Organizadores "de ranuras" (cajonera, archivador): un cuerpo fijo y una pieza
 * móvil por sobre. La escena genérica (`slotScene`) anima; el modelo solo dice
 * cómo se ve cada cosa y dónde va. Sin Three.js en los tipos de pose, para
 * probar las cuentas en Node.
 */

/** Posición, giro (orden YXZ) y escala de una pieza, en coordenadas del mundo (mesa = plano XZ, y = 0). */
export interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Caja que la cámara debe dejar a la vista: centro y tamaño visto desde la cámara. */
export interface FrameTarget {
  center: Vec3;
  width: number;
  height: number;
}

export type FrameKind = "overview" | "open";

export interface SlotPart {
  /** Tarjeta de crédito en el tarjetero de escritorio (ver `cardStand.ts`); si no, pieza del organizador. */
  kind?: "card";
  item: EnvelopeItem;
  index: number;
  /** Lo mueven las transiciones (abrir, regresar, entreabrir). Rotación en orden YXZ. */
  group: THREE.Group;
  /** Lo mueve solo el hover (relativo a `group`); así no compite con las transiciones. */
  hover: THREE.Group;
  /** Mallas que responden al puntero (llevan `userData.envelopeId`). */
  targets: THREE.Object3D[];
  /** Punto (mundo) por donde entran o salen las fichas de dinero. */
  mouth: (target: THREE.Vector3) => THREE.Vector3;
  /** Contenido de adorno (el fajo de papel del cajón): se oculta mientras se ven los documentos. */
  contents?: THREE.Object3D;
  /** Recolorea y reimprime la etiqueta (editar sobre, con vista previa en vivo). */
  restyle: (item: EnvelopeItem) => void;
  /** Quita la pieza de la escena y libera sus materiales (las geometrías son compartidas). */
  dispose: () => void;
}

/**
 * Documentos de una pieza abierta, como en un fichero: de pie uno detrás de
 * otro, con la parte de arriba a la vista. Coordenadas de la pieza (`hover`).
 */
export interface SlotDeck {
  maxShown: number;
  /** A la vista: `index` 0 = el más reciente (al frente). */
  shown: (index: number, count: number) => Pose;
  /** Guardado debajo de su lugar (por debajo de `clipY`, no se ve). */
  inside: (slot: number, count: number) => Pose;
  /** Altura (centro) a la que cruza el que sale o regresa: libra la punta de todos y la boca. */
  travelY: number;
  /** Boca de la pieza: por debajo no se dibujan (parece que salen de adentro). */
  clipY: number;
  /** Dónde se lee (al frente de la pieza); la escena calcula el giro para quedar de cara a la cámara. */
  reading: Vec3 & { scale: number };
}

export interface SlotModel {
  /** Cuerpo del organizador (carcasa, base); las piezas se agregan aquí. */
  group: THREE.Group;
  /** Desplazamiento del hover (relativo a la pieza). */
  hoverOffset: Vec3;
  createPart: (item: EnvelopeItem, index: number, count: number) => SlotPart;
  /** Reacomoda el cuerpo para `count` piezas (p. ej. una fila más de cajones). */
  resize: (count: number) => void;
  /** En su lugar. */
  rest: (index: number, count: number) => Pose;
  /** Entreabierta: asoma de su lugar (para recibir o soltar fichas de dinero). */
  ajar: (index: number, count: number) => Pose;
  /**
   * Camino de salida desde `rest` hasta la presentación (la última pose). Al
   * regresar se recorre al revés: así vuelve por donde salió, sin atravesar nada.
   */
  exitPath: (index: number, count: number) => Pose[];
  frame: (kind: FrameKind, count: number) => FrameTarget;
  /** Documentos de la pieza abierta. */
  deck: SlotDeck;
  /** Encuadre con la pieza presentada: ella al centro y el organizador todavía a la vista. */
  presentFrame: (index: number, count: number) => FrameTarget;
  /**
   * Tarjetero de escritorio (tarjetas de crédito): acabado y dónde va según
   * cuántas piezas tiene el organizador. `reach` = qué tan adelante se presenta
   * una tarjeta para librar al organizador.
   */
  stand: { finish: "lacquer" | "acrylic"; placement: (count: number, cards: number) => { x: number; z: number; ry: number }; reach: (count: number) => number };
  dispose: () => void;
}

/** Giro (rx, ry) para que la cara +Z de una pieza mire hacia `viewDir`. */
export function facing(viewDir: Vec3): { rx: number; ry: number } {
  return { ry: Math.atan2(viewDir.x, viewDir.z), rx: -Math.atan2(viewDir.y, Math.hypot(viewDir.x, viewDir.z)) };
}

export function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * Tamaño aparente de una caja (ancho × alto × fondo) vista desde `viewDir`:
 * proyección de sus aristas sobre el plano de la cámara. Sirve para encuadrarla.
 */
export function apparentSize(size: Vec3, viewDir: Vec3): { width: number; height: number } {
  const { rx, ry } = facing(viewDir);
  const cy = Math.abs(Math.cos(ry));
  const sy = Math.abs(Math.sin(ry));
  const cx = Math.abs(Math.cos(rx));
  const sx = Math.abs(Math.sin(rx));
  const width = size.x * cy + size.z * sy;
  const depthAlongView = size.z * cy + size.x * sy;
  return { width, height: size.y * cx + depthAlongView * sx };
}
