import * as THREE from "three";
import { pipingGeometry, roundedSlab, spineGeometry, stitchLine, stitches } from "./geometry";
import { BINDER, RINGS } from "./layout";
import type { MaterialKit } from "./materials";

export interface BinderParts {
  group: THREE.Group;
  /** Bisagra de la tapa delantera (gira en Y). */
  coverPivot: THREE.Group;
  /** Correa con broche: bisagra en el canto trasero y bisagra de la lengüeta. */
  strapPivot: THREE.Group;
  strapTab: THREE.Group;
  /** Sombra de contacto bajo la tapa abierta (se desvanece al cerrar). */
  coverShadow: THREE.MeshBasicMaterial;
  /** Mallas que abren la carpeta al tocarlas. */
  hitTargets: THREE.Object3D[];
}

const { width: W, height: H, panel: P, radius: R, backZ, frontZ } = BINDER;
/** Altura de la correa con broche (un poco arriba del centro, como en la referencia). */
const STRAP_Y = 0.55;

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, position: [number, number, number], shadows = true) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...position);
  m.castShadow = shadows;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Carpeta de cuero sintético: tapa trasera, lomo, tapa articulada, anillas y correa. */
export function createBinder(kit: MaterialKit): BinderParts {
  const group = new THREE.Group();
  const hitTargets: THREE.Object3D[] = [];

  // ── Mesa: sombras proyectadas + sombras de contacto ───────────────────────
  const tableZ = backZ - P / 2 - 0.015;
  const catcher = mesh(new THREE.PlaneGeometry(40, 40), kit.shadowCatcher, group, [0, 0, tableZ - 0.005], false);
  catcher.castShadow = false;
  const blob = new THREE.PlaneGeometry(W + 1.5, H + 1.4);
  mesh(blob, kit.contactShadow, group, [0.12, -0.18, tableZ], false).renderOrder = -2;
  const coverShadow = kit.track(kit.contactShadow.clone());
  coverShadow.opacity = 0;
  mesh(blob, coverShadow, group, [-W - 0.12, -0.18, tableZ], false).renderOrder = -2;

  // ── Tapa trasera ──────────────────────────────────────────────────────────
  const back = mesh(roundedSlab(W, H, P, R, 0.035), kit.leather, group, [0, 0, backZ]);
  mesh(pipingGeometry(W - 0.01, H - 0.01, R, 0.056), kit.leatherEdge, group, [0, 0, backZ]);
  const liningZ = backZ + P / 2 + 0.012;
  mesh(roundedSlab(W - 0.34, H - 0.34, 0.022, R - 0.12, 0.008), kit.lining, group, [0, 0, liningZ]);
  const backStitch = stitches(W - 0.5, H - 0.5, R - 0.16, kit.stitch);
  backStitch.position.z = liningZ + 0.013;
  group.add(backStitch);
  hitTargets.push(back);

  // ── Lomo: media caña que une ambas tapas ──────────────────────────────────
  const spineRadius = (frontZ + P - backZ) / 2;
  mesh(spineGeometry(spineRadius, P * 0.95, H - 0.02), kit.leather, group, [-W / 2 + 0.02, 0, (frontZ + P + backZ) / 2]);

  // Hojas de repuesto blancas detrás de los sobres (asoman junto a las anillas).
  const sheet = roundedSlab(W - 0.7, H - 0.55, 0.012, 0.12, 0.004);
  const sheetPaper = kit.paper("#fbf8f3");
  mesh(sheet, sheetPaper, group, [0.12, 0, liningZ + 0.03]).rotation.z = -0.01;
  mesh(sheet, sheetPaper, group, [0.2, -0.03, liningZ + 0.05]).rotation.z = 0.008;

  // ── Mecanismo de anillas ──────────────────────────────────────────────────
  const plateZ = liningZ + 0.05;
  mesh(roundedSlab(0.34, H - 0.7, 0.07, 0.14, 0.03), kit.metal, group, [RINGS.x - 0.02, 0, plateZ]);
  const rivet = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20).rotateX(Math.PI / 2);
  for (const y of [-(H - 1.1) / 2, (H - 1.1) / 2]) mesh(rivet, kit.metal, group, [RINGS.x, y, plateZ + 0.045]);
  const ring = new THREE.TorusGeometry(RINGS.radius, RINGS.tube, 14, 64);
  for (const y of RINGS.ys) {
    const r = mesh(ring, kit.metal, group, [RINGS.x, y, RINGS.z]);
    r.rotation.x = Math.PI / 2; // plano XZ: atraviesa la pila de sobres
  }

  // ── Tapa delantera (articulada en el lomo) ────────────────────────────────
  const coverPivot = new THREE.Group();
  coverPivot.position.set(-W / 2, 0, frontZ + P / 2);
  group.add(coverPivot);
  const cover = mesh(roundedSlab(W, H, P, R, 0.035), kit.leather, coverPivot, [W / 2, 0, 0]);
  mesh(pipingGeometry(W - 0.01, H - 0.01, R, 0.056), kit.leatherEdge, coverPivot, [W / 2, 0, 0]);
  const outerStitch = stitches(W - 0.36, H - 0.36, R - 0.12, kit.stitch);
  outerStitch.position.set(W / 2, 0, P / 2 + 0.004);
  coverPivot.add(outerStitch);
  hitTargets.push(cover);

  // Medallón discreto (sin logotipos de terceros).
  const medallion = new THREE.Group();
  medallion.position.set(W / 2 + 0.1, 0.95, P / 2 + 0.012);
  coverPivot.add(medallion);
  mesh(new THREE.TorusGeometry(0.26, 0.022, 10, 56), kit.metal, medallion, [0, 0, 0]);
  mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 40).rotateX(Math.PI / 2), kit.leatherEdge, medallion, [0, 0, -0.004]);
  mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 40), kit.metal, medallion, [0, 0, 0.004]);

  // Botón macho del broche (queda bajo la lengüeta de la correa).
  const stud = new THREE.CylinderGeometry(0.075, 0.09, 0.05, 24).rotateX(Math.PI / 2);
  mesh(stud, kit.metal, coverPivot, [W - 0.5, STRAP_Y, P / 2 + 0.02]);

  // Interior de la tapa (mira a -Z cerrada; a la cámara cuando se abre).
  const innerZ = -P / 2 - 0.012;
  mesh(roundedSlab(W - 0.34, H - 0.34, 0.022, R - 0.12, 0.008), kit.lining, coverPivot, [W / 2, 0, innerZ]);
  const innerStitch = stitches(W - 0.5, H - 0.5, R - 0.16, kit.stitch);
  innerStitch.position.set(W / 2, 0, innerZ - 0.013);
  coverPivot.add(innerStitch);
  // Banda elástica vertical junto al lomo (porta pluma), con pespunte a ambos lados.
  mesh(roundedSlab(0.42, H - 0.7, 0.045, 0.06, 0.018), kit.leatherEdge, coverPivot, [0.62, 0, innerZ - 0.03]);
  for (const dx of [-0.16, 0.16]) {
    const seam = stitchLine(H - 0.9, kit.stitch);
    seam.rotation.z = Math.PI / 2;
    seam.position.set(0.62 + dx, 0, innerZ - 0.056);
    coverPivot.add(seam);
  }

  // ── Correa con broche ─────────────────────────────────────────────────────
  const strapDepth = frontZ + P - backZ + 0.07;
  const strapPivot = new THREE.Group();
  strapPivot.position.set(W / 2 - 0.03, STRAP_Y, backZ);
  group.add(strapPivot);
  mesh(roundedSlab(0.08, 0.96, strapDepth, 0.04, 0.03), kit.leather, strapPivot, [0.05, 0, strapDepth / 2]);
  const strapTab = new THREE.Group();
  strapTab.position.set(0.05, 0, strapDepth);
  strapPivot.add(strapTab);
  mesh(roundedSlab(1.02, 0.96, 0.07, 0.42, 0.03), kit.leather, strapTab, [-0.47, 0, 0]);
  const tabStitch = stitches(0.84, 0.78, 0.33, kit.stitch, 0.1, 0.052);
  tabStitch.position.set(-0.47, 0, 0.038);
  strapTab.add(tabStitch);
  // Broche: domo dorado.
  mesh(new THREE.SphereGeometry(0.17, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.55), kit.metal, strapTab, [-0.62, 0, 0.03]);
  mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 36), kit.metal, strapTab, [-0.62, 0, 0.035]);
  strapTab.traverse((o) => hitTargets.push(o));

  return { group, coverPivot, strapPivot, strapTab, coverShadow, hitTargets };
}
