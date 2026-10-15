import * as THREE from "three";
import type { EnvelopeId, EnvelopeItem } from "../mocks/envelopes.mock";
import { roundedFrame, roundedSlab } from "./geometry";
import { createLabelTexture, LABEL_ASPECT } from "./labels";
import { ENVELOPE, slotPose } from "./layout";
import type { MaterialKit } from "./materials";

export interface EnvelopePart {
  item: EnvelopeItem;
  index: number;
  /** Lo mueven las transiciones (enfocar, extraer, devolver). */
  group: THREE.Group;
  /** Lo mueve solo el hover; así no compite con las transiciones. */
  hover: THREE.Group;
  /** Orden de dibujo de las capas transparentes; el sobre activo va encima. */
  setLayer: (base: number) => void;
}

const EW = ENVELOPE.width;
const EH = ENVELOPE.height;
const TOP = EH / 2;
const LABEL_H = 0.42;
const LABEL_Y = TOP - 0.36;

/** Geometrías comunes a los seis sobres: se crean una vez. */
export interface EnvelopeGeometries {
  back: THREE.BufferGeometry;
  sleeve: THREE.BufferGeometry;
  front: THREE.BufferGeometry;
  weld: THREE.BufferGeometry;
  lip: THREE.BufferGeometry;
  leftTab: THREE.BufferGeometry;
  rightTab: THREE.BufferGeometry;
  note: THREE.BufferGeometry;
  label: THREE.BufferGeometry;
}

export function createEnvelopeGeometries(): EnvelopeGeometries {
  return {
    back: roundedSlab(EW, EH, 0.03, 0.2, 0.012),
    sleeve: roundedSlab(EW - 0.18, EH - 0.12, 0.012, 0.18, 0.005),
    front: roundedSlab(EW - 0.02, EH - 0.16, 0.05, 0.2, 0.022),
    weld: roundedFrame(EW, EH, 0.2, 0.07, 0.016),
    lip: roundedSlab(EW - 0.12, 0.12, 0.07, 0.06, 0.03),
    leftTab: roundedSlab(0.16, 0.42, 0.05, 0.05, 0.02),
    rightTab: roundedSlab(0.4, 0.62, 0.035, 0.14, 0.014),
    note: roundedSlab(2.4, 1.05, 0.008, 0.06, 0.003),
    label: new THREE.PlaneGeometry(LABEL_H * LABEL_ASPECT, LABEL_H),
  };
}

/**
 * Bolsa plástica esmerilada y gruesa: película trasera tintada, funda interior
 * desplazada (efecto de doble capa), contenido de papel, cara frontal acolchada,
 * soldadura perimetral, labio superior, pestañas de color y etiqueta impresa.
 * Solo representa: no conoce ni modifica montos.
 */
export function createEnvelope(item: EnvelopeItem, index: number, kit: MaterialKit, geo: EnvelopeGeometries, maxAnisotropy: number): EnvelopePart {
  const group = new THREE.Group();
  const slot = slotPose(index);
  group.position.set(slot.x, slot.y, slot.z);
  const hover = new THREE.Group();
  group.add(hover);

  const layered: Array<[THREE.Mesh, number]> = [];
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], layer: number, castShadow = false) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(...position);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    hover.add(m);
    layered.push([m, layer]);
    return m;
  };
  const deep = `#${new THREE.Color(item.color).lerp(new THREE.Color("#3a3340"), 0.18).getHexString()}`;

  add(geo.back, kit.plastic(item.color, { opacity: 0.9, roughness: 0.5, clearcoat: 0.35, lighten: 0 }), [0, 0, -0.045], 0, true);
  // Funda interior desplazada: la doble silueta de las bolsas de la referencia.
  add(geo.sleeve, kit.plastic(item.color, { opacity: 0.5, roughness: 0.5, clearcoat: 0.3, lighten: 0.2 }), [0.1, 0.07, -0.022], 1);

  // Contenido: tarjetas de papel genéricas (no imitan billetes).
  const paper = kit.paper(item.tone);
  add(geo.note, paper, [0.15, -0.3, -0.012], 1).rotation.z = 0.03;

  // Cara frontal acolchada y esmerilada: deja ver el contenido difuso.
  add(geo.front, kit.plastic(item.color, { opacity: 0.74, roughness: 0.5, clearcoat: 0.6, lighten: 0.04 }), [0, -0.06, 0.012], 2);
  add(geo.weld, kit.plastic(item.color, { opacity: 0.88, roughness: 0.4, clearcoat: 0.5, lighten: 0.3 }), [0, 0, 0.03], 3);
  add(geo.lip, kit.plastic(item.color, { opacity: 0.9, roughness: 0.35, clearcoat: 0.8, lighten: 0.5 }), [0, TOP - 0.07, 0.03], 3);

  // Pestañas: una opaca en el borde izquierdo y otra translúcida asomando a la derecha.
  add(geo.leftTab, kit.plastic(deep, { opacity: 0.96, roughness: 0.45, clearcoat: 0.4 }), [-EW / 2 + 0.02, LABEL_Y - 0.16, 0.02], 3);
  if (index >= 2) add(geo.rightTab, kit.plastic(item.color, { opacity: 0.8, roughness: 0.5, clearcoat: 0.4, lighten: 0.1 }), [EW / 2 + 0.08, TOP - 0.42, -0.03], 0);

  // Etiqueta impresa sobre el plástico.
  const label = add(
    geo.label,
    kit.track(new THREE.MeshBasicMaterial({ map: kit.track(createLabelTexture(item, maxAnisotropy)), transparent: true, depthWrite: false, toneMapped: false })),
    [-0.05, LABEL_Y, 0.042],
    4,
  );
  label.name = "label";

  hover.traverse((object) => {
    object.userData.envelopeId = item.id satisfies EnvelopeId;
  });

  const setLayer = (base: number) => layered.forEach(([m, layer]) => (m.renderOrder = base + layer));
  setLayer(10 + index * 5);
  return { item, index, group, hover, setLayer };
}
