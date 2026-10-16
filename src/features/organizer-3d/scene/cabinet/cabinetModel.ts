import * as THREE from "three";
import type { EnvelopeId, EnvelopeItem } from "../../domain/envelopeView";
import { roundedFrame, roundedSlab } from "../geometry";
import { createLabelTexture, LABEL_ASPECT, redrawLabel } from "../labels";
import type { SceneRuntime } from "../runtime";
import type { SlotModel, SlotPart } from "../slotModel";
import {
  CABINET,
  cabinetFrame,
  cabinetPresentFrame,
  cabinetSize,
  cellCenter,
  drawerExitPath,
  drawerAjar,
  drawerRest,
  drawerSize,
  rowsFor,
} from "./cabinetLayout";

/** Plástico lacado de la carcasa (rosa empolvado) y su interior, un tono más hondo. */
const SHELL_COLOR = "#eccac2";
const INNER_COLOR = "#dcb3aa";

/**
 * Cajonera de escritorio: carcasa lacada con canto champán, entrepaños, patas
 * metálicas y cajones de plástico translúcido con hendidura para jalar,
 * etiqueta impresa y un fajo de papel dentro. Solo representa: no conoce montos.
 */
export function createCabinetModel(runtime: SceneRuntime): SlotModel {
  const { kit, maxAnisotropy } = runtime;
  const group = new THREE.Group();
  group.name = "cajonera";

  const shellMaterial = kit.track(new THREE.MeshPhysicalMaterial({ color: SHELL_COLOR, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.28, envMapIntensity: 0.75 }));
  const innerMaterial = kit.track(new THREE.MeshStandardMaterial({ color: INNER_COLOR, roughness: 0.75, envMapIntensity: 0.5 }));

  // ── Carcasa (se rearma si cambia el número de filas) ──────────────────────
  let shell: THREE.Group | null = null;
  let shellRows = 0;
  function buildShell(count: number) {
    const rows = rowsFor(count);
    if (shell && rows === shellRows) return;
    disposeShell();
    shellRows = rows;
    shell = new THREE.Group();
    const size = cabinetSize(count);
    const { wall, divider, depth, feet } = CABINET;
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, cast = true) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      shell!.add(mesh);
      return mesh;
    };
    const bottomY = feet;
    const centerY = feet + size.y / 2;
    // Tapa y piso: losas redondeadas acostadas.
    add(roundedSlab(size.x, depth, wall, 0.16, 0.035).rotateX(-Math.PI / 2), shellMaterial, 0, bottomY + size.y - wall / 2, 0);
    add(roundedSlab(size.x, depth, wall, 0.16, 0.035).rotateX(-Math.PI / 2), shellMaterial, 0, bottomY + wall / 2, 0);
    // Costados.
    const side = roundedSlab(depth, size.y - 0.02, wall, 0.16, 0.035).rotateY(Math.PI / 2);
    add(side, shellMaterial, -size.x / 2 + wall / 2, centerY, 0);
    add(side.clone(), shellMaterial, size.x / 2 - wall / 2, centerY, 0);
    // Fondo e interiores (más hondos: se ven al sacar un cajón).
    add(new THREE.BoxGeometry(size.x - wall * 2, size.y - wall * 2, 0.05), innerMaterial, 0, centerY, -depth / 2 + wall / 2, false);
    const innerDepth = depth - wall * 0.6;
    const innerZ = wall * 0.3;
    add(new THREE.BoxGeometry(divider, size.y - wall * 2, innerDepth), shellMaterial, 0, centerY, innerZ);
    for (let row = 1; row < rows; row++) {
      const y = cellCenter(row * CABINET.columns, count).y + CABINET.cellHeight / 2 + divider / 2;
      add(new THREE.BoxGeometry(size.x - wall * 2, divider, innerDepth), shellMaterial, 0, y, innerZ);
    }
    // Canto champán al frente (los "bordes iluminados" de la referencia) y patas.
    const trim = add(roundedFrame(size.x, size.y, 0.16, 0.035, 0.025), kit.champagne, 0, centerY, depth / 2 + 0.004, false);
    trim.receiveShadow = false;
    const footGeometry = new THREE.CylinderGeometry(0.11, 0.13, feet, 20);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) add(footGeometry, kit.champagne, sx * (size.x / 2 - 0.3), feet / 2, sz * (depth / 2 - 0.3));
    }
    group.add(shell);
  }
  function disposeShell() {
    if (!shell) return;
    shell.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    shell.traverse((object) => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
    shell = null;
  }

  // ── Cajones: geometrías comunes ───────────────────────────────────────────
  const drawer = drawerSize();
  const wallT = 0.035;
  const trayH = drawer.height * 0.62;
  const trayDepth = drawer.depth - CABINET.front;
  const geo = {
    front: roundedSlab(drawer.width, drawer.height, CABINET.front, 0.12, 0.035),
    floor: new THREE.BoxGeometry(drawer.width - 0.08, wallT, trayDepth),
    side: new THREE.BoxGeometry(wallT, trayH, trayDepth),
    back: new THREE.BoxGeometry(drawer.width - 0.08, trayH, wallT),
    // Hendidura para jalar: un hueco más oscuro con un labio que sobresale.
    notch: roundedSlab(0.66, 0.15, 0.03, 0.07, 0.012),
    lip: roundedSlab(0.66, 0.05, 0.11, 0.025, 0.018),
    paper: roundedSlab(drawer.width * 0.7, trayDepth * 0.66, 0.22, 0.05, 0.012).rotateX(-Math.PI / 2),
    label: new THREE.PlaneGeometry(drawer.width * 0.62, (drawer.width * 0.62) / LABEL_ASPECT),
  };

  function createPart(item: EnvelopeItem, index: number): SlotPart {
    const group = new THREE.Group();
    group.rotation.order = "YXZ";
    const hover = new THREE.Group();
    group.add(hover);
    const white = new THREE.Color("#ffffff");
    const tinted: Array<{ material: THREE.MeshPhysicalMaterial; lighten: number; darken: number }> = [];
    const plastic = (opacity: number, lighten: number, roughness: number, darken = 0) => {
      const material = kit.plastic(item.color, { opacity, lighten, roughness, clearcoat: 0.9 });
      if (darken) material.color.lerp(new THREE.Color("#3a3340"), darken);
      tinted.push({ material, lighten, darken });
      return material;
    };
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, order: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.renderOrder = order;
      hover.add(mesh);
      return mesh;
    };
    const trayZ = -CABINET.front / 2 - trayDepth / 2;
    const floorY = -drawer.height / 2 + wallT / 2 + 0.02;
    // Bandeja esmerilada: se adivina su contenido a través del frente.
    const trayMaterial = plastic(0.5, 0.42, 0.5);
    add(geo.floor, trayMaterial, 0, floorY, trayZ, 1);
    add(geo.side, trayMaterial, -drawer.width / 2 + 0.04 + wallT / 2, floorY + trayH / 2, trayZ, 1);
    add(geo.side, trayMaterial, drawer.width / 2 - 0.04 - wallT / 2, floorY + trayH / 2, trayZ, 1);
    add(geo.back, trayMaterial, 0, floorY + trayH / 2, trayZ - trayDepth / 2 + wallT / 2, 1);
    // Contenido: un fajo de papel genérico (no imita billetes).
    const paper = kit.paper(item.tone);
    add(geo.paper, paper, 0.05, floorY + 0.13, trayZ + 0.1, 0);
    // Frente translúcido tintado, con canto pulido.
    add(geo.front, plastic(0.78, 0.22, 0.26), 0, 0, 0, 3);
    add(geo.notch, plastic(0.92, 0.05, 0.3, 0.25), 0, drawer.height / 2 - 0.14, CABINET.front / 2 + 0.002, 4);
    add(geo.lip, plastic(1, 0.35, 0.25), 0, drawer.height / 2 - 0.21, CABINET.front / 2 + 0.03, 4);
    // Etiqueta impresa al frente.
    const labelTexture = kit.track(createLabelTexture(item, maxAnisotropy));
    const labelMaterial = kit.track(new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false, toneMapped: false }));
    const label = add(geo.label, labelMaterial, 0, -0.07, CABINET.front / 2 + 0.004, 5);
    label.castShadow = false;

    hover.traverse((object) => {
      object.userData.envelopeId = item.id satisfies EnvelopeId;
    });
    const targets = hover.children.slice();
    // Sobre la parte delantera de la bandeja: con el cajón medio abierto queda fuera de la carcasa.
    const mouthLocal = new THREE.Vector3(0, drawer.height / 2 + 0.12, -0.32);

    return {
      item,
      index,
      group,
      hover,
      targets,
      mouth: (target) => hover.localToWorld(target.copy(mouthLocal)),
      restyle: (next) => {
        tinted.forEach(({ material, lighten, darken }) => {
          material.color.set(next.color).lerp(white, lighten);
          if (darken) material.color.lerp(new THREE.Color("#3a3340"), darken);
        });
        paper.color.set(next.tone);
        redrawLabel(labelTexture, next);
      },
      dispose: () => {
        group.removeFromParent();
        kit.release(labelTexture, labelMaterial, paper, ...tinted.map(({ material }) => material));
      },
    };
  }

  return {
    group,
    hoverOffset: { x: 0, y: 0, z: 0.12 },
    createPart: (item, index) => createPart(item, index),
    resize: buildShell,
    rest: drawerRest,
    ajar: drawerAjar,
    exitPath: drawerExitPath,
    frame: cabinetFrame,
    presentFrame: (_index, count) => cabinetPresentFrame(count),
    dispose: () => {
      disposeShell();
      Object.values(geo).forEach((geometry) => geometry.dispose());
    },
  };
}
