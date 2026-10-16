import * as THREE from "three";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { KIND_LABELS, type DocumentKind, type EnvelopeDocument } from "../domain/document";
import { parseLocalDate } from "../domain/localDate";
import { DOCUMENT } from "./layout";

const WIDTH = 512;
const HEIGHT = Math.round((WIDTH * DOCUMENT.height) / DOCUMENT.width);

/** Papel e insignia por tipo de movimiento (paleta propia del ticket, igual en ambos temas). */
const KIND_STYLE: Record<DocumentKind, { paper: string; ink: string; sign: string }> = {
  income: { paper: "#f3fbf6", ink: "#2f7a55", sign: "+" },
  expense: { paper: "#fffdf8", ink: "#b0473f", sign: "−" },
  assignment: { paper: "#fbf7ef", ink: "#8a6a2c", sign: "→" },
  payment: { paper: "#f3f6fd", ink: "#3d5ea8", sign: "−" },
};

const money = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fontFamily(): string {
  const family = typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "";
  return family || "system-ui, sans-serif";
}

function draw(ctx: CanvasRenderingContext2D, doc: EnvelopeDocument) {
  const style = KIND_STYLE[doc.kind];
  const font = fontFamily();
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = style.paper;
  ctx.beginPath();
  ctx.roundRect(0, 0, WIDTH, HEIGHT, 26);
  ctx.fill();

  // Lo importante va arriba: es lo que asoma del sobre.
  ctx.fillStyle = style.ink;
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.roundRect(34, 34, 170, 50, 25);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.font = `600 28px ${font}`;
  ctx.textBaseline = "middle";
  ctx.fillText(KIND_LABELS[doc.kind].toUpperCase(), 54, 60, 140);

  ctx.fillStyle = "#6b7280";
  ctx.font = `500 30px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText(format(parseLocalDate(doc.date), "d MMM yyyy", { locale: es }).replace(".", ""), WIDTH - 36, 60);
  ctx.textAlign = "left";

  ctx.fillStyle = "#2f3540";
  ctx.font = `600 46px ${font}`;
  ctx.fillText(doc.concept, 36, 140, WIDTH - 72);
  ctx.fillStyle = style.ink;
  ctx.font = `700 58px ${font}`;
  ctx.fillText(`${style.sign} $ ${money.format(doc.amountMinor / 100)}`, 36, 215, WIDTH - 72);

  // Cuerpo del ticket: renglones punteados y pie de demostración.
  ctx.strokeStyle = "#d8d3c8";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 10]);
  for (let y = 290; y < HEIGHT - 120; y += 58) {
    ctx.beginPath();
    ctx.moveTo(36, y);
    ctx.lineTo(WIDTH - 36, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = "#9ca3af";
  ctx.font = `500 24px ${font}`;
  ctx.fillText("Movimiento de demostración", 36, HEIGHT - 60, WIDTH - 72);
}

/** Textura del ticket; se redibuja cuando cargan las fuentes de la app. */
export function createDocumentTexture(doc: EnvelopeDocument, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  if (!ctx) return texture;
  draw(ctx, doc);
  document.fonts?.ready.then(() => {
    draw(ctx, doc);
    texture.needsUpdate = true;
  });
  return texture;
}
