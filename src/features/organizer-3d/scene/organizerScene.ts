import * as THREE from "three";
import { gsap } from "gsap";
import { envelopesMock, type EnvelopeId, type EnvelopeItem } from "../mocks/envelopes.mock";
import { createBinder } from "./binder";
import { createEnvelope, createEnvelopeGeometries, type EnvelopePart } from "./envelope";
import { fovFor, presentDepth, rigFor, subFov, type CameraRig, type Viewport } from "./framing";
import type { EnvelopeDocument } from "../domain/document";
import { classifyGesture, TAP_SLOP, type SwipeDirection } from "../domain/gestures";
import { createCaptionTag, type CaptionTag } from "./captionTag";
import { createDocumentStack, type DocumentStack } from "./documents";
import { createMoneyTokens, type MoneyTokens } from "./moneyTokens";
import { BINDER, DOCUMENT, ENVELOPE, fanPose, FOCUS_LIFT, focusPose, insidePose, POCKET_CLEARANCE, slotPose, type DocumentPose, type SlotPose } from "./layout";
import { createMaterialKit } from "./materials";
import { createStage } from "./stage";

/** Lo que el usuario tocó en el lienzo; React decide qué acción corresponde. */
export type SceneIntent =
  | { type: "binder" }
  | { type: "envelope"; id: EnvelopeId }
  | { type: "document"; id: string }
  /** Deslizamiento (dedo o mouse); `envelope`/`document`: dónde empezó. */
  | { type: "swipe"; direction: SwipeDirection; envelope?: EnvelopeId; document?: string };

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
  /** Fichas de dinero viajan de un sobre a otro (solo animación; los montos los cambia la interfaz). Con la carpeta abierta. */
  transfer: (from: EnvelopeId, to: EnvelopeId) => Promise<void>;
  /** Aplica nombre, color e icono a un sobre (vista previa en vivo y guardado). */
  restyleEnvelope: (item: EnvelopeItem) => void;
  setSafeArea: (area: SafeArea) => void;
  onIntent: (callback: ((intent: SceneIntent) => void) | null) => void;
  dispose: () => void;
}

type SceneStage = "closed" | "open" | "focused" | "extracted" | "browsing" | "reading";

/** Dirección desde la que mira la cámara: casi de frente, un poco desde arriba. */
const VIEW_DIR = new THREE.Vector3(0, 0.08, 1).normalize();
const STRAP_OPEN = Math.PI / 2 + 0.14;
const STRAP_TAB_OPEN = Math.PI / 2 - 0.08;
/** Cuánto sube el sobre para salir del bolsillo antes de venir al frente (libra a los de enfrente). */
const LIFT = POCKET_CLEARANCE;
/** Pose de presentación del sobre extraído: compensa la inclinación de la carpeta para mirar a cámara. */
const EXTRACTED = { rx: -BINDER.tilt.x * 0.88, ry: -BINDER.tilt.y * 0.7 - 0.06, rz: -BINDER.tilt.z * 0.8, scale: 1.06 };
/** Z mínima del sobre presentado: por delante del sobre más cercano en abanico. */
const MIN_PRESENT_Z = 1.6;
/** Tras cuánto tiempo sin interacción (ms) la escena deja de dibujarse hasta que algo cambie. */
const IDLE_MS = 6000;
/** Cuadros (ms) por encima de los cuales se baja la resolución del render (~40 fps). */
const SLOW_FRAME_MS = 25;
/** Cuánto se abren las mitades de cada anilla (rad). */
const RINGS_OPEN = 0.42;
/** Cuánto suben los sobres de atrás al enfocar uno: lo mismo que el enfocado, así su etiqueta queda igual de visible que en reposo. */
const BEHIND_RISE = FOCUS_LIFT + 0.02;
/** Cuánto se inclina el labio del sobre al abrirlo. */
const MOUTH_OPEN = 0.85;
/** Documento fuera del sobre: al frente y un poco más grande (coordenadas del sobre). */
const READING = { x: 0, y: 0.95, z: 0.7, scale: 1.22 };

