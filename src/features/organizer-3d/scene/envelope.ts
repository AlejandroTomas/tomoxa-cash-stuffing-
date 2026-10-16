import * as THREE from "three";
import type { EnvelopeId, EnvelopeItem } from "../domain/envelopeView";
import { roundedFrame, roundedSlab } from "./geometry";
import { createLabelTexture, LABEL_ASPECT, redrawLabel } from "./labels";
import { ENVELOPE, slotPose } from "./layout";
import type { MaterialKit, PlasticOptions } from "./materials";

export interface EnvelopePart {
  /** Se actualizan al reacomodar la carpeta (crear, archivar o reordenar sobres). */
  item: EnvelopeItem;
  index: number;
  /** Lo mueven las transiciones (enfocar, extraer, devolver). */
  group: THREE.Group;
  /** Lo mueve solo el hover; así no compite con las transiciones. */
  hover: THREE.Group;
  /** Labio frontal de la boca del sobre: gira hacia el frente al abrirlo. */
  mouth: THREE.Group;
  /** Orden de dibujo de las capas transparentes; el sobre activo va encima. */
  setLayer: (base: number) => void;
  /** Recolorea el plástico y reimprime la etiqueta (editar sobre, con vista previa en vivo). */
  restyle: (item: EnvelopeItem) => void;
  /** Quita el sobre de la escena y libera sus materiales (las geometrías son compartidas). */
  dispose: () => void;
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
export function createEnvelope(item: EnvelopeItem, index: number, count: number, kit: MaterialKit, geo: EnvelopeGeometries, maxAnisotropy: number): EnvelopePart {
  const group = new THREE.Group();
  const slot = slotPose(index, false, count);
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
  const deepOf = (color: string) => `#${new THREE.Color(color).lerp(new THREE.Color("#3a3340"), 0.18).getHexString()}`;
  const deep = deepOf(item.color);
  // Cada plástico recuerda de qué color sale y cuánto se aclara, para poder recolorearlo.
  const tinted: Array<{ material: THREE.MeshPhysicalMaterial; deep: boolean; lighten: number }> = [];
  const plastic = (options: PlasticOptions, isDeep = false) => {
    const material = kit.plastic(isDeep ? deep : item.color, options);
    tinted.push({ material, deep: isDeep, lighten: options.lighten ?? 0 });
    return material;
  };

  add(geo.back, plastic({ opacity: 1, roughness: 0.55, clearcoat: 0.35, lighten: 0.16, opaque: true }), [0, 0, -0.045], 0, true);
  // Funda interior desplazada: la doble silueta de las bolsas de la referencia.
  add(geo.sleeve, plastic({ opacity: 0.5, roughness: 0.5, clearcoat: 0.3, lighten: 0.2 }), [0.1, 0.07, -0.022], 1);

  // Contenido: tarjetas de papel genéricas (no imitan billetes).
  const paper = kit.paper(item.tone);
  add(geo.note, paper, [0.15, -0.3, -0.012], 1).rotation.z = 0.03;

  // Cara frontal acolchada y esmerilada: deja ver el contenido difuso.
  add(geo.front, plastic({ opacity: 0.62, roughness: 0.5, clearcoat: 0.6, lighten: 0.06 }), [0, -0.06, 0.012], 2);
  add(geo.weld, plastic({ opacity: 1, roughness: 0.4, clearcoat: 0.5, lighten: 0.3, opaque: true }), [0, 0, 0.03], 3);
  // Labio superior con bisagra en su borde inferior: la "boca" del sobre.
  const mouth = new THREE.Group();
  mouth.position.set(0, TOP - 0.13, 0.03);
  hover.add(mouth);
  const lip = new THREE.Mesh(geo.lip, plastic({ opacity: 1, roughness: 0.35, clearcoat: 0.8, lighten: 0.5, opaque: true }));
  lip.position.y = 0.06;
  lip.receiveShadow = true;
  mouth.add(lip);
  layered.push([lip, 3]);

  // Pestañas: una opaca en el borde izquierdo y otra translúcida asomando a la derecha.
  add(geo.leftTab, plastic({ opacity: 1, roughness: 0.45, clearcoat: 0.4, opaque: true }, true), [-EW / 2 + 0.02, LABEL_Y - 0.16, 0.02], 3);
  if (index >= 2) add(geo.rightTab, plastic({ opacity: 1, roughness: 0.5, clearcoat: 0.4, lighten: 0.2, opaque: true }), [EW / 2 + 0.08, TOP - 0.42, -0.03], 0);

  // Etiqueta impresa sobre el plástico.
  const labelTexture = kit.track(createLabelTexture(item, maxAnisotropy));
  const label = add(
    geo.label,
    kit.track(new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false, toneMapped: false })),
    [-0.05, LABEL_Y, 0.042],
    4,
  );
  label.name = "label";

  hover.traverse((object) => {
    object.userData.envelopeId = item.id satisfies EnvelopeId;
  });

  const setLayer = (base: number) => layered.forEach(([m, layer]) => (m.renderOrder = base + layer));
  setLayer(10 + index * 5);
  const white = new THREE.Color("#ffffff");
  const restyle = (next: EnvelopeItem) => {
    const nextDeep = deepOf(next.color);
    tinted.forEach(({ material, deep: isDeep, lighten }) => material.color.set(isDeep ? nextDeep : next.color).lerp(white, lighten));
    paper.color.set(next.tone);
    redrawLabel(labelTexture, next);
  };

  const own = (): Array<THREE.Material | THREE.Texture> => {
    const resources = new Set<THREE.Material | THREE.Texture>([labelTexture]);
    hover.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material !== kit.zipperTeeth && object.material !== kit.chrome) resources.add(object.material as THREE.Material);
    });
    return [...resources];
  };
  const dispose = () => {
    group.removeFromParent();
    kit.release(...own());
  };

  return { item, index, group, hover, mouth, setLayer, restyle, dispose };
}
