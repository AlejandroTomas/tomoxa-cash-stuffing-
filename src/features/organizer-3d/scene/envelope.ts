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
const ZIP_Y = TOP - 0.11;
const LABEL_H = 0.36;
const LABEL_Y = TOP - 0.34;

/** Geometrías comunes a los seis sobres: se crean una vez. */
export interface EnvelopeGeometries {
  back: THREE.BufferGeometry;
  front: THREE.BufferGeometry;
  weld: THREE.BufferGeometry;
  header: THREE.BufferGeometry;
  tape: THREE.BufferGeometry;
  tooth: THREE.BufferGeometry;
  slider: THREE.BufferGeometry;
  pull: THREE.BufferGeometry;
  note: THREE.BufferGeometry;
  label: THREE.BufferGeometry;
}

export function createEnvelopeGeometries(): EnvelopeGeometries {
  return {
    back: roundedSlab(EW, EH, 0.02, 0.16, 0.008),
    front: roundedSlab(EW - 0.04, EH - 0.36, 0.012, 0.15, 0.005),
    weld: roundedFrame(EW, EH, 0.16, 0.075, 0.012),
    header: roundedSlab(EW - 0.2, 0.42, 0.008, 0.06, 0.003),
    tape: roundedSlab(EW - 0.22, 0.09, 0.014, 0.035, 0.005),
    tooth: new THREE.BoxGeometry(0.024, 0.048, 0.02),
    slider: roundedSlab(0.17, 0.11, 0.055, 0.035, 0.015),
    pull: roundedSlab(0.075, 0.2, 0.016, 0.03, 0.006),
    note: roundedSlab(2.5, 1.25, 0.008, 0.06, 0.003),
    label: new THREE.PlaneGeometry(LABEL_H * LABEL_ASPECT, LABEL_H),
  };
}

/**
 * Bolsa plástica con cierre: película trasera tintada, contenido de papel,
 * película frontal más clara, soldadura perimetral, cierre y etiqueta.
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

  add(geo.back, kit.plastic(item.color, { opacity: 0.8, roughness: 0.38, clearcoat: 0.5 }), [0, 0, -0.03], 0, true);

  // Contenido: tarjetas de papel genéricas (no imitan billetes).
  const paper = kit.paper(item.tone);
  add(geo.note, paper, [0.1, -0.22, -0.012], 1).rotation.z = 0.035;
  add(geo.note, paper, [-0.08, -0.36, -0.002], 1).rotation.z = -0.025;

  add(geo.front, kit.plastic(item.color, { opacity: 0.32, roughness: 0.14, clearcoat: 1, lighten: 0.25 }), [0, -0.18, 0.016], 2);
  add(geo.weld, kit.plastic(item.color, { opacity: 0.9, roughness: 0.32, clearcoat: 0.6, lighten: 0.1 }), [0, 0, 0.02], 3);
  add(geo.header, kit.plastic(item.color, { opacity: 0.9, roughness: 0.3, clearcoat: 0.8 }), [0, LABEL_Y + 0.02, 0.026], 3);

  // Cierre: cinta, dientes (una InstancedMesh), carro y jalador.
  const dark = `#${new THREE.Color(item.color).lerp(new THREE.Color("#2b2f38"), 0.35).getHexString()}`;
  add(geo.tape, kit.plastic(dark, { opacity: 0.97, roughness: 0.55, clearcoat: 0.2 }), [0, ZIP_Y, 0.024], 3);
  const teethCount = Math.floor((EW - 0.5) / 0.04);
  const teeth = new THREE.InstancedMesh(geo.tooth, kit.zipperTeeth, teethCount);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < teethCount; i++) {
    matrix.makeTranslation(-(EW - 0.5) / 2 + i * 0.04, ZIP_Y + (i % 2 ? 0.011 : -0.011), 0.036);
    teeth.setMatrixAt(i, matrix);
  }
  teeth.instanceMatrix.needsUpdate = true;
  hover.add(teeth);
  add(geo.slider, kit.chrome, [EW / 2 - 0.42, ZIP_Y, 0.05], 0, true);
  const pull = add(geo.pull, kit.chrome, [EW / 2 - 0.42, ZIP_Y - 0.13, 0.075], 0);
  pull.rotation.x = 0.35;

  // Etiqueta impresa: texto real en canvas, legible en el encabezado visible.
  const label = add(
    geo.label,
    kit.track(new THREE.MeshBasicMaterial({ map: kit.track(createLabelTexture(item, maxAnisotropy)), transparent: true, depthWrite: false, toneMapped: false })),
    [-0.3, LABEL_Y, 0.034],
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
