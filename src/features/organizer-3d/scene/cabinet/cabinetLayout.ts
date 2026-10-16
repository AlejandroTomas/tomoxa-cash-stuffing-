import { DOCUMENT } from "../layout";
import { apparentSize, facing, normalize, type FrameKind, type FrameTarget, type Pose, type SlotDeck, type Vec3 } from "../slotModel";

/**
 * Medidas de la cajonera (unidades de escena, ≈ 1 = 3 cm). Mesa = plano XZ,
 * +Z = hacia el frente. Dos columnas; las filas crecen con los sobres (3 para 6).
 */
export const CABINET = {
  columns: 2,
  cellWidth: 2.0,
  cellHeight: 0.95,
  /** Grosor de las paredes exteriores y de los entrepaños. */
  wall: 0.13,
  divider: 0.07,
  depth: 2.5,
  /** Holgura entre el cajón y su hueco. */
  gap: 0.05,
  /** Grosor del frente del cajón. */
  front: 0.1,
  /** Altura de las patas. */
  feet: 0.07,
} as const;

/** Vista de 3/4 desde la izquierda y un poco arriba (como la referencia). */
export const CABINET_VIEW: Vec3 = normalize({ x: -0.34, y: 0.36, z: 1 });

export const rowsFor = (count: number) => Math.max(1, Math.ceil(count / CABINET.columns));

export function cabinetSize(count: number): Vec3 {
  const rows = rowsFor(count);
  return {
    x: CABINET.columns * CABINET.cellWidth + (CABINET.columns - 1) * CABINET.divider + 2 * CABINET.wall,
    y: rows * CABINET.cellHeight + (rows - 1) * CABINET.divider + 2 * CABINET.wall,
    z: CABINET.depth,
  };
}

/** Frente y fondo de cada cajón. */
export const drawerSize = () => ({
  width: CABINET.cellWidth - 2 * CABINET.gap,
  height: CABINET.cellHeight - 2 * CABINET.gap,
  /** Del frente hacia atrás, sin chocar con la pared del fondo. */
  depth: CABINET.depth - CABINET.wall - 0.16,
});

/** Centro del cuerpo (sobre las patas). */
export const cabinetCenter = (count: number): Vec3 => ({ x: 0, y: CABINET.feet + cabinetSize(count).y / 2, z: 0 });

/** Centro del hueco `index` (fila 0 = arriba), en la cara frontal. */
export function cellCenter(index: number, count: number): Vec3 {
  const size = cabinetSize(count);
  const column = index % CABINET.columns;
  const row = Math.floor(index / CABINET.columns);
  const x = (column - (CABINET.columns - 1) / 2) * (CABINET.cellWidth + CABINET.divider);
  const y = CABINET.feet + size.y - CABINET.wall - CABINET.cellHeight / 2 - row * (CABINET.cellHeight + CABINET.divider);
  return { x, y, z: CABINET.depth / 2 };
}

const pose = (at: Vec3, extra: Partial<Pose> = {}): Pose => ({ x: at.x, y: at.y, z: at.z, rx: 0, ry: 0, rz: 0, scale: 1, ...extra });

/** El origen del cajón es el centro de su frente; en reposo el frente sobresale un poco. */
export function drawerRest(index: number, count: number): Pose {
  const cell = cellCenter(index, count);
  return pose({ ...cell, z: cell.z - CABINET.front / 2 + 0.015 });
}

/** Entreabierto (para recibir o soltar fichas): sale un tramo, como al jalarlo con un dedo. */
export function drawerAjar(index: number, count: number): Pose {
  const rest = drawerRest(index, count);
  return { ...rest, z: rest.z + 0.5 };
}

/** Escala del cajón presentado (un poco más grande: está más cerca de la cámara y es el protagonista). */
const PRESENT_SCALE = 1.2;

/**
 * Dónde se presenta: delante de la cajonera sobre la línea de la cámara, lo
 * bastante lejos para que su fondo no toque la carcasa; inclinado hacia la
 * cámara para que se vea su interior.
 */
export function drawerPresent(count: number): Pose {
  const center = cabinetCenter(count);
  const v = CABINET_VIEW;
  const drawer = drawerSize();
  // El fondo del cajón (a `depth × escala` detrás de su frente) tiene que librar la cara frontal (z = depth/2) con margen.
  const reach = (CABINET.depth / 2 + 0.3) / v.z + drawer.depth * PRESENT_SCALE + 0.15;
  const { rx, ry } = facing(v);
  return pose({ x: center.x + v.x * reach, y: center.y + v.y * reach - 0.2, z: center.z + v.z * reach }, { rx: rx + 0.5, ry, scale: PRESENT_SCALE });
}

/** Sale derecho hasta quedar fuera del hueco y después viene al frente. */
export function drawerExitPath(index: number, count: number): Pose[] {
  const rest = drawerRest(index, count);
  const out = { ...rest, z: rest.z + drawerSize().depth + 0.3 };
  return [out, drawerPresent(count)];
}

