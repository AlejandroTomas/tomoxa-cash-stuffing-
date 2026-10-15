import * as THREE from "three";
import { gsap } from "gsap";
import { envelopesMock, type EnvelopeId } from "../mocks/envelopes.mock";
import { createBinder } from "./binder";
import { createEnvelope, createEnvelopeGeometries, type EnvelopePart } from "./envelope";
import { fovFor, presentDepth, rigFor, type CameraRig } from "./framing";
import { BINDER, ENVELOPE, focusPose, slotPose } from "./layout";
import { createMaterialKit } from "./materials";
import { createStage } from "./stage";

/** Lo que el usuario tocó en el lienzo; React decide qué acción corresponde. */
export type SceneIntent = { type: "binder" } | { type: "envelope"; id: EnvelopeId };

export interface OrganizerSceneApi {
  open: () => Promise<void>;
  close: () => Promise<void>;
  focus: (id: EnvelopeId) => Promise<void>;
  extract: (id: EnvelopeId) => Promise<void>;
  returnEnvelope: (id: EnvelopeId) => Promise<void>;
  /** Regresa el sobre enfocado a su bolsillo (carpeta abierta, sin selección). */
  clearFocus: () => Promise<void>;
  onIntent: (callback: ((intent: SceneIntent) => void) | null) => void;
  dispose: () => void;
}

type SceneStage = "closed" | "open" | "focused" | "extracted";

/** Dirección desde la que mira la cámara: casi de frente, un poco desde arriba. */
const VIEW_DIR = new THREE.Vector3(0, 0.1, 1).normalize();
const STRAP_OPEN = Math.PI / 2 + 0.14;
const STRAP_TAB_OPEN = Math.PI / 2 - 0.08;
const FOCUS_TILT = 0;
/** Cuánto sube el sobre para salir del bolsillo antes de venir al frente. */
const LIFT = 1.25;
/** Pose de presentación del sobre extraído (coordenadas de la carpeta inclinada). */
const EXTRACTED = { rx: -BINDER.tiltX * 0.85, ry: -0.08, rz: -0.03, scale: 1.08 };
/** Distancia (px) por debajo de la cual un pointerup cuenta como toque y no como scroll. */
const TAP_SLOP = 10;

