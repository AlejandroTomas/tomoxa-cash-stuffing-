import * as THREE from "three";
import type { EnvelopeId, EnvelopeItem } from "../../domain/envelopeView";
import { roundedSlab, stitches } from "../geometry";
import { createLabelTexture, redrawLabel, STACKED_LABEL_ASPECT } from "../labels";
import type { SceneRuntime } from "../runtime";
import type { SlotModel, SlotPart } from "../slotModel";
import { FILES, filesFrame, filesPresentFrame, filesSize, folderExitPath, folderAjar, folderRest } from "./filesLayout";

/**
 * Archivador de escritorio: placa champán, bandeja de acrílico transparente
 * (extremo izquierdo alto e inclinado, cantos que brillan) y carpetas verticales
 * de cuero sintético con solapa, costura y etiqueta grabada. Solo representa.
 */
export function createFilesModel(runtime: SceneRuntime): SlotModel {
  const { kit, maxAnisotropy } = runtime;
  const group = new THREE.Group();
  group.name = "archivador";

  // Acrílico: casi invisible de frente, con reflejos del entorno; los cantos, más densos, se ven "iluminados".
  const acrylic = kit.track(
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.14,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const acrylicEdge = kit.track(new THREE.MeshPhysicalMaterial({ color: "#fff8f2", transparent: true, opacity: 0.55, roughness: 0.08, clearcoat: 1, envMapIntensity: 1.4, depthWrite: false }));

  // ── Base (se rearma si cambia el largo) ───────────────────────────────────
  let base: THREE.Group | null = null;
  let baseCount = 0;
  function buildBase(count: number) {
    const n = Math.max(1, count);
    if (base && n === baseCount) return;
    disposeBase();
    baseCount = n;
    base = new THREE.Group();
    const size = filesSize(n);
    const { plate, wall, wallHeight, tallWallHeight } = FILES;
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, order = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.renderOrder = order;
      base!.add(mesh);
      return mesh;
    };
    // Placa metálica con canto biselado.
    const plateMesh = add(roundedSlab(size.x + 0.24, size.z + 0.24, plate, 0.14, 0.04).rotateX(-Math.PI / 2), kit.champagne, 0, plate / 2, 0);
    plateMesh.castShadow = true;
    plateMesh.receiveShadow = true;
    // Paredes: se dibujan después de las carpetas (orden alto) para que se vean a través.
    const wallY = plate + wallHeight / 2;
    add(new THREE.BoxGeometry(size.x, wallHeight, wall), acrylic, 0, wallY, size.z / 2 - wall / 2, 20);
    add(new THREE.BoxGeometry(size.x, wallHeight, wall), acrylic, 0, wallY, -size.z / 2 + wall / 2, 19);
    add(new THREE.BoxGeometry(wall, wallHeight, size.z - wall * 2), acrylic, size.x / 2 - wall / 2, wallY, 0, 19);
    // Extremo izquierdo: alto atrás y bajando hacia el frente (perfil en Z–Y).
    const zf = size.z / 2;
    const profile = new THREE.Shape();
    profile.moveTo(-zf, 0);
    profile.lineTo(zf, 0);
    profile.lineTo(zf, wallHeight);
    profile.lineTo(-zf * 0.15, tallWallHeight);
    profile.lineTo(-zf, tallWallHeight);
    profile.closePath();
    const endGeometry = new THREE.ExtrudeGeometry(profile, { depth: wall, bevelEnabled: false });
    // El perfil está en XY (x = z del mundo): se gira para que quede en el plano Z–Y.
    endGeometry.rotateY(-Math.PI / 2);
    add(endGeometry, acrylic, -size.x / 2 + wall, plate, 0, 19);
    // Cantos superiores: tiras más densas que atrapan la luz.
    const edge = 0.022;
    add(new THREE.BoxGeometry(size.x, edge, wall + 0.004), acrylicEdge, 0, plate + wallHeight, zf - wall / 2, 21);
    add(new THREE.BoxGeometry(size.x, edge, wall + 0.004), acrylicEdge, 0, plate + wallHeight, -zf + wall / 2, 21);
    add(new THREE.BoxGeometry(wall + 0.004, edge, size.z), acrylicEdge, size.x / 2 - wall / 2, plate + wallHeight, 0, 21);
    const slope = new THREE.Vector2(zf * 1.15, tallWallHeight - wallHeight);
    const slant = add(new THREE.BoxGeometry(wall + 0.004, edge, slope.length()), acrylicEdge, -size.x / 2 + wall / 2, plate + (wallHeight + tallWallHeight) / 2, (zf + -zf * 0.15) / 2, 21);
    slant.rotation.x = Math.atan2(slope.y, slope.x);
    add(new THREE.BoxGeometry(wall + 0.004, edge, zf * 0.85), acrylicEdge, -size.x / 2 + wall / 2, plate + tallWallHeight, (-zf - zf * 0.15) / 2, 21);
    group.add(base);
  }
  function disposeBase() {
    if (!base) return;
    base.removeFromParent();
    base.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    base = null;
  }

  // ── Carpetas: geometrías comunes ──────────────────────────────────────────
  const W = FILES.folderWidth;
  const H = FILES.folderHeight;
  const D = FILES.folderDepth;
  const labelWidth = W * 0.84;
  const geo = {
    body: roundedSlab(W, H, D, 0.1, 0.045),
    flap: roundedSlab(W + 0.012, 0.5, 0.05, 0.08, 0.022),
    tab: roundedSlab(0.3, 0.09, 0.06, 0.045, 0.02),
    label: new THREE.PlaneGeometry(labelWidth, labelWidth / STACKED_LABEL_ASPECT),
  };

  function createPart(item: EnvelopeItem, index: number): SlotPart {
    const group = new THREE.Group();
    group.rotation.order = "YXZ";
    const hover = new THREE.Group();
    group.add(hover);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      hover.add(mesh);
      return mesh;
    };
    const leather = kit.leatherTint(item.color, 0.2);
    const flapLeather = kit.leatherTint(item.color, 0.08);
    add(geo.body, leather, 0, 0, 0);
    // Solapa superior que cubre el frente, con su lengüeta.
    add(geo.flap, flapLeather, 0, H / 2 - 0.25, D / 2 + 0.012);
    add(geo.tab, flapLeather, 0, H / 2 - 0.52, D / 2 + 0.03);
    // Costura perimetral del frente (una sola malla instanciada).
    const seam = stitches(W - 0.13, H - 0.62, 0.07, kit.stitch, 0.1, 0.05);
    seam.position.set(0, -0.26, D / 2 + 0.006);
    seam.castShadow = false;
    hover.add(seam);
    // Etiqueta grabada: icono arriba y nombre abajo.
    const labelTexture = kit.track(createLabelTexture(item, maxAnisotropy, "stacked"));
    const labelMaterial = kit.track(new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false, toneMapped: false }));
    const label = add(geo.label, labelMaterial, 0, 0.18, D / 2 + 0.008);
    label.castShadow = false;
    label.renderOrder = 5;

    hover.traverse((object) => {
      object.userData.envelopeId = item.id satisfies EnvelopeId;
    });
    const mouthLocal = new THREE.Vector3(0, H / 2 + 0.12, 0);

    return {
      item,
      index,
      group,
      hover,
      targets: hover.children.slice(),
      mouth: (target) => hover.localToWorld(target.copy(mouthLocal)),
      restyle: (next) => {
        const white = new THREE.Color("#ffffff");
        leather.color.set(next.color).lerp(white, 0.2);
        flapLeather.color.set(next.color).lerp(white, 0.08);
        redrawLabel(labelTexture, next);
      },
      dispose: () => {
        group.removeFromParent();
        seam.geometry.dispose();
        seam.dispose();
        kit.release(labelTexture, labelMaterial, leather, flapLeather);
      },
    };
  }

  return {
    group,
    hoverOffset: { x: 0, y: 0.14, z: 0 },
    createPart: (item, index) => createPart(item, index),
    resize: buildBase,
    rest: folderRest,
    ajar: folderAjar,
    exitPath: folderExitPath,
    frame: filesFrame,
    presentFrame: (_index, count) => filesPresentFrame(count),
    dispose: () => {
      disposeBase();
      Object.values(geo).forEach((geometry) => geometry.dispose());
    },
  };
}
