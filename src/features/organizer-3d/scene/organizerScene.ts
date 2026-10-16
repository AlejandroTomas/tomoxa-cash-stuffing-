import * as THREE from "three";
import { gsap } from "gsap";
import type { EnvelopeId, EnvelopeItem } from "../domain/envelopeView";
import { createBinder } from "./binder";
import { createEnvelope, createEnvelopeGeometries, type EnvelopePart } from "./envelope";
import { fovFor, freeNdc, outsideNdc, presentDepth, rigFor, subFov, type CameraRig, type Viewport } from "./framing";
import type { EnvelopeDocument } from "../domain/document";
import { classifyGesture, TAP_SLOP } from "../domain/gestures";
import { createCaptionTag, type CaptionTag } from "./captionTag";
import { createDocumentStack, type DocumentStack } from "./documents";
import { createMoneyTokens, type MoneyTokens } from "./moneyTokens";
import { BINDER, DOCUMENT, DOCUMENT_DUCK, DOCUMENT_TRAVEL_Y, ENVELOPE, fanPose, insidePose, pocketClearance, slotPose as slotPoseOf, type DocumentPose, type SlotPose } from "./layout";
import { createMaterialKit } from "./materials";
import { createStage } from "./stage";
import type { OrganizerSceneApi, SafeArea, SceneIntent } from "./contract";

export type { OrganizerSceneApi, SafeArea, SceneIntent } from "./contract";

type SceneStage = "closed" | "open" | "browsing" | "reading";

