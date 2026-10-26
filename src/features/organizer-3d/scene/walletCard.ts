import * as THREE from "three";
import type { EnvelopeId, EnvelopeItem } from "../domain/envelopeView";
import type { EnvelopePart } from "./envelope";
import { roundedSlab, stitchLine } from "./geometry";
import { CARD, pocketCount, pocketRect, WALLET, walletSlot } from "./layout";
import type { MaterialKit } from "./materials";

/**
 * Tarjetas de crédito del tarjetero (interior de la tapa delantera) y sus
 * bolsillos de cuero. Una tarjeta es la reserva de esa tarjeta: se abre, guarda
 * documentos y recibe fichas igual que un sobre, pero vive en la tapa.
 */

const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * CARD.height) / CARD.width);
const money = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pesos = (amount: number) => `${amount < 0 ? "−" : ""}$ ${money.format(Math.abs(amount))}`;

function fontFamily(): string {
  const family = typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "";
  return family || "system-ui, sans-serif";
}

/** Oscurece un color hacia un tinta profunda (las tarjetas son oscuras para que el texto blanco se lea). */
const deepen = (hex: string, amount: number) => `#${new THREE.Color(hex).lerp(new THREE.Color("#1c1a24"), amount).getHexString()}`;

/** Cara impresa: nombre, chip, contactless, lo apartado y lo que se debe. Paleta propia (igual en ambos temas). */
function drawFace(ctx: CanvasRenderingContext2D, item: EnvelopeItem) {
  const font = fontFamily();
  const radius = (CARD.radius / CARD.width) * TEX_W;
  ctx.clearRect(0, 0, TEX_W, TEX_H);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, TEX_W, TEX_H, radius);
  ctx.clip();

  const gradient = ctx.createLinearGradient(0, 0, TEX_W, TEX_H);
  gradient.addColorStop(0, deepen(item.color, 0.18));
  gradient.addColorStop(1, deepen(item.color, 0.55));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // Brillo diagonal y un círculo grande translúcido: textura de tarjeta, sin marcas reales.
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(TEX_W * 0.92, TEX_H * 0.05, TEX_H * 0.75, 0, Math.PI * 2);
  ctx.fill();
  const sheen = ctx.createLinearGradient(0, 0, TEX_W, TEX_H * 0.6);
  sheen.addColorStop(0, "rgba(255,255,255,0.16)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 70px ${font}`;
  ctx.fillText(item.card?.name ?? item.name, 64, 112, TEX_W * 0.66);

  // Contactless: tres arcos.
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  for (const r of [22, 40, 58]) {
    ctx.beginPath();
    ctx.arc(TEX_W - 120, 92, r, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
  }

  // Chip dorado.
  const chip = { x: 64, y: 176, w: 132, h: 100 };
  const gold = ctx.createLinearGradient(chip.x, chip.y, chip.x + chip.w, chip.y + chip.h);
  gold.addColorStop(0, "#f3dca4");
  gold.addColorStop(1, "#c9a45c");
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.roundRect(chip.x, chip.y, chip.w, chip.h, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,90,40,0.55)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(chip.x + chip.w / 3, chip.y);
  ctx.lineTo(chip.x + chip.w / 3, chip.y + chip.h);
  ctx.moveTo(chip.x + (chip.w * 2) / 3, chip.y);
  ctx.lineTo(chip.x + (chip.w * 2) / 3, chip.y + chip.h);
  ctx.moveTo(chip.x, chip.y + chip.h / 2);
  ctx.lineTo(chip.x + chip.w, chip.y + chip.h / 2);
  ctx.stroke();

  // Lo apartado (la reserva) es lo importante; la deuda, abajo a la derecha.
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = `500 34px ${font}`;
  ctx.fillText("Apartado para pagarla", 64, TEX_H - 150);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 76px ${font}`;
  ctx.fillText(pesos(item.amount), 64, TEX_H - 68, TEX_W * 0.6);
  if (item.card) {
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = `500 34px ${font}`;
    ctx.fillText("Debes", TEX_W - 64, TEX_H - 150);
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 50px ${font}`;
    ctx.fillText(pesos(item.card.debt), TEX_W - 64, TEX_H - 72, TEX_W * 0.34);
    ctx.textAlign = "left";
  }
  ctx.restore();
}

/** Geometrías comunes a todas las tarjetas. */
export interface CardGeometries {
  body: THREE.BufferGeometry;
  face: THREE.BufferGeometry;
}

export function createCardGeometries(): CardGeometries {
  return {
    body: roundedSlab(CARD.width, CARD.height, CARD.depth, CARD.radius, 0.008),
    face: new THREE.PlaneGeometry(CARD.width - 0.006, CARD.height - 0.006),
  };
}

