import * as THREE from "three";
import type { EnvelopeDocument } from "../domain/document";
import { createDocumentTexture } from "./documentTexture";
import { roundedSlab } from "./geometry";
import { DOCUMENT, insidePose } from "./layout";

export interface DocumentItem {
  doc: EnvelopeDocument;
  mesh: THREE.Mesh;
}

/** Documentos del sobre abierto. Se crean al abrir y se liberan al cerrar (`dispose`). */
export interface DocumentStack {
  group: THREE.Group;
  items: Map<string, DocumentItem>;
  dispose: () => void;
}

/** Grosor del papel; el frente (+Z) lleva la textura impresa. */
const PAPER = 0.008;

export function createDocumentStack(docs: readonly EnvelopeDocument[], maxAnisotropy: number): DocumentStack {
  const group = new THREE.Group();
  const items = new Map<string, DocumentItem>();
  const body = roundedSlab(DOCUMENT.width, DOCUMENT.height, PAPER, 0.06, 0.003);
  const face = new THREE.PlaneGeometry(DOCUMENT.width - 0.01, DOCUMENT.height - 0.01);
  const owned: Array<THREE.Material | THREE.Texture | THREE.BufferGeometry> = [body, face];

  docs.forEach((doc, order) => {
    const texture = createDocumentTexture(doc, maxAnisotropy);
    // alphaTest: las esquinas redondeadas del canvas son transparentes.
    const print = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, roughness: 0.88, envMapIntensity: 0.3 });
    // Canto propio de cada documento: así se puede recortar uno sin tocar a los demás.
    const edge = new THREE.MeshStandardMaterial({ color: "#f4efe6", roughness: 0.92 });
    owned.push(texture, print, edge);
    const mesh = new THREE.Mesh(body, edge);
    const printed = new THREE.Mesh(face, print);
    printed.position.z = PAPER / 2 + 0.001;
    mesh.add(printed);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const pose = insidePose(order);
    mesh.position.set(pose.x, pose.y, pose.z);
    // Guardado no se dibuja: el frente del sobre es translúcido y se notaría.
    mesh.visible = false;
    mesh.traverse((object) => {
      object.userData.documentId = doc.id;
    });
    group.add(mesh);
    items.set(doc.id, { doc, mesh });
  });

  return {
    group,
    items,
    dispose: () => {
      group.removeFromParent();
      owned.forEach((resource) => resource.dispose());
      items.clear();
    },
  };
}