/** Dirección desde la que mira la cámara: casi de frente, un poco desde arriba. */
const VIEW_DIR = new THREE.Vector3(0, 0.08, 1).normalize();
const STRAP_OPEN = Math.PI / 2 + 0.14;
const STRAP_TAB_OPEN = Math.PI / 2 - 0.08;
/** Pose de presentación del sobre abierto: compensa la inclinación de la carpeta para mirar a cámara. */
const EXTRACTED = { rx: -BINDER.tilt.x * 0.88, ry: -BINDER.tilt.y * 0.7 - 0.06, rz: -BINDER.tilt.z * 0.8, scale: 1.06 };
/** Z mínima del sobre presentado: por delante del sobre más cercano en abanico. */
const MIN_PRESENT_Z = 1.6;
/** Tras cuánto tiempo sin interacción (ms) la escena deja de dibujarse hasta que algo cambie. */
const IDLE_MS = 6000;
/** Cuadros (ms) por encima de los cuales se baja la resolución del render (~40 fps). */
const SLOW_FRAME_MS = 25;
/** Cuánto se levanta la mitad móvil de cada anilla (rad). */
const RINGS_OPEN = 0.36;
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
  // Los sobres llegan del libro con `setEnvelopes` (y se reacomodan si cambian).
  let parts: EnvelopePart[] = [];
  let byId = new Map<EnvelopeId, EnvelopePart>();
  let envelopeTargets: THREE.Object3D[] = [];
  function indexParts() {
    byId = new Map(parts.map((part) => [part.item.id, part]));
    envelopeTargets = parts.map((part) => part.hover);
  }
  // Poses según cuántos sobres hay en la carpeta.
  const slotPose = (index: number, fanned = false) => slotPoseOf(index, fanned, parts.length);
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
            // Cambios de sobres que llegaron con un sobre fuera: se aplican ya de regreso.
            const pending = pendingItems;
            if (pending && (stage === "closed" || stage === "open")) void setEnvelopes(pending);
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

  /** Abre o cierra las anillas (la mitad móvil gira sobre su bisagra en la placa). */
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

  /** Arriba de su bolsillo, en su mismo plano. */
  function abovePocket(index: number): SlotPose {
    const slot = slotPose(index, true);
    // Sube lo suficiente para librar a los de enfrente.
    const lift = pocketClearance(parts.length);
    return { ...slot, y: slot.y + lift * Math.cos(slot.rx), z: slot.z + lift * Math.sin(slot.rx) + 0.05 };
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
    const out = stage === "browsing" || stage === "reading";
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

  /**
   * Dónde se presenta el sobre abierto: hacia el centro de lo que se ve y tan
   * cerca de la cámara como permite el encuadre sin recortarlo (con lugar
   * arriba para los documentos que asoman).
   */
  function presentSpot() {
    const vp = viewport();
    const open = rigFor("open", vp);
    const x = 0.25 + open.tx * 0.5;
    const extraHeight = DOCUMENT.rise + DOCUMENT.height * 0.5 + 0.9;
    // Siempre por delante de la pila de sobres; si a esa distancia no cabe (móvil), se achica.
    let scale = EXTRACTED.scale;
    let z = 0;
    for (; scale > 0.55; scale -= 0.05) {
      z = presentDepth(open, vp, ENVELOPE.width * scale + 0.5, (ENVELOPE.height + extraHeight) * scale, x - open.tx);
      if (z >= MIN_PRESENT_Z) break;
    }
    z = Math.max(z, MIN_PRESENT_Z);
    // La carpeta está inclinada: compensar en Y lo que sube al acercarse en Z.
    const worldY = -0.45;
    const y = (worldY + z * Math.sin(BINDER.tilt.x)) / Math.cos(BINDER.tilt.x);
    return { x, y, z, scale };
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

  /**
   * Del abanico al frente sin atravesar a nadie (como los sobres): 1) sube en su
   * plano hasta librar la boca, 2) viene al frente a esa altura, 3) baja a
   * leerse. Devuelve cuándo cruzó y cuándo termina.
   */
  function docOut(tl: gsap.core.Timeline, mesh: THREE.Object3D, at: number) {
    const up = d(0.3);
    const across = d(0.35);
    const down = d(0.4);
    tl.call(() => {
      mesh.visible = true;
    }, [], at);
    tl.to(mesh.position, { y: DOCUMENT_TRAVEL_Y, duration: up, ease: "power2.out" }, at);
    tl.to(mesh.rotation, { z: 0, duration: up, ease: "power2.out" }, at);
    tl.to(mesh.position, { x: READING.x, z: READING.z, duration: across, ease: "power2.inOut" }, at + up);
    // Crece ya de este lado de la boca, para no rozarla.
    tl.to(mesh.position, { y: READING.y, duration: down, ease: "power3.out" }, at + up + across);
    tl.to(mesh.scale, { x: READING.scale, y: READING.scale, z: READING.scale, duration: down, ease: "power3.out" }, at + up + across);
    return { crossed: at + up + across, end: at + up + across + down };
  }

  /** Del frente a su lugar por el mismo camino: sube, va atrás sobre su lugar y baja (al abanico o adentro). */
  function docBack(tl: gsap.core.Timeline, mesh: THREE.Object3D, target: DocumentPose, at: number, stow: boolean) {
    const up = d(0.3);
    const across = d(0.35);
    const down = d(stow ? 0.35 : 0.4);
    tl.to(mesh.position, { y: DOCUMENT_TRAVEL_Y, duration: up, ease: "power2.out" }, at);
    tl.to(mesh.scale, { x: 1, y: 1, z: 1, duration: up, ease: "power2.out" }, at);
    tl.to(mesh.position, { x: target.x, z: target.z, duration: across, ease: "power2.inOut" }, at + up);
    tl.to(mesh.rotation, { z: target.rz, duration: across, ease: "power2.inOut" }, at + up);
    tl.to(mesh.position, { y: target.y, duration: down, ease: stow ? "power2.in" : "power2.out" }, at + up + across);
    const end = at + up + across + down;
    if (stow) {
      tl.call(() => {
        mesh.visible = false;
      }, [], end);
    }
    return { crossed: at + up + across, end };
  }

  /** Los del abanico delante de `depth` (índice menor = más al frente) bajan para dejar pasar y vuelven. */
  function duckFront(tl: gsap.core.Timeline, depth: number, from: number, until: number, moving: readonly string[]) {
    if (!stack) return;
    const fan = fanIds();
    fan.forEach((id, index) => {
      const item = stack?.items.get(id);
      if (!item || index >= depth || moving.includes(id)) return;
      const pose = fanPose(index, fan.length);
      tl.to(item.mesh.position, { y: pose.y - DOCUMENT_DUCK, duration: d(0.25), ease: "power2.inOut" }, from);
      tl.to(item.mesh.position, { y: pose.y, duration: d(0.35), ease: "power2.out" }, until);
    });
  }

  /** Lugar al que vuelve un documento: su sitio en el abanico o, si el filtro lo dejó fuera, adentro del sobre. */
  function homeOf(id: string): { pose: DocumentPose; stow: boolean; depth: number } {
    const fan = fanIds();
    const index = fan.indexOf(id);
    return index >= 0 ? { pose: fanPose(index, fan.length), stow: false, depth: index } : { pose: insidePose(0), stow: true, depth: fan.length };
  }

  async function openEnvelope(id: EnvelopeId, documents: readonly EnvelopeDocument[], visibleIds: readonly string[], phrase: string) {
    const part = byId.get(id);
    if (!part || disposed || stage !== "open") return;
    stage = "browsing";
    activeId = id;
    clearHover();
    part.setLayer(200);
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
      // 1) Sale del bolsillo hacia arriba, en su plano, hasta librar a los de enfrente.
      // 2) Viene al frente a esa altura mirando a la cámara. 3) Ya en su lugar abre
      // la boca y los documentos asoman en cascada.
      ringsTo(tl, true, 0);
      toPose(tl, part, abovePocket(part.index), 0, d(0.45), "power2.inOut");
      ringsTo(tl, false, d(0.95));
      const spot = presentSpot();
      tl.to(part.group.position, { x: spot.x, z: spot.z, duration: d(0.6), ease: "power2.out" }, d(0.42));
      tl.to(part.group.position, { y: spot.y, duration: d(0.6), ease: "power3.out" }, d(0.72));
      tl.to(part.group.rotation, { x: EXTRACTED.rx, y: EXTRACTED.ry, z: EXTRACTED.rz, duration: d(0.8), ease: "power2.out" }, d(0.5));
      tl.to(part.group.scale, { x: spot.scale, y: spot.scale, z: spot.scale, duration: d(0.8), ease: "power2.out" }, d(0.5));
      tl.to(part.mouth.rotation, { x: MOUTH_OPEN, duration: d(0.4), ease: "back.out(1.6)" }, d(1.0));
      arrange(tl, d(1.15), d(0.05));
      tl.to(tag.scale, { x: 1, y: 1, z: 1, duration: d(0.35), ease: "back.out(1.8)" }, d(1.2));
      tl.call(() => writeCaption(phrase), [], d(1.4));
    });
  }

  /** Guarda todos los documentos y cierra la boca; libera los documentos al final. Devuelve cuándo termina. */
  function stowDocuments(tl: gsap.core.Timeline, part: EnvelopePart, at: number): number {
    // El que está fuera regresa primero por arriba de la boca; los demás bajan mientras tanto.
    const picked = pickedId ? stack?.items.get(pickedId) : undefined;
    const start = picked ? docBack(tl, picked.mesh, insidePose(0), at, true).crossed : at;
    let order = picked ? 1 : 0;
    stack?.items.forEach((item) => item !== picked && stowDoc(tl, item.mesh, order++, at));
    const close = Math.max(at + d(0.3), start + d(0.1));
    tl.to(part.mouth.rotation, { x: 0, duration: d(0.3), ease: "power2.inOut" }, close);
    tl.call(() => disposeStack(), [], close + d(0.3));
    return close + d(0.3);
  }

  async function closeEnvelope() {
    const part = activeId ? byId.get(activeId) : undefined;
    if (!part || disposed || (stage !== "browsing" && stage !== "reading")) return;
    stage = "open";
    activeId = null;
    fanTimeline?.kill();
    await play((tl) => {
      // Guarda los documentos, cierra la boca y el sobre vuelve a su bolsillo.
      const end = stowDocuments(tl, part, 0);
      slideBack(tl, part, end - d(0.1), slotPose(part.index, true));
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
      // El que estaba fuera vuelve a su lugar; el nuevo sale cuando aquel ya cruzó.
      const prev = previous && previous !== id ? stack?.items.get(previous) : undefined;
      const prevHome = prev ? homeOf(prev.doc.id) : null;
      const back = prev && prevHome ? docBack(tl, prev.mesh, prevHome.pose, 0, prevHome.stow) : { crossed: 0, end: 0 };
      const out = docOut(tl, item.mesh, back.crossed);
      // Los de enfrente de cualquiera de los dos se agachan mientras cruzan.
      const depth = Math.max(homeOf(id).depth, prevHome?.depth ?? 0);
      duckFront(tl, depth, 0, out.crossed, prev ? [id, prev.doc.id] : [id]);
    });
  }

  async function returnDocument() {
    const item = pickedId ? stack?.items.get(pickedId) : undefined;
    if (!item || disposed || stage !== "reading") return;
    stage = "browsing";
    pickedId = null;
    const id = item.doc.id;
    await play((tl) => {
      // Los demás ya están en su lugar (el filtro los reacomoda aunque haya uno fuera); él regresa por arriba.
      const home = homeOf(id);
      const back = docBack(tl, item.mesh, home.pose, 0, home.stow);
      duckFront(tl, home.depth, 0, back.crossed, [id]);
    });
  }

  // ── Mover dinero entre sobres ─────────────────────────────────────────────
  /** Boca del sobre en coordenadas de mundo (un poco adentro: ahí entran y salen las fichas). */
  function mouthPoint(part: EnvelopePart, depth: number) {
    root.updateMatrixWorld(true);
    return part.hover.localToWorld(new THREE.Vector3(0, ENVELOPE.height / 2 - depth, 0.06));
  }

  let flyingTokens: MoneyTokens | null = null;

  /**
   * Punto "fuera de la carpeta" cerca de un sobre (de ahí llega o ahí se va el
   * dinero): arriba a la derecha en pantalla, dentro de la zona libre, y más
   * cerca de la cámara sobre el mismo rayo (se ve en el mismo lugar, más grande).
   */
  const outsideOf = (point: THREE.Vector3) => {
    camera.updateMatrixWorld();
    const ndc = point.clone().project(camera);
    const target = outsideNdc(ndc, freeNdc(canvasSize.width, canvasSize.height, safe));
    return new THREE.Vector3(target.x, target.y, ndc.z).unproject(camera).lerp(camera.position, 0.3);
  };

  /**
   * Fichas de dinero de un sobre a otro. `null` = fuera de la carpeta: un
   * ingreso llega de fuera (`from` null) y un gasto se va (`to` null).
   */
  async function transfer(fromId: EnvelopeId | null, toId: EnvelopeId | null) {
    const from = fromId ? byId.get(fromId) : undefined;
    const to = toId ? byId.get(toId) : undefined;
    if ((fromId && !from) || (toId && !to) || (!from && !to) || from === to || disposed || stage !== "open") return;
    clearHover();
    const tokens = createMoneyTokens(3);
    flyingTokens = tokens;
    tokens.meshes.forEach((mesh) => scene.add(mesh));
    // Puntos del arco: sale de la boca del origen, sube hacia la cámara y cae en la boca del destino.
    const end = to ? mouthPoint(to, 0.5) : outsideOf(mouthPoint(from!, 0.45));
    const start = from ? mouthPoint(from, 0.45) : outsideOf(end);
    // Entre sobres el arco pasa por delante de todos; desde/hacia fuera basta una curva suave.
    const lift = from && to ? new THREE.Vector3(0.7, 1.1, 2.6) : new THREE.Vector3(0.4, 0.9, 0.6);
    const control = start.clone().lerp(end, 0.5).add(lift);
    const flight = d(1.3);
    const stagger = d(0.14);
    const arrival = flight + stagger * (tokens.meshes.length - 1);
    // Desde fuera las fichas aparecen creciendo; hacia fuera se encogen hasta desaparecer.
    const fade = (t: number) => (from ? 1 : Math.min(1, t * 4)) * (to ? 1 : Math.min(1, (1 - t) * 4));
    await play((tl) => {
      // El origen abre la boca y se levanta un poco al soltar las fichas.
      if (from) {
        tl.to(from.mouth.rotation, { x: 0.7, duration: d(0.3), ease: "back.out(1.6)" }, 0);
        tl.to(from.hover.position, { y: 0.12, duration: d(0.3), ease: "power2.out" }, 0);
      }
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
            mesh.scale.setScalar(Math.max(0.001, (0.75 + Math.sin(t * Math.PI) * 0.75) * fade(t)));
          },
        }, at);
        tl.call(() => {
          mesh.visible = false;
        }, [], at + flight);
      });
      // El origen se cierra; el destino abre la boca antes de recibir y "traga" al final.
      if (from) {
        tl.to(from.mouth.rotation, { x: 0, duration: d(0.3), ease: "power2.inOut" }, d(0.15) + arrival * 0.5);
        tl.to(from.hover.position, { y: 0, duration: d(0.35), ease: "power2.inOut" }, d(0.15) + arrival * 0.5);
      }
      if (to) {
        tl.to(to.mouth.rotation, { x: 0.75, duration: d(0.3), ease: "back.out(1.6)" }, d(0.15) + flight * 0.6);
        tl.to(to.hover.position, { y: -0.06, duration: d(0.12), ease: "power2.in" }, d(0.15) + arrival);
        tl.to(to.hover.position, { y: 0, duration: d(0.35), ease: "back.out(2)" }, d(0.27) + arrival);
        tl.to(to.mouth.rotation, { x: 0, duration: d(0.3), ease: "power2.inOut" }, d(0.3) + arrival);
      }
      tl.call(() => {
        tokens.dispose();
        flyingTokens = null;
      }, [], d(0.65) + arrival);
    });
  }

  let pendingItems: readonly EnvelopeItem[] | null = null;

  async function setEnvelopes(items: readonly EnvelopeItem[]) {
    if (disposed) return;
    const sameSet = items.length === parts.length && items.every((item, index) => parts[index].item.id === item.id);
    if (sameSet) {
      items.forEach((item, index) => {
        parts[index].item = item;
        parts[index].restyle(item);
      });
      wake(800);
      return;
    }
    // Con un sobre fuera de la carpeta no se reacomoda: se aplica al regresar.
    if (stage === "browsing" || stage === "reading" || running) {
      pendingItems = items;
      return;
    }
    pendingItems = null;
    const previous = new Map(parts.map((part) => [part.item.id, part]));
    const next = items.map((item, index) => {
      const existing = previous.get(item.id);
      if (existing) {
        previous.delete(item.id);
        existing.index = index;
        existing.item = item;
        existing.restyle(item);
        existing.fitLabel(items.length);
        return existing;
      }
      const created = createEnvelope(item, index, items.length, kit, geometries, maxAnisotropy);
      created.group.scale.setScalar(0.001);
      binder.group.add(created.group);
      return created;
    });
    const removed = [...previous.values()];
    parts = next;
    indexParts();
    restingLayers();
    const fanned = stage !== "closed";
    await play((tl) => {
      // Los que se van se encogen; los nuevos crecen en su lugar; todos se reacomodan.
      removed.forEach((part) => tl.to(part.group.scale, { x: 0.001, y: 0.001, z: 0.001, duration: d(0.3), ease: "power2.in" }, 0));
      tl.call(() => removed.forEach((part) => part.dispose()), [], d(0.32));
      parts.forEach((part) => toPose(tl, part, slotPose(part.index, fanned), d(0.12) + part.index * d(0.03), d(0.55), "back.out(1.3)"));
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

  /** Respuesta mientras se arrastra: con la carpeta cerrada, la tapa sigue al dedo. */
  function followDrag(dx: number, dy: number) {
    drag.x = dx;
    drag.y = dy;
    if (running) return;
    const width = canvasSize.width;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    if (stage === "closed" && horizontal) {
      const progress = THREE.MathUtils.clamp(-dx / width, 0, 1);
      // La correa se desabrocha primero; la tapa empieza a levantarse después.
      const strap = THREE.MathUtils.clamp(progress * 3, 0, 1);
      binder.strapTab.rotation.y = strap * STRAP_TAB_OPEN;
      binder.strapPivot.rotation.y = strap * STRAP_OPEN * 0.7;
      binder.coverPivot.rotation.y = -Math.max(0, progress - 0.15) * 0.7;
    }
    markDirty(200);
  }

  /** Suelta el arrastre: lo que no se convirtió en acción vuelve a su lugar. */
  function releaseDrag() {
    drag.x = 0;
    drag.y = 0;
    if (running) return;
    ctx.add(() => {
      if (stage === "closed") {
        gsap.to(binder.coverPivot.rotation, { y: 0, duration: d(0.35), ease: "back.out(1.6)" });
        gsap.to(binder.strapPivot.rotation, { y: 0, duration: d(0.35), delay: d(0.1), ease: "power2.inOut" });
        gsap.to(binder.strapTab.rotation, { y: 0, duration: d(0.3), delay: d(0.3), ease: "back.out(1.4)" });
      }
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
    setHover(stage === "open" && hit.envelope ? (byId.get(hit.envelope) ?? null) : null);
    const interactive =
      stage === "closed"
        ? hit.binder || Boolean(hit.envelope)
        : stage === "browsing" || stage === "reading"
          ? Boolean(hit.document) || (Boolean(hit.envelope) && hit.envelope !== activeId)
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
    openEnvelope,
    closeEnvelope,
    showDocuments,
    pickDocument,
    returnDocument,
    transfer,
    restyleEnvelope,
    setEnvelopes,
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
