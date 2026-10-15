import * as THREE from "three";
import { gsap } from "gsap";
import { envelopesMock, type EnvelopeId } from "../mocks/envelopes.mock";
import { createBinder } from "./binder";
import { createEnvelope, createEnvelopeGeometries, type EnvelopePart } from "./envelope";
import { fovFor, presentDepth, rigFor, subFov, type CameraRig, type Viewport } from "./framing";
import { BINDER, ENVELOPE, focusPose, slotPose, type SlotPose } from "./layout";
import { createMaterialKit } from "./materials";
import { createStage } from "./stage";

/** Lo que el usuario tocó en el lienzo; React decide qué acción corresponde. */
export type SceneIntent = { type: "binder" } | { type: "envelope"; id: EnvelopeId };

/** Márgenes (px) del lienzo que tapa la interfaz: la carpeta se encuadra en el resto. */
export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface OrganizerSceneApi {
  open: () => Promise<void>;
  close: () => Promise<void>;
  focus: (id: EnvelopeId) => Promise<void>;
  extract: (id: EnvelopeId) => Promise<void>;
  returnEnvelope: (id: EnvelopeId) => Promise<void>;
  /** Regresa el sobre enfocado a su bolsillo (carpeta abierta, sin selección). */
  clearFocus: () => Promise<void>;
  setSafeArea: (area: SafeArea) => void;
  onIntent: (callback: ((intent: SceneIntent) => void) | null) => void;
  dispose: () => void;
}

type SceneStage = "closed" | "open" | "focused" | "extracted";

/** Dirección desde la que mira la cámara: casi de frente, un poco desde arriba. */
const VIEW_DIR = new THREE.Vector3(0, 0.08, 1).normalize();
const STRAP_OPEN = Math.PI / 2 + 0.14;
const STRAP_TAB_OPEN = Math.PI / 2 - 0.08;
/** Cuánto sube el sobre para salir del bolsillo antes de venir al frente. */
const LIFT = 1.2;
/** Pose de presentación del sobre extraído: compensa la inclinación de la carpeta para mirar a cámara. */
const EXTRACTED = { rx: -BINDER.tilt.x * 0.88, ry: -BINDER.tilt.y * 0.7 - 0.06, rz: -BINDER.tilt.z * 0.8, scale: 1.06 };
/** Distancia (px) por debajo de la cual un pointerup cuenta como toque y no como scroll. */
const TAP_SLOP = 10;

