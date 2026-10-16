import * as THREE from "three";
import { gsap } from "gsap";
import { envelopesMock, type EnvelopeId } from "../mocks/envelopes.mock";
import { createBinder } from "./binder";
import { createEnvelope, createEnvelopeGeometries, type EnvelopePart } from "./envelope";
import { fovFor, presentDepth, rigFor, subFov, type CameraRig, type Viewport } from "./framing";
import type { EnvelopeDocument } from "../domain/document";
import { createCaptionTag, type CaptionTag } from "./captionTag";
import { createDocumentStack, type DocumentStack } from "./documents";
import { BINDER, DOCUMENT, ENVELOPE, fanPose, focusPose, insidePose, slotPose, type DocumentPose, type SlotPose } from "./layout";
import { createMaterialKit } from "./materials";
import { createStage } from "./stage";

/** Lo que el usuario tocó en el lienzo; React decide qué acción corresponde. */
export type SceneIntent = { type: "binder" } | { type: "envelope"; id: EnvelopeId } | { type: "document"; id: string };

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
  /** Abre el sobre extraído con sus documentos (solo lectura); `visibleIds` = los que pasan el filtro, en orden. */
  openEnvelope: (documents: readonly EnvelopeDocument[], visibleIds: readonly string[], caption: string) => Promise<void>;
  closeEnvelope: () => Promise<void>;
  /** Reacomoda el abanico al cambiar el filtro (el último llamado gana). */
  showDocuments: (visibleIds: readonly string[], caption: string) => void;
  pickDocument: (id: string) => Promise<void>;
  returnDocument: () => Promise<void>;
  setSafeArea: (area: SafeArea) => void;
  onIntent: (callback: ((intent: SceneIntent) => void) | null) => void;
  dispose: () => void;
}

type SceneStage = "closed" | "open" | "focused" | "extracted" | "browsing" | "reading";

