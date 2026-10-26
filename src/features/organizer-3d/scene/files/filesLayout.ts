import { standSize, type StandPlacement } from "../cardStandLayout";
import { DOCUMENT } from "../layout";
import { apparentSize, facing, normalize, type FrameKind, type FrameTarget, type Pose, type SlotDeck, type Vec3 } from "../slotModel";

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
  // Más cerca de la carpeta que del archivador: ella y sus documentos son lo importante.
  const t = 0.65;
  const seen = apparentSize(filesSize(count), FILES_VIEW);
  return {
    center: { x: center.x + (present.x - center.x) * t, y: center.y + (present.y - center.y) * t, z: center.z + (present.z - center.z) * t },
    width: Math.max(seen.width * 0.6, FILES.folderHeight * 1.4),
    height: Math.max(seen.height * 0.9, FILES.folderHeight * 1.3),
  };
}

// ── Documentos: asoman por la boca de la carpeta ────────────────────────────

/** Las fichas van más chicas que en la carpeta de anillas: la carpeta es angosta. */
export const FOLDER_CARD_SCALE = 0.8;
const CARD_GAP = 0.15;
const CARD_LEAN = -0.06;
/** Cuánto asoma la ficha del frente; las de atrás, un poco más (se lee su encabezado). */
const CARD_SHOW = 0.5;
const CARD_STEP = 0.12;

/** Ficha `index` (0 = la más reciente, al frente), metida en la carpeta y asomando por arriba. */
function folderCard(index: number): Pose {
  const half = (DOCUMENT.height / 2) * FOLDER_CARD_SCALE;
  const mouth = FILES.folderHeight / 2;
  return {
    x: 0,
    y: mouth + CARD_SHOW + index * CARD_STEP - half,
    z: FILES.folderDepth / 2 - 0.25 - index * CARD_GAP,
    rx: CARD_LEAN,
    ry: 0,
    rz: 0,
    scale: FOLDER_CARD_SCALE,
  };
}

/** Punta más alta de las fichas a la vista. */
export function folderCardsTop(): number {
  const card = folderCard(DOCUMENT.maxFan - 1);
  return card.y + (DOCUMENT.height / 2) * FOLDER_CARD_SCALE;
}

export function folderDeck(): SlotDeck {
  return {
    maxShown: DOCUMENT.maxFan,
    shown: (index) => folderCard(index),
    // Guardada: hundida en su plano hasta quedar toda dentro de la carpeta.
    inside: (slot) => {
      const card = folderCard(Math.min(slot, DOCUMENT.maxFan - 1));
      const sink = CARD_SHOW + slot * CARD_STEP + 0.08;
      return { ...card, y: card.y - sink, z: card.z - sink * Math.tan(CARD_LEAN) };
    },
    travelY: folderCardsTop() + (DOCUMENT.height / 2) * FOLDER_CARD_SCALE + 0.08,
    clipY: FILES.folderHeight / 2,
    reading: { x: 0, y: 0.6, z: FILES.folderDepth / 2 + 0.6, scale: 1.15 },
  };
}

// ── Tarjetero de escritorio ─────────────────────────────────────────────────

/** A la izquierda del archivador (junto a su pared alta), a la altura de su centro y girado hacia la cámara. */
export function filesStandPlacement(count: number, cards: number): StandPlacement {
  const stand = standSize(cards);
  return { x: -filesSize(count).x / 2 - stand.x / 2 - 0.35, z: 0.1, ry: facing(FILES_VIEW).ry * 0.5 };
}

/** Qué tan adelante del tarjetero se presenta una tarjeta: delante de la bandeja. */
export const filesStandReach = (count: number) => (filesSize(count).z / 2 + 1.2) / FILES_VIEW.z;