export function createOrganizerScene(mount: HTMLElement): OrganizerSceneApi {
  const { renderer, scene, camera, dispose: disposeStage } = createStage(mount);
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const kit = createMaterialKit(maxAnisotropy);

  // root: flotación y paralaje · tilt: la carpeta "sobre la mesa".
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.x = BINDER.tiltX;
  root.add(tilt);
  scene.add(root);

  const binder = createBinder(kit);
  tilt.add(binder.group);
  const geometries = createEnvelopeGeometries();
  const parts = envelopesMock.map((item, index) => createEnvelope(item, index, kit, geometries, maxAnisotropy));
  parts.forEach((part) => binder.group.add(part.group));
  const byId = new Map<EnvelopeId, EnvelopePart>(parts.map((part) => [part.item.id, part]));
  const envelopeTargets = parts.map((part) => part.hover);
  const coverShadowOpacity = kit.contactShadow.opacity;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const d = (seconds: number) => (reducedMotion ? 0 : seconds);

  let stage: SceneStage = "closed";
  let activeId: EnvelopeId | null = null;
  let disposed = false;
  let visible = true;
  let aspect = 1;
  let intentListener: ((intent: SceneIntent) => void) | null = null;

  // ── Cámara ────────────────────────────────────────────────────────────────
  const rig: CameraRig = rigFor("closed", aspect);
  const framing = () => (stage === "closed" ? "closed" : "open");
  function applyCamera() {
    camera.position.set(rig.tx + VIEW_DIR.x * rig.distance, rig.ty + VIEW_DIR.y * rig.distance, VIEW_DIR.z * rig.distance);
    camera.lookAt(rig.tx, rig.ty, 0);
  }

  // ── Timelines ─────────────────────────────────────────────────────────────
  // Todo lo de GSAP vive en un contexto para matarlo de un golpe al desmontar.
  const ctx = gsap.context(() => undefined);
  let running: gsap.core.Timeline | null = null;
  let settle: (() => void) | null = null;
  let reframePending = false;
  let shadowsDirtyUntil = 0;

  function play(build: (tl: gsap.core.Timeline) => void): Promise<void> {
    if (disposed) return Promise.resolve();
    running?.progress(1).kill();
    return new Promise<void>((resolve) => {
      ctx.add(() => {
        const tl = gsap.timeline({
          onComplete: () => {
            running = null;
            settle = null;
            if (reframePending) snapFraming();
            resolve();
          },
        });
        build(tl);
        running = tl;
        settle = resolve;
        shadowsDirtyUntil = performance.now() + tl.duration() * 1000 + 200;
      });
    });
  }

  function restingLayers(except?: EnvelopePart) {
    parts.forEach((part) => part !== except && part.setLayer(10 + part.index * 5));
  }

  /** Lleva un sobre a su bolsillo (o un poco abajo si `yieldBy` > 0, para "ceder" espacio). */
  function toSlot(tl: gsap.core.Timeline, part: EnvelopePart, at: number, duration: number, yieldBy = 0) {
    const slot = slotPose(part.index);
    tl.to(part.group.position, { x: slot.x, y: slot.y - yieldBy, z: slot.z, duration, ease: "power3.out" }, at);
    tl.to(part.group.rotation, { x: 0, y: 0, z: 0, duration, ease: "power3.out" }, at);
    tl.to(part.group.scale, { x: 1, y: 1, z: 1, duration, ease: "power3.out" }, at);
  }

  /** Camino de regreso: sube sobre su bolsillo, se endereza y entra deslizando. Devuelve cuándo termina. */
  function slideBack(tl: gsap.core.Timeline, part: EnvelopePart, at: number, endY: number): number {
    const slot = slotPose(part.index);
    const travel = d(0.6);
    tl.to(part.group.rotation, { x: 0, y: 0, z: 0, duration: travel, ease: "power2.inOut" }, at);
    tl.to(part.group.scale, { x: 1, y: 1, z: 1, duration: travel, ease: "power2.inOut" }, at);
    tl.to(part.group.position, { x: slot.x, y: slot.y + LIFT, z: slot.z + 0.05, duration: travel, ease: "power2.inOut" }, at);
    tl.call(() => restingLayers(), [], at + travel);
    tl.to(part.group.position, { y: endY, z: slot.z, duration: d(0.45), ease: "power2.out" }, at + travel);
    return at + travel + d(0.45);
  }

  async function open() {
    if (disposed || stage !== "closed") return;
    stage = "open";
    await play((tl) => {
      // Desabrocha: la lengüeta se despega y la correa cae hacia la derecha.
      tl.to(binder.strapTab.rotation, { y: STRAP_TAB_OPEN, duration: d(0.42), ease: "power2.inOut" }, 0);
      tl.to(binder.strapPivot.rotation, { y: STRAP_OPEN, duration: d(0.62), ease: "power2.inOut" }, d(0.1));
      // La tapa "salta" un poco al soltarse el broche y luego abre con peso.
      tl.to(binder.coverPivot.rotation, { y: -0.12, duration: d(0.22), ease: "power1.out" }, d(0.3));
      tl.to(binder.coverPivot.rotation, { y: BINDER.openAngle, duration: d(1.25), ease: "power3.inOut" }, d(0.52));
      tl.to(binder.coverShadow, { opacity: coverShadowOpacity, duration: d(0.8), ease: "power1.out" }, d(1.05));
      tl.to(rig, { ...rigFor("open", aspect), duration: d(1.45), ease: "power2.inOut" }, d(0.3));
      // Al liberar la presión de la tapa, los sobres se acomodan en cascada.
      parts.forEach((part) => {
        const slot = slotPose(part.index);
        tl.to(part.group.position, { y: slot.y + 0.07, duration: d(0.2), ease: "power1.out", yoyo: true, repeat: reducedMotion ? 0 : 1 }, d(1.1) + part.index * d(0.045));
      });
    });
  }

  async function close() {
    if (disposed || stage === "closed") return;
    const extracted = stage === "extracted" && activeId ? byId.get(activeId) : undefined;
    stage = "closed";
    activeId = null;
    clearHover();
    await play((tl) => {
      const start = extracted ? slideBack(tl, extracted, 0, slotPose(extracted.index).y) : 0;
      parts.forEach((part) => part !== extracted && toSlot(tl, part, 0, d(0.5)));
      tl.call(() => restingLayers(), [], start);
      tl.to(binder.coverPivot.rotation, { y: 0, duration: d(1.15), ease: "power3.inOut" }, start + d(0.15));
      tl.to(binder.coverShadow, { opacity: 0, duration: d(0.6) }, start + d(0.2));
      tl.to(rig, { ...rigFor("closed", aspect), duration: d(1.3), ease: "power2.inOut" }, start + d(0.1));
      // Abrocha: la correa sube por el canto y la lengüeta se dobla sobre la tapa.
      tl.to(binder.strapPivot.rotation, { y: 0, duration: d(0.5), ease: "power2.inOut" }, start + d(1.15));
      tl.to(binder.strapTab.rotation, { y: 0, duration: d(0.38), ease: "back.out(1.4)" }, start + d(1.52));
    });
  }

  async function focus(id: EnvelopeId) {
    const part = byId.get(id);
    if (!part || disposed || stage === "closed" || stage === "extracted") return;
    stage = "focused";
    activeId = id;
    restingLayers();
    await play((tl) => {
      // Los sobres de enfrente ceden un poco; el elegido asoma de su bolsillo.
      parts.forEach((other) => other !== part && toSlot(tl, other, 0, d(0.5), other.index > part.index ? 0.08 : 0));
      const pose = focusPose(part.index);
      tl.to(part.group.position, { ...pose, duration: d(0.62), ease: "back.out(1.5)" }, d(0.04));
      tl.to(part.group.rotation, { x: FOCUS_TILT, y: 0, z: -0.012, duration: d(0.62), ease: "power2.out" }, d(0.04));
      tl.to(part.group.scale, { x: 1, y: 1, z: 1, duration: d(0.4) }, 0);
    });
  }

  /**
   * Dónde se presenta el sobre extraído: hacia el centro de lo que se ve y tan
   * cerca de la cámara como permite el encuadre sin recortarlo.
   */
  function extractedSpot() {
    const open = rigFor("open", aspect);
    const x = 0.2 + open.tx * 0.55;
    const z = presentDepth(open, aspect, ENVELOPE.width * EXTRACTED.scale, ENVELOPE.height * EXTRACTED.scale + 0.6, x - open.tx);
    // La carpeta está inclinada: compensar en Y lo que sube al acercarse en Z.
    const y = (0.35 + z * Math.sin(BINDER.tiltX)) / Math.cos(BINDER.tiltX);
    return { x, y, z };
  }

  async function extract(id: EnvelopeId) {
    const part = byId.get(id);
    if (!part || disposed || stage !== "focused") return;
    stage = "extracted";
    activeId = id;
    clearHover();
    part.setLayer(200);
    const slot = slotPose(part.index);
    await play((tl) => {
      parts.forEach((other) => other !== part && toSlot(tl, other, 0, d(0.45)));
      // 1) Sale del bolsillo hacia arriba. 2) Viene al frente, perpendicular a la carpeta.
      tl.to(part.group.position, { x: slot.x, y: slot.y + LIFT, z: slot.z + 0.05, duration: d(0.4), ease: "power2.in" }, 0);
      tl.to(part.group.rotation, { x: 0, z: 0, duration: d(0.4), ease: "power2.in" }, 0);
      tl.to(part.group.position, { ...extractedSpot(), duration: d(0.78), ease: "power3.out" }, d(0.4));
      tl.to(part.group.rotation, { x: EXTRACTED.rx, y: EXTRACTED.ry, z: EXTRACTED.rz, duration: d(0.85), ease: "power2.out" }, d(0.36));
      tl.to(part.group.scale, { x: EXTRACTED.scale, y: EXTRACTED.scale, z: EXTRACTED.scale, duration: d(0.78), ease: "power2.out" }, d(0.4));
    });
  }

  async function returnEnvelope(id: EnvelopeId) {
    const part = byId.get(id);
    if (!part || disposed || stage !== "extracted") return;
    stage = "focused";
    activeId = id;
    await play((tl) => {
      const end = slideBack(tl, part, 0, focusPose(part.index).y);
      tl.to(part.group.rotation, { x: FOCUS_TILT, z: -0.012, duration: d(0.3), ease: "power2.out" }, end - d(0.3));
    });
  }

  async function clearFocus() {
    if (disposed || stage !== "focused") return;
    stage = "open";
    activeId = null;
    restingLayers();
    await play((tl) => parts.forEach((part) => toSlot(tl, part, 0, d(0.5))));
  }

  // ── Puntero: hover, paralaje y toques ─────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { x: 0, y: 0, active: false };
  let hovered: EnvelopePart | null = null;
  let downAt: { x: number; y: number } | null = null;

  function pick(event: PointerEvent): { envelope?: EnvelopeId; binder: boolean } {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects([...envelopeTargets, ...binder.hitTargets], true)[0];
    const envelope = hit?.object.userData.envelopeId as EnvelopeId | undefined;
    return { envelope, binder: Boolean(hit) && !envelope };
  }

  function setHover(next: EnvelopePart | null) {
    if (next === hovered) return;
    ctx.add(() => {
      if (hovered) gsap.to(hovered.hover.position, { y: 0, duration: d(0.3), ease: "power2.out" });
      if (next) gsap.to(next.hover.position, { y: 0.07, duration: d(0.3), ease: "power2.out" });
    });
    hovered = next;
    shadowsDirtyUntil = performance.now() + 400;
  }
  function clearHover() {
    setHover(null);
    renderer.domElement.style.cursor = "";
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    pointer.active = true;
    const hit = pick(event);
    const canPickEnvelope = stage === "open" || stage === "focused";
    setHover(canPickEnvelope && hit.envelope && hit.envelope !== activeId ? (byId.get(hit.envelope) ?? null) : null);
    const interactive = stage === "closed" ? hit.binder || Boolean(hit.envelope) : stage === "extracted" ? hit.envelope === activeId : Boolean(hit.envelope);
    renderer.domElement.style.cursor = interactive ? "pointer" : "";
  }
  function onPointerLeave() {
    pointer.active = false;
    clearHover();
  }
  function onPointerDown(event: PointerEvent) {
    downAt = { x: event.clientX, y: event.clientY };
  }
  function onPointerUp(event: PointerEvent) {
    if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > TAP_SLOP) return;
    downAt = null;
    const hit = pick(event);
    if (hit.envelope) intentListener?.({ type: "envelope", id: hit.envelope });
    else if (hit.binder) intentListener?.({ type: "binder" });
  }
  const canvas = renderer.domElement;
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);

  // ── Tamaño y visibilidad ──────────────────────────────────────────────────
  function snapFraming() {
    reframePending = false;
    Object.assign(rig, rigFor(framing(), aspect));
  }
  function resize() {
    if (disposed) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    if (!width || !height) return;
    aspect = width / height;
    camera.aspect = aspect;
    camera.fov = fovFor(aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (running) reframePending = true;
    else snapFraming();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  resize();
  const intersectionObserver = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
  });
  intersectionObserver.observe(mount);

  // ── Bucle de render ───────────────────────────────────────────────────────
  // Sombras: se recalculan mientras algo se mueve y, en reposo, cada pocos cuadros.
  renderer.shadowMap.autoUpdate = false;
  let frame = 0;
  let tick = 0;
  const loop = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    if (!reducedMotion) {
      const tx = pointer.active ? pointer.x * 0.045 : 0;
      const ty = pointer.active ? pointer.y * 0.03 : 0;
      root.rotation.y += (tx + Math.sin(now * 0.00035) * 0.012 - root.rotation.y) * 0.06;
      root.rotation.x += (ty - root.rotation.x) * 0.06;
      root.position.y = Math.sin(now * 0.0006) * 0.025;
    }
    applyCamera();
    if (now < shadowsDirtyUntil || tick++ % 8 === 0) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  return {
    open,
    close,
    focus,
    extract,
    returnEnvelope,
    clearFocus,
    onIntent: (callback) => {
      intentListener = callback;
    },
    dispose: () => {
      disposed = true;
      intentListener = null;
      ctx.kill();
      running = null;
      settle?.();
      settle = null;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      const geometrySet = new Set<THREE.BufferGeometry>();
      const materialSet = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object instanceof THREE.InstancedMesh) object.dispose();
        geometrySet.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => materialSet.add(m));
      });
      geometrySet.forEach((g) => g.dispose());
      materialSet.forEach((m) => m.dispose());
      kit.dispose();
      disposeStage();
    },
  };
}
