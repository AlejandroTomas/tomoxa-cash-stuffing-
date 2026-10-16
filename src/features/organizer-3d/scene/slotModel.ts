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
  item: EnvelopeItem;
  index: number;
  /** Lo mueven las transiciones (enfocar, extraer, regresar). Rotación en orden YXZ. */
  group: THREE.Group;
  /** Lo mueve solo el hover (relativo a `group`); así no compite con las transiciones. */
  hover: THREE.Group;
  /** Mallas que responden al puntero (llevan `userData.envelopeId`). */
  targets: THREE.Object3D[];
  /** Punto (mundo) por donde entran o salen las fichas de dinero. */
  mouth: (target: THREE.Vector3) => THREE.Vector3;
  /** Recolorea y reimprime la etiqueta (editar sobre, con vista previa en vivo). */
  restyle: (item: EnvelopeItem) => void;
  /** Quita la pieza de la escena y libera sus materiales (las geometrías son compartidas). */
  dispose: () => void;
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
  /** Elegida: asoma de su lugar. */
  focus: (index: number, count: number) => Pose;
  /**
   * Camino de salida desde `focus` hasta la presentación (la última pose). Al
   * regresar se recorre al revés: así vuelve por donde salió, sin atravesar nada.
   */
  exitPath: (index: number, count: number) => Pose[];
  frame: (kind: FrameKind, count: number) => FrameTarget;
  /** Encuadre con la pieza presentada: ella al centro y el organizador todavía a la vista. */
  presentFrame: (index: number, count: number) => FrameTarget;
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