export function createOrganizerScene(mount: HTMLElement): OrganizerSceneApi {
  const { renderer, scene, camera, dispose: disposeStage } = createStage(mount);
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const kit = createMaterialKit(maxAnisotropy);

  // root: flotación y paralaje · tilt: la carpeta "sobre la mesa", en 3/4.
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.set(BINDER.tilt.x, BINDER.tilt.y, BINDER.tilt.z, "YXZ");
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
  let intentListener: ((intent: SceneIntent) => void) | null = null;

  // ── Cámara y zona libre ───────────────────────────────────────────────────
  const canvasSize = { width: 1, height: 1 };
  let safe: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };
  function freeRect() {
    const { width, height } = canvasSize;
    return { width: Math.max(1, width - safe.left - safe.right), height: Math.max(1, height - safe.top - safe.bottom) };
  }
  function viewport(): Viewport {
    const free = freeRect();
    return { aspect: free.width / free.height, fov: subFov(fovFor(canvasSize.width / canvasSize.height), free.height / canvasSize.height) };
  }
  function applyProjection() {
    const { width, height } = canvasSize;
    const free = freeRect();
    camera.aspect = width / height;
    camera.fov = fovFor(width / height);
    // Desplaza el centro óptico al centro de la zona libre.
    camera.setViewOffset(width, height, width / 2 - (safe.left + free.width / 2), height / 2 - (safe.top + free.height / 2), width, height);
    camera.updateProjectionMatrix();
  }
  const rig: CameraRig = rigFor("closed", viewport());
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

  function restingLayers() {
    parts.forEach((part) => part.setLayer(10 + part.index * 5));
  }

  function toPose(tl: gsap.core.Timeline, part: EnvelopePart, pose: SlotPose, at: number, duration: number, ease = "power3.out") {
    tl.to(part.group.position, { x: pose.x, y: pose.y, z: pose.z, duration, ease }, at);
    tl.to(part.group.rotation, { x: pose.rx, y: 0, z: 0, duration, ease }, at);
    tl.to(part.group.scale, { x: 1, y: 1, z: 1, duration, ease }, at);
  }

  /** Lleva un sobre a su bolsillo (o un poco abajo si `yieldBy` > 0, para "ceder" espacio). */
  function toSlot(tl: gsap.core.Timeline, part: EnvelopePart, at: number, duration: number, fanned: boolean, yieldBy = 0, ease?: string) {
    const slot = slotPose(part.index, fanned);
    toPose(tl, part, { ...slot, y: slot.y - yieldBy }, at, duration, ease);
  }

  /** Arriba de su bolsillo, en su mismo plano. */
  function abovePocket(index: number): SlotPose {
    const slot = slotPose(index, true);
    return { ...slot, y: slot.y + LIFT * Math.cos(slot.rx), z: slot.z + LIFT * Math.sin(slot.rx) + 0.05 };
  }

  /** Camino de regreso: sube sobre su bolsillo, se endereza y entra deslizando. Devuelve cuándo termina. */
  function slideBack(tl: gsap.core.Timeline, part: EnvelopePart, at: number, end: SlotPose): number {
    const travel = d(0.6);
    toPose(tl, part, abovePocket(part.index), at, travel, "power2.inOut");
    tl.call(() => restingLayers(), [], at + travel);
    tl.to(part.group.position, { y: end.y, z: end.z, duration: d(0.45), ease: "power2.out" }, at + travel);
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
      tl.to(rig, { ...rigFor("open", viewport()), duration: d(1.5), ease: "power2.inOut" }, d(0.3));
      // Libres de la tapa, los sobres se levantan en abanico, en cascada.
      parts.forEach((part) => toSlot(tl, part, d(1.0) + part.index * d(0.06), d(0.7), true, 0, "back.out(1.5)"));
    });
  }

  async function close() {
    if (disposed || stage === "closed") return;
    const extracted = stage === "extracted" && activeId ? byId.get(activeId) : undefined;
    stage = "closed";
    activeId = null;
    clearHover();
    await play((tl) => {
      const start = extracted ? slideBack(tl, extracted, 0, slotPose(extracted.index, true)) : 0;
      tl.call(() => restingLayers(), [], start);
      // Los sobres se acuestan antes de que baje la tapa.
      parts.forEach((part) => toSlot(tl, part, start + (parts.length - 1 - part.index) * d(0.04), d(0.5), false, 0, "power2.inOut"));
      const cover = start + d(0.35);
      tl.to(binder.coverPivot.rotation, { y: 0, duration: d(1.15), ease: "power3.inOut" }, cover);
      tl.to(binder.coverShadow, { opacity: 0, duration: d(0.6) }, cover + d(0.05));
      tl.to(rig, { ...rigFor("closed", viewport()), duration: d(1.3), ease: "power2.inOut" }, cover);
      // Abrocha: la correa sube por el canto y la lengüeta se dobla sobre la tapa.
      tl.to(binder.strapPivot.rotation, { y: 0, duration: d(0.5), ease: "power2.inOut" }, cover + d(1.0));
      tl.to(binder.strapTab.rotation, { y: 0, duration: d(0.38), ease: "back.out(1.4)" }, cover + d(1.37));
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
      parts.forEach((other) => other !== part && toSlot(tl, other, 0, d(0.5), true, other.index > part.index ? 0.06 : 0));
      toPose(tl, part, focusPose(part.index), d(0.04), d(0.62), "back.out(1.5)");
    });
  }

  /**
   * Dónde se presenta el sobre extraído: hacia el centro de lo que se ve y tan
   * cerca de la cámara como permite el encuadre sin recortarlo.
   */
  function extractedSpot() {
    const vp = viewport();
    const open = rigFor("open", vp);
    const x = 0.25 + open.tx * 0.5;
    const z = presentDepth(open, vp, ENVELOPE.width * EXTRACTED.scale + 0.5, ENVELOPE.height * EXTRACTED.scale + 0.7, x - open.tx);
    // La carpeta está inclinada: compensar en Y lo que sube al acercarse en Z.
    const y = (0.25 + z * Math.sin(BINDER.tilt.x)) / Math.cos(BINDER.tilt.x);
    return { x, y, z };
  }

  async function extract(id: EnvelopeId) {
    const part = byId.get(id);
    if (!part || disposed || stage !== "focused") return;
    stage = "extracted";
    activeId = id;
    clearHover();
    part.setLayer(200);
    await play((tl) => {
      parts.forEach((other) => other !== part && toSlot(tl, other, 0, d(0.45), true));
      // 1) Sale del bolsillo hacia arriba. 2) Viene al frente, mirando a la cámara.
      toPose(tl, part, abovePocket(part.index), 0, d(0.4), "power2.in");
      tl.to(part.group.position, { ...extractedSpot(), duration: d(0.8), ease: "power3.out" }, d(0.4));
      tl.to(part.group.rotation, { x: EXTRACTED.rx, y: EXTRACTED.ry, z: EXTRACTED.rz, duration: d(0.85), ease: "power2.out" }, d(0.36));
      tl.to(part.group.scale, { x: EXTRACTED.scale, y: EXTRACTED.scale, z: EXTRACTED.scale, duration: d(0.8), ease: "power2.out" }, d(0.4));
    });
  }

  async function returnEnvelope(id: EnvelopeId) {
    const part = byId.get(id);
    if (!part || disposed || stage !== "extracted") return;
    stage = "focused";
    activeId = id;
    await play((tl) => {
      slideBack(tl, part, 0, focusPose(part.index));
    });
  }

  async function clearFocus() {
    if (disposed || stage !== "focused") return;
    stage = "open";
    activeId = null;
    restingLayers();
    await play((tl) => parts.forEach((part) => toSlot(tl, part, 0, d(0.5), true)));
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
      if (next) gsap.to(next.hover.position, { y: 0.08, duration: d(0.3), ease: "power2.out" });
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
    Object.assign(rig, rigFor(framing(), viewport()));
  }
  function reframe() {
    applyProjection();
    if (running) reframePending = true;
    else snapFraming();
  }
  function resize() {
    if (disposed) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    if (!width || !height) return;
    canvasSize.width = width;
    canvasSize.height = height;
    renderer.setSize(width, height, false);
    reframe();
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
      const tx = pointer.active ? pointer.x * 0.04 : 0;
      const ty = pointer.active ? pointer.y * 0.025 : 0;
      root.rotation.y += (tx + Math.sin(now * 0.00035) * 0.01 - root.rotation.y) * 0.06;
      root.rotation.x += (ty - root.rotation.x) * 0.06;
      root.position.y = Math.sin(now * 0.0006) * 0.02;
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
    setSafeArea: (area) => {
      const same = area.top === safe.top && area.right === safe.right && area.bottom === safe.bottom && area.left === safe.left;
      if (same || disposed) return;
      safe = area;
      reframe();
    },
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
