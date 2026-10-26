import * as THREE from "three";
import type { EnvelopeItem } from "../domain/envelopeView";
import { STAND, standSize, standSlots, standStep, type StandPlacement } from "./cardStandLayout";
import { roundedSlab } from "./geometry";
import { CARD } from "./layout";
import type { MaterialKit } from "./materials";
import type { SlotPart } from "./slotModel";
import { createCardFace, type CardGeometries } from "./walletCard";

/** Acabado del tarjetero: laca como la cajonera o acrílico como el archivador. */
export type StandFinish = "lacquer" | "acrylic";

export interface CardStand {
  /** Base escalonada (se coloca y gira con `resize`). */
  group: THREE.Group;
  /** Rehace la base para `count` tarjetas y la pone en su lugar. */
  resize: (count: number, placement: StandPlacement) => void;
  /** Tarjeta de pie (pieza de la escena de ranuras, en coordenadas de la mesa). */
  createCard: (item: EnvelopeItem, index: number) => SlotPart;
  dispose: () => void;
}

export function createCardStand(kit: MaterialKit, finish: StandFinish, cardGeometries: CardGeometries, maxAnisotropy: number): CardStand {
  const group = new THREE.Group();
  group.name = "tarjetero";
  const baseMaterial =
    finish === "lacquer"
      ? kit.track(new THREE.MeshPhysicalMaterial({ color: "#eccac2", roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.28, envMapIntensity: 0.75 }))
      : kit.track(
          new THREE.MeshPhysicalMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: 0.32,
            roughness: 0.05,
            clearcoat: 1,
            clearcoatRoughness: 0.04,
            envMapIntensity: 1.6,
            depthWrite: false,
          }),
        );

  let shown = -1;
  const clear = () => {
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    group.clear();
  };

  function build(count: number) {
    clear();
    const size = standSize(count);
    // Escalones: del frente (bajo) hacia atrás (alto). Cada uno con canto champán y la ranura de su tarjeta.
    for (let index = 0; index < standSlots(count); index++) {
      const step = standStep(index, count);
      const block = new THREE.Mesh(roundedSlab(size.x, step.height, STAND.step + 0.02, 0.06, 0.02), baseMaterial);
      block.position.set(0, step.height / 2, step.z);
      block.castShadow = finish === "lacquer";
      block.receiveShadow = true;
      block.renderOrder = finish === "acrylic" ? 20 : 0;
      group.add(block);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(size.x - 0.06, 0.025, 0.03), kit.champagne);
      trim.position.set(0, step.height + 0.002, step.z + STAND.step / 2 - 0.02);
      group.add(trim);
    }
    // Placa champán debajo (como el archivador) para asentarlo en la mesa.
    const plate = new THREE.Mesh(roundedSlab(size.x + 0.16, size.z + 0.16, 0.05, 0.1, 0.02).rotateX(-Math.PI / 2), kit.champagne);
    plate.position.y = 0.025;
    plate.receiveShadow = true;
    plate.castShadow = true;
    group.add(plate);
  }

  return {
    group,
    resize: (count, placement) => {
      if (standSlots(count) !== shown) {
        shown = standSlots(count);
        build(count);
      }
      group.position.set(placement.x, 0, placement.z);
      group.rotation.set(0, placement.ry, 0);
    },
    createCard: (item, index) => {
      const cardGroup = new THREE.Group();
      cardGroup.rotation.order = "YXZ";
      const hover = new THREE.Group();
      cardGroup.add(hover);
      const card = createCardFace(hover, item, kit, cardGeometries, maxAnisotropy);
      // Las fichas entran por el borde de arriba, un poco al frente.
      const mouthLocal = new THREE.Vector3(0, CARD.height / 2 - 0.2, 0.1);
      return {
        kind: "card",
        item,
        index,
        group: cardGroup,
        hover,
        targets: [card.body, card.face],
        mouth: (target) => hover.localToWorld(target.copy(mouthLocal)),
        restyle: card.restyle,
        dispose: () => {
          cardGroup.removeFromParent();
          kit.release(...card.resources);
        },
      };
    },
    dispose: () => {
      clear();
      group.removeFromParent();
    },
  };
}
