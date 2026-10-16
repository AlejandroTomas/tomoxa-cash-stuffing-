import * as THREE from "three";
import type { EnvelopeIcon, EnvelopeItem } from "../mocks/envelopes.mock";

/**
 * Trazos de los iconos de Lucide (ISC, ya instalado como `lucide-react`) en
 * una cuadrícula de 24×24, convertidos a rutas SVG para dibujarlos en canvas.
 */
const ICON_PATHS: Record<EnvelopeIcon, string[]> = {
  wallet: [
    "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
    "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
  ],
  card: ["M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M2 10h20"],
  piggy: [
    "M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z",
    "M16 10h.01",
    "M2 8v1a2 2 0 0 0 2 2h1",
  ],
  banknote: ["M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z", "M14 12a2 2 0 1 1-4 0a2 2 0 1 1 4 0", "M6 12h.01M18 12h.01"],
  calendar: [
    "M8 2v4",
    "M16 2v4",
    "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    "M3 10h18",
    "M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01",
  ],
  chart: ["M5 14h2.5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z", "M10.75 9h2.5a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-2.5a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z", "M16.5 3H19a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-2.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"],
};

/** Proporción de la etiqueta (ancho/alto) para que el plano 3D no deforme el texto. */
export const LABEL_ASPECT = 5;
const WIDTH = 1000;
const HEIGHT = WIDTH / LABEL_ASPECT;

function fontFamily(): string {
  const family = typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "";
  return family || "system-ui, sans-serif";
}

function draw(ctx: CanvasRenderingContext2D, item: EnvelopeItem) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  // Impreso directo sobre el plástico esmerilado: icono de trazo y nombre.
  const box = HEIGHT * 0.66;
  const top = (HEIGHT - box) / 2;
  ctx.save();
  const scale = box / 24;
  ctx.translate(18, top);
  ctx.scale(scale, scale);
  ctx.strokeStyle = shade(item.color, -0.42);
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ICON_PATHS[item.icon].forEach((d) => ctx.stroke(new Path2D(d)));
  ctx.restore();

  ctx.fillStyle = "#353a45";
  ctx.font = `500 92px ${fontFamily()}`;
  ctx.textBaseline = "middle";
  ctx.fillText(item.name, 60 + box * 1.1, HEIGHT / 2 + 4, WIDTH - box - 110);
}

/** Oscurece (negativo) o aclara (positivo) un color hex. */
function shade(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  return `#${color.lerp(new THREE.Color(amount < 0 ? "#1d1f24" : "#ffffff"), Math.abs(amount)).getHexString()}`;
}

/**
 * Textura de la etiqueta. Se redibuja cuando terminan de cargar las fuentes
 * para usar la tipografía de la app (Geist) en lugar de la de respaldo.
 */
export function createLabelTexture(item: EnvelopeItem, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  if (!ctx) return texture;
  draw(ctx, item);
  document.fonts?.ready.then(() => {
    draw(ctx, item);
    texture.needsUpdate = true;
  });
  return texture;
}

/** Reimprime una etiqueta existente (al editar nombre, color o icono del sobre). */
export function redrawLabel(texture: THREE.CanvasTexture, item: EnvelopeItem) {
  const ctx = (texture.image as HTMLCanvasElement).getContext("2d");
  if (!ctx) return;
  draw(ctx, item);
  texture.needsUpdate = true;
}