export function createOrganizerScene(mount: HTMLElement): OrganizerSceneApi {
  const { renderer, scene, camera, dispose: disposeStage } = createStage(mount);
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  // Dibujar solo cuando algo cambia (ver "Bucle de render"); cargar texturas o fuentes también despierta.
  let awakeUntil = performance.now() + IDLE_MS;
  const wake = (ms = IDLE_MS) => {
    awakeUntil = Math.max(awakeUntil, performance.now() + ms);
  };
  const loading = new THREE.LoadingManager(() => wake(500));
  loading.onProgress = () => wake(500);
  void document.fonts?.ready.then(() => wake(500));
  const kit = createMaterialKit(maxAnisotropy, loading);

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
  /** Algo se mueve durante `ms`: sombras al día y escena despierta. */
  function markDirty(ms: number) {
    shadowsDirtyUntil = Math.max(shadowsDirtyUntil, performance.now() + ms);
    wake(ms + 300);
  }

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
        markDirty(tl.duration() * 1000 + 200);
      });
    });
  }

  function restingLayers() {
    parts.forEach((part) => part.setLayer(10 + part.index * 5));
  }

  /** Abre o cierra las anillas (las mitades giran sobre su bisagra junto a la placa). */
  function ringsTo(tl: gsap.core.Timeline, open: boolean, at: number, duration = d(0.28)) {
    const angle = open ? RINGS_OPEN : 0;
    tl.to(binder.ringHalves.right.map((half) => half.rotation), { z: -angle, duration, ease: open ? "back.out(1.6)" : "power2.in", stagger: d(0.02) }, at);
    tl.to(binder.ringHalves.left.map((half) => half.rotation), { z: angle, duration, ease: open ? "back.out(1.6)" : "power2.in", stagger: d(0.02) }, at);
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

  /** Al enfocar `part`: los sobres de atrás suben y los de enfrente bajan un poco. */
  function makeRoomFor(tl: gsap.core.Timeline, part: EnvelopePart, at: number) {
    parts.forEach((other) => other !== part && toSlot(tl, other, at, d(0.5), true, other.index > part.index ? 0.06 : -BEHIND_RISE));
  }

  /** Arriba de su bolsillo, en su mismo plano. */
  function abovePocket(index: number): SlotPose {
    const slot = slotPose(index, true);
    return { ...slot, y: slot.y + LIFT * Math.cos(slot.rx), z: slot.z + LIFT * Math.sin(slot.rx) + 0.05 };
  }

  /**
   * Camino de regreso sin atravesar a nadie: 1) sube a la altura de salida
   * donde está, 2) retrocede hasta quedar sobre su bolsillo, 3) baja en su
   * plano. Devuelve cuándo termina.
   */
  function slideBack(tl: gsap.core.Timeline, part: EnvelopePart, at: number, end: SlotPose): number {
    const above = abovePocket(part.index);
    const rise = d(0.3);
    const back = d(0.55);
    const down = d(0.45);
    tl.to(part.group.position, { y: Math.max(above.y, part.group.position.y), duration: rise, ease: "power2.out" }, at);
    tl.to(part.group.position, { x: above.x, z: above.z, duration: back, ease: "power2.inOut" }, at + rise * 0.6);
    tl.to(part.group.position, { y: above.y, duration: back, ease: "power2.inOut" }, at + rise);
    tl.to(part.group.rotation, { x: above.rx, y: 0, z: 0, duration: back, ease: "power2.inOut" }, at + rise * 0.6);
    tl.to(part.group.scale, { x: 1, y: 1, z: 1, duration: back, ease: "power2.inOut" }, at + rise * 0.6);
    const settle = at + rise * 0.6 + back;
    ringsTo(tl, true, at + rise * 0.6 + back * 0.4);
    tl.call(() => restingLayers(), [], settle);
    tl.to(part.group.position, { y: end.y, z: end.z, duration: down, ease: "power2.out" }, settle);
    ringsTo(tl, false, settle + down * 0.6);
    return settle + down;
  }

  async function open() {
    if (disposed || stage !== "closed") return;
    stage = "open";
    await play((tl) => {
      // Desabrocha: la lengüeta se despega y la correa cae hacia la derecha.
      tl.to(binder.strapTab.rotation, { y: STRAP_TAB_OPEN, duration: d(0.42), ease: "power2.inOut" }, 0);
      tl.to(binder.strapPivot.rotation, { y: STRAP_OPEN, duration: d(0.62), ease: "power2.inOut" }, d(0.1));
      // La tapa "salta" un poco al soltarse el broche y luego abre con peso.
      // (Si el dedo ya la abrió un poco, sigue desde ahí.)
      tl.to(binder.coverPivot.rotation, { y: Math.min(binder.coverPivot.rotation.y, -0.12), duration: d(0.22), ease: "power1.out" }, d(0.3));
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
      // Los de atrás suben (su etiqueta sigue visible) y los de enfrente ceden un poco.
      makeRoomFor(tl, part, 0);
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
      // 1) Sale del bolsillo hacia arriba, en su plano, hasta librar a los de enfrente.
      // 2) Viene al frente a esa altura. 3) Ya delante de todos, baja a su lugar mirando a la cámara.
      ringsTo(tl, true, 0);
      toPose(tl, part, abovePocket(part.index), 0, d(0.45), "power2.inOut");
      ringsTo(tl, false, d(0.95));
      const spot = extractedSpot();
      tl.to(part.group.position, { x: spot.x, z: spot.z, duration: d(0.6), ease: "power2.out" }, d(0.42));
      tl.to(part.group.position, { y: spot.y, duration: d(0.6), ease: "power3.out" }, d(0.72));
      tl.to(part.group.rotation, { x: EXTRACTED.rx, y: EXTRACTED.ry, z: EXTRACTED.rz, duration: d(0.8), ease: "power2.out" }, d(0.5));
      tl.to(part.group.scale, { x: spot.scale, y: spot.scale, z: spot.scale, duration: d(0.8), ease: "power2.out" }, d(0.5));
    });
  }

  async function returnEnvelope(id: EnvelopeId) {
    const part = byId.get(id);
    if (!part || disposed || stage !== "extracted") return;
    stage = "focused";
    activeId = id;
    await play((tl) => {
      const end = slideBack(tl, part, 0, focusPose(part.index));
      makeRoomFor(tl, part, end - d(0.5));
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
    wake(2000);
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
    tl.call(() => {
      mesh.visible = true;
    }, [], at);
    tl.to(mesh.position, { x: pose.x, y: pose.y, z: pose.z, duration, ease }, at);
    tl.to(mesh.rotation, { z: pose.rz, duration, ease }, at);
    tl.to(mesh.scale, { x: scale, y: scale, z: scale, duration, ease }, at);
  }

  /** Los que van en el abanico (pasan el filtro, hasta `maxFan`). */
  const fanIds = () => shown.filter((id) => stack?.items.has(id)).slice(0, DOCUMENT.maxFan);

  /** Lleva un documento adentro del sobre y deja de dibujarlo al llegar. */
  function stowDoc(tl: gsap.core.Timeline, mesh: THREE.Object3D, order: number, at: number) {
    toDocPose(tl, mesh, insidePose(order), at, d(0.35), "power2.in");
    tl.call(() => {
      mesh.visible = false;
    }, [], at + d(0.35));
  }

  /** Abanico con los visibles; el resto, guardado. Respeta el documento que está fuera. */
  function arrange(tl: gsap.core.Timeline, at: number, stagger: number) {
    if (!stack) return;
    const fan = fanIds();
    let order = 0;
    stack.items.forEach((item, id) => {
      if (id === pickedId) return;
      const index = fan.indexOf(id);
      if (index >= 0) toDocPose(tl, item.mesh, fanPose(index, fan.length), at + index * stagger, d(0.5), "back.out(1.3)");
      else stowDoc(tl, item.mesh, order++, at);
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
    stack?.items.forEach((item) => stowDoc(tl, item.mesh, order++, at));
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
      markDirty(tl.duration() * 1000 + 200);
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
        if (index >= 0) toDocPose(tl, prev.mesh, fanPose(index, fan.length), 0, d(0.45));
        else stowDoc(tl, prev.mesh, 0, 0);
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

  // ── Mover dinero entre sobres ─────────────────────────────────────────────
  /** Boca del sobre en coordenadas de mundo (un poco adentro: ahí entran y salen las fichas). */
  function mouthPoint(part: EnvelopePart, depth: number) {
    root.updateMatrixWorld(true);
    return part.hover.localToWorld(new THREE.Vector3(0, ENVELOPE.height / 2 - depth, 0.06));
  }

  let flyingTokens: MoneyTokens | null = null;

  async function transfer(fromId: EnvelopeId, toId: EnvelopeId) {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to || from === to || disposed || (stage !== "open" && stage !== "focused")) return;
    clearHover();
    const tokens = createMoneyTokens(3);
    flyingTokens = tokens;
    tokens.meshes.forEach((mesh) => scene.add(mesh));
    // Puntos del arco: sale de la boca del origen, sube hacia la cámara y cae en la boca del destino.
    const start = mouthPoint(from, 0.45);
    const end = mouthPoint(to, 0.5);
    // Arco (en mundo) hacia la cámara y un poco arriba: las fichas pasan por delante de todos los sobres.
    const control = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0.7, 1.1, 2.6));
    const flight = d(1.3);
    const stagger = d(0.14);
    const arrival = flight + stagger * (tokens.meshes.length - 1);
    await play((tl) => {
      // El origen abre la boca y se levanta un poco al soltar las fichas.
      tl.to(from.mouth.rotation, { x: 0.7, duration: d(0.3), ease: "back.out(1.6)" }, 0);
      tl.to(from.hover.position, { y: 0.12, duration: d(0.3), ease: "power2.out" }, 0);
      tokens.meshes.forEach((mesh, i) => {
        const progress = { t: 0 };
        const point = new THREE.Vector3();
        const at = d(0.15) + i * stagger;
        tl.call(() => {
          mesh.visible = true;
        }, [], at);
        tl.to(progress, {
          t: 1,
          duration: flight,
          ease: "power1.inOut",
          onUpdate: () => {
            const t = progress.t;
            // Bézier cuadrática: inicio → control → fin.
            point.copy(start).multiplyScalar((1 - t) * (1 - t)).addScaledVector(control, 2 * (1 - t) * t).addScaledVector(end, t * t);
            mesh.position.copy(point);
            // De cara a la cámara, con un giro suave en el aire.
            mesh.rotation.set(-0.15 + (1 - Math.sin(t * Math.PI)) * 0.5, Math.sin(t * Math.PI * 2) * 0.5 + i * 0.12, (t - 0.5) * 0.6 + i * 0.08);
            mesh.scale.setScalar(0.75 + Math.sin(t * Math.PI) * 0.75);
          },
        }, at);
        tl.call(() => {
          mesh.visible = false;
        }, [], at + flight);
      });
      // El origen se cierra; el destino abre la boca antes de recibir y "traga" al final.
      tl.to(from.mouth.rotation, { x: 0, duration: d(0.3), ease: "power2.inOut" }, d(0.15) + arrival * 0.5);
      tl.to(from.hover.position, { y: 0, duration: d(0.35), ease: "power2.inOut" }, d(0.15) + arrival * 0.5);
      tl.to(to.mouth.rotation, { x: 0.75, duration: d(0.3), ease: "back.out(1.6)" }, d(0.15) + flight * 0.6);
      tl.to(to.hover.position, { y: -0.06, duration: d(0.12), ease: "power2.in" }, d(0.15) + arrival);
      tl.to(to.hover.position, { y: 0, duration: d(0.35), ease: "back.out(2)" }, d(0.27) + arrival);
      tl.to(to.mouth.rotation, { x: 0, duration: d(0.3), ease: "power2.inOut" }, d(0.3) + arrival);
      tl.call(() => {
        tokens.dispose();
        flyingTokens = null;
      }, [], d(0.65) + arrival);
    });
  }

  function restyleEnvelope(item: EnvelopeItem) {
    byId.get(item.id)?.restyle(item);
    wake(800);
  }

  // ── Puntero: hover, paralaje y toques ─────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { x: 0, y: 0, active: false };
  let hovered: EnvelopePart | null = null;
  /** Gesto en curso: dónde empezó y sobre qué. */
  let downAt: { x: number; y: number; t: number; id: number; envelope?: EnvelopeId; document?: string } | null = null;
  /** Arrastre actual en px (para que la escena siga al dedo). */
  const drag = { x: 0, y: 0 };

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
    markDirty(400);
  }
  function clearHover() {
    setHover(null);
    renderer.domElement.style.cursor = "";
  }

  /** Respuesta mientras se arrastra: la tapa o el sobre activo siguen al dedo. */
  function followDrag(dx: number, dy: number) {
    drag.x = dx;
    drag.y = dy;
    if (running) return;
    const width = canvasSize.width;
    const height = canvasSize.height;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    if (stage === "closed" && horizontal) {
      const progress = THREE.MathUtils.clamp(-dx / width, 0, 1);
      // La correa se desabrocha primero; la tapa empieza a levantarse después.
      const strap = THREE.MathUtils.clamp(progress * 3, 0, 1);
      binder.strapTab.rotation.y = strap * STRAP_TAB_OPEN;
      binder.strapPivot.rotation.y = strap * STRAP_OPEN * 0.7;
      binder.coverPivot.rotation.y = -Math.max(0, progress - 0.15) * 0.7;
    }
    const active = activeId ? byId.get(activeId) : undefined;
    if (active && !horizontal && (stage === "focused" || stage === "extracted")) {
      active.hover.position.y = THREE.MathUtils.clamp(-dy / height, -0.3, 0.4) * 1.2;
    }
    markDirty(200);
  }

  /** Suelta el arrastre: lo que no se convirtió en acción vuelve a su lugar. */
  function releaseDrag() {
    drag.x = 0;
    drag.y = 0;
    if (running) return;
    const active = activeId ? byId.get(activeId) : undefined;
    ctx.add(() => {
      if (stage === "closed") {
        gsap.to(binder.coverPivot.rotation, { y: 0, duration: d(0.35), ease: "back.out(1.6)" });
        gsap.to(binder.strapPivot.rotation, { y: 0, duration: d(0.35), delay: d(0.1), ease: "power2.inOut" });
        gsap.to(binder.strapTab.rotation, { y: 0, duration: d(0.3), delay: d(0.3), ease: "back.out(1.4)" });
      }
      if (active) gsap.to(active.hover.position, { y: 0, duration: d(0.3), ease: "power2.out" });
    });
    markDirty(500);
  }

  function onPointerMove(event: PointerEvent) {
    wake();
    if (downAt && event.pointerId === downAt.id) {
      const dx = event.clientX - downAt.x;
      const dy = event.clientY - downAt.y;
      if (Math.hypot(dx, dy) > TAP_SLOP) followDrag(dx, dy);
      return;
    }
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
    wake();
    if (event.button !== 0) return;
    const hit = pick(event);
    downAt = { x: event.clientX, y: event.clientY, t: performance.now(), id: event.pointerId, envelope: hit.envelope, document: hit.document };
  }
  function onPointerUp(event: PointerEvent) {
    if (!downAt || event.pointerId !== downAt.id) return;
    const start = downAt;
    downAt = null;
    const gesture = classifyGesture({ dx: event.clientX - start.x, dy: event.clientY - start.y, dt: performance.now() - start.t });
    if (gesture === "tap") {
      const hit = pick(event);
      if (hit.document) intentListener?.({ type: "document", id: hit.document });
      else if (hit.envelope) intentListener?.({ type: "envelope", id: hit.envelope });
      else if (hit.binder) intentListener?.({ type: "binder" });
      return;
    }
    releaseDrag();
    if (gesture) {
      if (event.pointerType !== "mouse") navigator.vibrate?.(8);
      intentListener?.({ type: "swipe", direction: gesture, envelope: start.envelope, document: start.document });
    }
  }
  /** El navegador tomó el gesto (p. ej. para desplazar la página). */
  function onPointerCancel() {
    downAt = null;
    releaseDrag();
  }
  const canvas = renderer.domElement;
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);

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
    wake();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  resize();
  const intersectionObserver = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    if (visible) wake(1000);
  });
  intersectionObserver.observe(mount);

  // ── Bucle de render ───────────────────────────────────────────────────────
  // Sombras: se recalculan mientras algo se mueve y, en reposo, cada pocos cuadros.
  renderer.shadowMap.autoUpdate = false;
  let frame = 0;
  let tick = 0;
  let lastRenderAt = 0;
  let pixelRatio = renderer.getPixelRatio();
  const frameTimes: number[] = [];
  /** ¿Hay alguna animación de GSAP corriendo (hover, abanico, escritura…)? */
  const anyTweenActive = () => gsap.globalTimeline.getChildren(true, true, false).some((child) => child.isActive());

  /** Si los cuadros salen lentos de forma sostenida, baja la resolución (nunca sube: evita oscilar). */
  function adaptQuality(now: number) {
    if (lastRenderAt && now - lastRenderAt < 100) frameTimes.push(now - lastRenderAt);
    lastRenderAt = now;
    if (frameTimes.length < 90) return;
    const average = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
    frameTimes.length = 0;
    if (average > SLOW_FRAME_MS && pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(canvasSize.width, canvasSize.height, false);
    }
  }

  const loop = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    // En reposo no se dibuja: ahorra batería. Cualquier interacción o animación despierta la escena.
    const awake = running !== null || now < awakeUntil || anyTweenActive();
    if (!awake) {
      lastRenderAt = 0;
      return;
    }
    adaptQuality(now);
    // Con la carpeta cerrada o abierta, deslizar en vertical desplaza la página;
    // con un sobre elegido, el lienzo recibe todos los gestos.
    const touchAction = stage === "closed" || stage === "open" ? "pan-y" : "none";
    if (canvas.style.touchAction !== touchAction) canvas.style.touchAction = touchAction;
    if (!reducedMotion) {
      // Al deslizar en horizontal (fuera de "cerrada") la carpeta gira un poco con el dedo.
      const dragYaw = stage !== "closed" && Math.abs(drag.x) > Math.abs(drag.y) ? THREE.MathUtils.clamp(drag.x / canvasSize.width, -0.5, 0.5) * 0.3 : 0;
      const tx = (pointer.active ? pointer.x * 0.04 : 0) + dragYaw;
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
    transfer,
    restyleEnvelope,
    setSafeArea: (area) => {
      const same = area.top === safe.top && area.right === safe.right && area.bottom === safe.bottom && area.left === safe.left;
      if (same || disposed) return;
      safe = area;
      reframe();
      wake();
    },
    onIntent: (callback) => {
      intentListener = callback;
    },
    dispose: () => {
      disposed = true;
      disposeStack();
      flyingTokens?.dispose();
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
      canvas.removeEventListener("pointercancel", onPointerCancel);
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
