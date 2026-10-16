import { apparentSize, facing, normalize, type FrameKind, type FrameTarget, type Pose, type Vec3 } from "../slotModel";

/**
 * Medidas del archivador (unidades de escena, ≈ 1 = 3 cm). Mesa = plano XZ,
 * +Z = hacia el frente. Las carpetas van en fila a lo largo de X, de pie.
 */
export const FILES = {
  /** Carpeta: grosor (X), alto (Y) y fondo (Z). */
  folderWidth: 0.86,
  folderHeight: 2.55,
  folderDepth: 1.6,
  gap: 0.07,
  /** Placa champán. */
  plate: 0.12,
  /** Paredes de acrílico: frente/fondo bajos, extremo izquierdo alto (como la referencia). */
  wall: 0.05,
  wallHeight: 1.05,
  tallWallHeight: 2.3,
  /** Holgura entre carpetas y paredes. */
  clearance: 0.12,
} as const;

/** Vista de 3/4 desde la derecha y un poco arriba (como la referencia). */
export const FILES_VIEW: Vec3 = normalize({ x: 0.3, y: 0.4, z: 1 });

/** Medidas de la bandeja (interior + paredes). */
export function filesSize(count: number): Vec3 {
  const n = Math.max(1, count);
  return {
    x: n * FILES.folderWidth + (n - 1) * FILES.gap + 2 * (FILES.clearance + FILES.wall),
    y: FILES.plate + FILES.folderHeight,
    z: FILES.folderDepth + 2 * (FILES.clearance + FILES.wall),
  };
}

const pose = (at: Vec3, extra: Partial<Pose> = {}): Pose => ({ x: at.x, y: at.y, z: at.z, rx: 0, ry: 0, rz: 0, scale: 1, ...extra });

/** El origen de la carpeta es su centro; de pie sobre la placa. */
export function folderRest(index: number, count: number): Pose {
  const size = filesSize(count);
  const x = -size.x / 2 + FILES.wall + FILES.clearance + FILES.folderWidth / 2 + index * (FILES.folderWidth + FILES.gap);
  return pose({ x, y: FILES.plate + FILES.folderHeight / 2 + 0.004, z: 0 });
}

/** Entreabierta (para recibir o soltar fichas): sube un tramo, todavía dentro de su compartimento. */
export function folderAjar(index: number, count: number): Pose {
  const rest = folderRest(index, count);
  return { ...rest, y: rest.y + 0.62 };
}

export const filesCenter = (count: number): Vec3 => ({ x: 0, y: filesSize(count).y / 2, z: 0 });

/** Presentada: delante del archivador sobre la línea de la cámara, de frente a ella y un poco girada. */
export function folderPresent(count: number): Pose {
  const center = filesCenter(count);
  const v = FILES_VIEW;
  // Su fondo tiene que librar la pared frontal con margen.
  const reach = (filesSize(count).z / 2 + 0.3) / v.z + FILES.folderDepth / 2 + 0.5;
  const { rx, ry } = facing(v);
  return pose({ x: center.x + v.x * reach, y: center.y + v.y * reach + 0.35, z: center.z + v.z * reach }, { rx: rx * 0.6, ry: ry - 0.16, rz: -0.035, scale: 1.06 });
}

/** Sube hasta librar las paredes, sale al frente y viene al centro girando hacia la cámara. */
export function folderExitPath(index: number, count: number): Pose[] {
  const rest = folderRest(index, count);
  const lifted = { ...rest, y: FILES.plate + FILES.wallHeight + FILES.folderHeight / 2 + 0.25 };
  const ahead = { ...lifted, z: filesSize(count).z / 2 + FILES.folderDepth / 2 + 0.35, ry: -0.08 };
  return [lifted, ahead, folderPresent(count)];
}

export function filesFrame(kind: FrameKind, count: number): FrameTarget {
  const size = filesSize(count);
  const seen = apparentSize(size, FILES_VIEW);
  const center = filesCenter(count);
  const margin = kind === "overview" ? 1.5 : 1.25;
  return { center: { ...center, y: center.y + 0.2 }, width: seen.width * margin, height: seen.height * margin };
}

/** Con una carpeta presentada: ella al frente y el archivador todavía a la vista detrás. */
export function filesPresentFrame(count: number): FrameTarget {
  const present = folderPresent(count);
  const center = filesCenter(count);
  const t = 0.45;
  const seen = apparentSize(filesSize(count), FILES_VIEW);
  return {
    center: { x: center.x + (present.x - center.x) * t, y: center.y + (present.y - center.y) * t, z: center.z + (present.z - center.z) * t },
    width: Math.max(seen.width * 0.9, FILES.folderHeight * 2.4),
    height: Math.max(seen.height * 1.05, FILES.folderHeight * 1.6),
  };
}