export function cabinetFrame(kind: FrameKind, count: number): FrameTarget {
  const size = cabinetSize(count);
  const seen = apparentSize({ x: size.x, y: size.y + CABINET.feet, z: size.z }, CABINET_VIEW);
  const center = cabinetCenter(count);
  // Abierto: un poco más cerca, con espacio para que los cajones salgan hacia el frente.
  const margin = kind === "overview" ? 1.55 : 1.3;
  return { center: { ...center, y: center.y - 0.1 }, width: seen.width * margin, height: seen.height * margin };
}

/** Con un cajón presentado: él al frente y la cajonera todavía a la vista detrás. */
export function cabinetPresentFrame(count: number): FrameTarget {
  const present = drawerPresent(count);
  const center = cabinetCenter(count);
  // Más cerca del cajón que de la cajonera: él y sus documentos son lo importante.
  const t = 0.6;
  const size = cabinetSize(count);
  const seen = apparentSize(size, CABINET_VIEW);
  return {
    center: { x: center.x + (present.x - center.x) * t, y: center.y + (present.y - center.y) * t, z: center.z + (present.z - center.z) * t },
    width: Math.max(seen.width * 0.8, drawerSize().width * 2.2),
    height: seen.height * 0.8,
  };
}

// ── Documentos: un fichero dentro del cajón ─────────────────────────────────

/** Bandeja del cajón (coordenadas del cajón: origen en el centro del frente, +z hacia afuera). */
export function drawerTray() {
  const drawer = drawerSize();
  const wall = 0.035;
  const floorTop = -drawer.height / 2 + 0.02 + wall;
  return {
    floorTop,
    /** Cara interior del frente y de la pared del fondo. */
    front: -CABINET.front / 2,
    back: -CABINET.front / 2 - (drawer.depth - CABINET.front) + wall,
    halfWidth: (drawer.width - 0.08) / 2 - wall,
  };
}

/** Las fichas van más chicas que en la carpeta de anillas: el cajón es bajo. */
export const DRAWER_CARD_SCALE = 0.62;
const CARD_GAP = 0.2;
/** Las fichas se recargan un poco hacia atrás, como en un fichero. */
const CARD_LEAN = -0.08;
/** Cuánto asoma la ficha del frente sobre el borde del cajón; cada una de atrás, `CARD_STEP` más. */
const CARD_SHOW = 0.32;
const CARD_STEP = 0.1;
/** Abanico en profundidad: la más reciente al frente y a la derecha; las anteriores, atrás y a la izquierda. */
const CARD_SPREAD = 0.62;

/** Ficha `index` (0 = la más reciente) de `count`, de pie dentro del cajón. */
function drawerCard(index: number, count: number): Pose {
  const tray = drawerTray();
  const n = Math.max(1, Math.min(count, DOCUMENT.maxFan));
  const t = n === 1 ? 0.5 : index / (n - 1);
  const half = (DOCUMENT.height / 2) * DRAWER_CARD_SCALE;
  const top = drawerSize().height / 2 + CARD_SHOW + index * CARD_STEP;
  return {
    x: n === 1 ? 0 : CARD_SPREAD / 2 - CARD_SPREAD * t,
    y: top - half * Math.cos(CARD_LEAN),
    z: tray.front - 0.25 - index * CARD_GAP,
    rx: CARD_LEAN,
    ry: 0,
    rz: n === 1 ? 0 : (t - 0.5) * 0.12,
    scale: DRAWER_CARD_SCALE,
  };
}

/** Punta más alta de las fichas a la vista (con la inclinación y el giro). */
export function drawerCardsTop(count: number = DOCUMENT.maxFan): number {
  let top = -Infinity;
  for (let index = 0; index < Math.max(1, Math.min(count, DOCUMENT.maxFan)); index++) {
    const card = drawerCard(index, count);
    const halfH = (DOCUMENT.height / 2) * card.scale;
    const halfW = (DOCUMENT.width / 2) * card.scale;
    top = Math.max(top, card.y + halfH * Math.cos(CARD_LEAN) + halfW * Math.abs(Math.sin(card.rz)));
  }
  return top;
}

export function drawerDeck(): SlotDeck {
  const tray = drawerTray();
  const height = DOCUMENT.height * DRAWER_CARD_SCALE;
  return {
    maxShown: DOCUMENT.maxFan,
    shown: (index, count) => drawerCard(index, count),
    // Guardada: hundida en su plano hasta quedar bajo el piso (recortada, no se ve).
    inside: (slot, count) => {
      const card = drawerCard(Math.min(slot, DOCUMENT.maxFan - 1), Math.max(count, slot + 1));
      const sink = card.y + height / 2 - tray.floorTop + 0.05;
      return { ...card, y: card.y - sink, z: card.z - sink * Math.tan(CARD_LEAN) };
    },
    travelY: Math.max(drawerCardsTop(), drawerSize().height / 2) + height / 2 + 0.08,
    clipY: tray.floorTop,
    reading: { x: 0, y: 0.95, z: 0.75, scale: 0.95 },
  };
}