/** Dirección desde la que mira la cámara: casi de frente, un poco desde arriba. */
const VIEW_DIR = new THREE.Vector3(0, 0.08, 1).normalize();
const STRAP_OPEN = Math.PI / 2 + 0.14;
const STRAP_TAB_OPEN = Math.PI / 2 - 0.08;
/** Cuánto sube el sobre para salir del bolsillo antes de venir al frente. */
const LIFT = 1.2;
/** Pose de presentación del sobre extraído: compensa la inclinación de la carpeta para mirar a cámara. */
const EXTRACTED = { rx: -BINDER.tilt.x * 0.88, ry: -BINDER.tilt.y * 0.7 - 0.06, rz: -BINDER.tilt.z * 0.8, scale: 1.06 };
/** Z mínima del sobre presentado: por delante del sobre más cercano en abanico. */
const MIN_PRESENT_Z = 1.6;
/** Cuánto se inclina el labio del sobre al abrirlo. */
const MOUTH_OPEN = 0.85;
/** Documento fuera del sobre: al frente y un poco más grande (coordenadas del sobre). */
const READING = { x: 0, y: 0.95, z: 0.7, scale: 1.22 };
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
    const out = stage === "extracted" || stage === "browsing" || stage === "reading";
    const extracted = out && activeId ? byId.get(activeId) : undefined;
    const hadDocuments = Boolean(stack);
    stage = "closed";
    activeId = null;
    clearHover();
    fanTimeline?.kill();
    await play((tl) => {
      // Si el sobre estaba abierto: guarda los documentos y cierra la boca primero.
      const stowed = extracted && hadDocuments ? stowDocuments(tl, extracted, 0) : 0;
      const start = extracted ? slideBack(tl, extracted, stowed, slotPose(extracted.index, true)) : 0;
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
  function extractedSpot(withDocuments = false) {
    const vp = viewport();
    const open = rigFor("open", vp);
    const x = 0.25 + open.tx * 0.5;
    // Abierto, deja lugar arriba para los documentos que asoman.
    const extraHeight = withDocuments ? DOCUMENT.rise + DOCUMENT.height * 0.5 + 0.9 : 0.7;
    // Siempre por delante de la pila de sobres; si a esa distancia no cabe (móvil), se achica.
    let scale = EXTRACTED.scale;
    let z = 0;
    for (; scale > 0.55; scale -= 0.05) {
      z = presentDepth(open, vp, ENVELOPE.width * scale + 0.5, (ENVELOPE.height + extraHeight) * scale, x - open.tx);
      if (z >= MIN_PRESENT_Z) break;
    }
    z = Math.max(z, MIN_PRESENT_Z);
    // La carpeta está inclinada: compensar en Y lo que sube al acercarse en Z.
    const worldY = withDocuments ? -0.45 : 0.25;
    const y = (worldY + z * Math.sin(BINDER.tilt.x)) / Math.cos(BINDER.tilt.x);
    return { x, y, z, scale };
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
      const spot = extractedSpot();
      tl.to(part.group.position, { x: spot.x, y: spot.y, z: spot.z, duration: d(0.8), ease: "power3.out" }, d(0.4));
      tl.to(part.group.rotation, { x: EXTRACTED.rx, y: EXTRACTED.ry, z: EXTRACTED.rz, duration: d(0.85), ease: "power2.out" }, d(0.36));
      tl.to(part.group.scale, { x: spot.scale, y: spot.scale, z: spot.scale, duration: d(0.8), ease: "power2.out" }, d(0.4));
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

  // ── Documentos del sobre abierto ──────────────────────────────────────────
  let stack: DocumentStack | null = null;
  let shown: string[] = [];
  let pickedId: string | null = null;
  let fanTimeline: gsap.core.Timeline | null = null;
  let caption: CaptionTag | null = null;
  let writing: gsap.core.Tween | null = null;

  /** Caligrafía de la app (Caveat): la variable la pone la interfaz en un ancestro del lienzo. */
  const handwritingFont = () => getComputedStyle(mount).getPropertyValue("--font-caveat").trim() || "cursive";

  /** Escribe la frase letra por letra en la etiqueta (completa con reduce-motion). */
  function writeCaption(text: string) {
    if (!caption) return;
    writing?.kill();
    const total = Array.from(text).length;
    if (reducedMotion) {
      caption.draw(text, total);
      return;
    }
    const tag = caption;
    const progress = { chars: 0 };
    tag.draw(text, 0);
    ctx.add(() => {
      writing = gsap.to(progress, {
        chars: total,
        duration: Math.min(1.2, total * 0.045),
        ease: "none",
        onUpdate: () => tag.draw(text, Math.floor(progress.chars)),
        onComplete: () => tag.draw(text, total),
      });
    });
  }

  function toDocPose(tl: gsap.core.Timeline, mesh: THREE.Object3D, pose: DocumentPose, at: number, duration: number, ease = "power3.out", scale = 1) {
    tl.to(mesh.position, { x: pose.x, y: pose.y, z: pose.z, duration, ease }, at);
    tl.to(mesh.rotation, { z: pose.rz, duration, ease }, at);
    tl.to(mesh.scale, { x: scale, y: scale, z: scale, duration, ease }, at);
  }

  /** Los que van en el abanico (pasan el filtro, hasta `maxFan`). */
  const fanIds = () => shown.filter((id) => stack?.items.has(id)).slice(0, DOCUMENT.maxFan);

  /** Abanico con los visibles; el resto, guardado. Respeta el documento que está fuera. */
  function arrange(tl: gsap.core.Timeline, at: number, stagger: number) {
    if (!stack) return;
    const fan = fanIds();
    let order = 0;
    stack.items.forEach((item, id) => {
      if (id === pickedId) return;
      const index = fan.indexOf(id);
      if (index >= 0) toDocPose(tl, item.mesh, fanPose(index, fan.length), at + index * stagger, d(0.5), "back.out(1.3)");
      else toDocPose(tl, item.mesh, insidePose(order++), at, d(0.35), "power2.in");
    });
  }

  function disposeStack() {
    fanTimeline?.kill();
    fanTimeline = null;
    writing?.kill();
    writing = null;
    caption?.dispose();
    caption = null;
    stack?.dispose();
    stack = null;
    pickedId = null;
  }

  async function openEnvelope(documents: readonly EnvelopeDocument[], visibleIds: readonly string[], phrase: string) {
    const part = activeId ? byId.get(activeId) : undefined;
    if (!part || disposed || stage !== "extracted") return;
    stage = "browsing";
    disposeStack();
    stack = createDocumentStack(documents, maxAnisotropy);
    part.hover.add(stack.group);
    shown = [...visibleIds];
    // Etiqueta de papel sobre el frente del sobre, un poco ladeada.
    caption = createCaptionTag(handwritingFont(), maxAnisotropy);
    caption.mesh.position.set(-0.62, -0.6, 0.075);
    caption.mesh.rotation.z = 0.05;
    caption.mesh.renderOrder = 260;
    caption.mesh.scale.setScalar(0.001);
    caption.draw(phrase, 0);
    part.hover.add(caption.mesh);
    const tag = caption.mesh;
    await play((tl) => {
      // Baja un poco para dejar sitio, abre la boca y los documentos asoman en cascada.
      const spot = extractedSpot(true);
      tl.to(part.group.position, { x: spot.x, y: spot.y, z: spot.z, duration: d(0.55), ease: "power2.inOut" }, 0);
      tl.to(part.group.scale, { x: spot.scale, y: spot.scale, z: spot.scale, duration: d(0.55), ease: "power2.inOut" }, 0);
      tl.to(part.mouth.rotation, { x: MOUTH_OPEN, duration: d(0.4), ease: "back.out(1.6)" }, d(0.3));
      arrange(tl, d(0.55), d(0.05));
      tl.to(tag.scale, { x: 1, y: 1, z: 1, duration: d(0.35), ease: "back.out(1.8)" }, d(0.6));
      tl.call(() => writeCaption(phrase), [], d(0.8));
    });
  }

  /** Guarda todos los documentos y cierra la boca; libera los documentos al final. Devuelve cuándo termina. */
  function stowDocuments(tl: gsap.core.Timeline, part: EnvelopePart, at: number): number {
    let order = 0;
    stack?.items.forEach((item) => toDocPose(tl, item.mesh, insidePose(order++), at, d(0.35), "power2.in"));
    tl.to(part.mouth.rotation, { x: 0, duration: d(0.3), ease: "power2.inOut" }, at + d(0.3));
    tl.call(() => disposeStack(), [], at + d(0.6));
    return at + d(0.6);
  }

  async function closeEnvelope() {
    const part = activeId ? byId.get(activeId) : undefined;
    if (!part || disposed || stage !== "browsing") return;
    stage = "extracted";
    fanTimeline?.kill();
    await play((tl) => {
      const end = stowDocuments(tl, part, 0);
      const spot = extractedSpot(false);
      tl.to(part.group.position, { x: spot.x, y: spot.y, z: spot.z, duration: d(0.5), ease: "power2.inOut" }, end - d(0.05));
      tl.to(part.group.scale, { x: spot.scale, y: spot.scale, z: spot.scale, duration: d(0.5), ease: "power2.inOut" }, end - d(0.05));
    });
  }

  function showDocuments(visibleIds: readonly string[], phrase: string) {
    shown = [...visibleIds];
    writeCaption(phrase);
    if (!stack || disposed || (stage !== "browsing" && stage !== "reading") || running) return;
    fanTimeline?.kill();
    ctx.add(() => {
      const tl = gsap.timeline();
      arrange(tl, 0, d(0.03));
      fanTimeline = tl;
      shadowsDirtyUntil = performance.now() + tl.duration() * 1000 + 200;
    });
  }

  async function pickDocument(id: string) {
    const item = stack?.items.get(id);
    if (!item || disposed || (stage !== "browsing" && stage !== "reading")) return;
    const previous = pickedId;
    stage = "reading";
    pickedId = id;
    fanTimeline?.kill();
    await play((tl) => {
      // El que estaba fuera vuelve a su lugar.
      const prev = previous && previous !== id ? stack?.items.get(previous) : undefined;
      if (prev) {
        const fan = fanIds();
        const index = fan.indexOf(prev.doc.id);
        toDocPose(tl, prev.mesh, index >= 0 ? fanPose(index, fan.length) : insidePose(), 0, d(0.45));
      }
      // Sale hacia arriba, luego al frente y derecho.
      tl.to(item.mesh.position, { y: DOCUMENT.insideY + DOCUMENT.rise + 0.45, duration: d(0.25), ease: "power2.in" }, 0);
      toDocPose(tl, item.mesh, { x: READING.x, y: READING.y, z: READING.z, rz: 0 }, d(0.25), d(0.55), "power3.out", READING.scale);
    });
  }

  async function returnDocument() {
    if (!stack || !pickedId || disposed || stage !== "reading") return;
    stage = "browsing";
    pickedId = null;
    await play((tl) => arrange(tl, 0, 0));
  }

  // ── Puntero: hover, paralaje y toques ─────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { x: 0, y: 0, active: false };
  let hovered: EnvelopePart | null = null;
  let downAt: { x: number; y: number } | null = null;

  function pick(event: PointerEvent): { envelope?: EnvelopeId; document?: string; binder: boolean } {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects([...envelopeTargets, ...binder.hitTargets], true)[0];
    const documentId = hit?.object.userData.documentId as string | undefined;
    const envelope = documentId ? undefined : (hit?.object.userData.envelopeId as EnvelopeId | undefined);
    return { envelope, document: documentId, binder: Boolean(hit) && !envelope && !documentId };
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
    const interactive =
      stage === "closed"
        ? hit.binder || Boolean(hit.envelope)
        : stage === "extracted"
          ? hit.envelope === activeId
          : stage === "browsing" || stage === "reading"
            ? Boolean(hit.document)
            : Boolean(hit.envelope);
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
    if (hit.document) intentListener?.({ type: "document", id: hit.document });
    else if (hit.envelope) intentListener?.({ type: "envelope", id: hit.envelope });
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
    openEnvelope,
    closeEnvelope,
    showDocuments,
    pickDocument,
    returnDocument,
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
      disposeStack();
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