/** Cuerpo y cara impresa de una tarjeta (dentro de `hover`), con su recoloreo y sus recursos. */
export interface CardFaceMesh {
  body: THREE.Mesh;
  face: THREE.Mesh;
  restyle: (item: EnvelopeItem) => void;
  /** Materiales y textura propios (las geometrías son compartidas). */
  resources: Array<THREE.Material | THREE.Texture>;
}

/** Arma la tarjeta en `parent` (cara hacia +Z) y marca sus mallas con el id del sobre. */
export function createCardFace(parent: THREE.Object3D, item: EnvelopeItem, kit: MaterialKit, geo: CardGeometries, maxAnisotropy: number): CardFaceMesh {
  const bodyMaterial = kit.track(new THREE.MeshStandardMaterial({ color: deepen(item.color, 0.45), roughness: 0.42, metalness: 0.15 }));
  const body = new THREE.Mesh(geo.body, bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  parent.add(body);

  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d");
  const texture = kit.track(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  let current = item;
  const redraw = (next: EnvelopeItem) => {
    if (!ctx) return;
    drawFace(ctx, next);
    texture.needsUpdate = true;
  };
  redraw(item);
  void document.fonts?.ready.then(() => redraw(current));
  const faceMaterial = kit.track(new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.3, metalness: 0.12, envMapIntensity: 0.9 }));
  const face = new THREE.Mesh(geo.face, faceMaterial);
  face.position.z = CARD.depth / 2 + 0.001;
  face.receiveShadow = true;
  parent.add(face);

  for (const mesh of [body, face]) mesh.userData.envelopeId = item.id satisfies EnvelopeId;

  return {
    body,
    face,
    restyle: (next) => {
      current = next;
      bodyMaterial.color.set(deepen(next.color, 0.45));
      redraw(next);
    },
    resources: [bodyMaterial, faceMaterial, texture],
  };
}

/**
 * Tarjeta en su bolsillo. Se cuelga de la tapa (`group` es hijo de la bisagra)
 * girada media vuelta: su cara (+Z local) mira hacia el interior de la tapa,
 * que es lo que ve la cámara con la carpeta abierta.
 */
export function createWalletCard(item: EnvelopeItem, index: number, count: number, kit: MaterialKit, geo: CardGeometries, maxAnisotropy: number): EnvelopePart {
  const group = new THREE.Group();
  const slot = walletSlot(index, count);
  group.position.set(slot.x, slot.y, slot.z);
  group.rotation.set(0, Math.PI, 0);
  group.scale.setScalar(WALLET.scale);
  const hover = new THREE.Group();
  group.add(hover);
  // Las tarjetas no tienen boca: el grupo existe para que las animaciones de los sobres no fallen.
  const mouth = new THREE.Group();
  hover.add(mouth);
  const card = createCardFace(hover, item, kit, geo, maxAnisotropy);

  return {
    kind: "card",
    item,
    index,
    group,
    hover,
    mouth,
    // Opaca: el orden de dibujo solo importa para que la cara vaya sobre el cuerpo.
    setLayer: (base) => {
      card.body.renderOrder = base;
      card.face.renderOrder = base + 1;
    },
    fitLabel: () => undefined,
    restyle: card.restyle,
    dispose: () => {
      group.removeFromParent();
      kit.release(...card.resources);
    },
  };
}

/** Bolsillos de cuero del tarjetero (se rehacen cuando cambia cuántas tarjetas hay). */
export interface WalletPockets {
  setCount: (count: number) => void;
  dispose: () => void;
}

export function createWalletPockets(kit: MaterialKit, parent: THREE.Object3D): WalletPockets {
  const holder = new THREE.Group();
  parent.add(holder);
  let shown = -1;

  const clear = () => {
    holder.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    holder.clear();
  };

  return {
    setCount: (count) => {
      // La altura de cada bolsillo depende de cuántas tarjetas hay: se rehacen al cambiar.
      if (count === shown) return;
      clear();
      shown = count;
      for (let index = 0; index < pocketCount(count); index++) {
        const rect = pocketRect(index, count);
        const pocket = new THREE.Group();
        pocket.position.set(rect.x, rect.y, rect.z);
        holder.add(pocket);
        const panel = new THREE.Mesh(roundedSlab(rect.width, rect.height, WALLET.pocketDepth, 0.1, 0.006), kit.leatherEdge);
        panel.castShadow = true;
        panel.receiveShadow = true;
        pocket.add(panel);
        // Pespunte a lo largo del borde (del lado de la cámara: -Z en la tapa).
        const seam = stitchLine(rect.width - 0.3, kit.stitch);
        seam.position.set(0, rect.height / 2 - 0.09, -WALLET.pocketDepth / 2 - 0.006);
        pocket.add(seam);
      }
    },
    dispose: () => {
      clear();
      holder.removeFromParent();
    },
  };
}
