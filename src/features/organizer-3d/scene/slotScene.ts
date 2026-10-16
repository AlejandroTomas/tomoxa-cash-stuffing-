import * as THREE from "three";
import type { EnvelopeId, EnvelopeItem } from "../domain/envelopeView";
import type { OrganizerSceneApi, SceneIntent } from "./contract";
import { createMoneyTokens, type MoneyTokens } from "./moneyTokens";
import { createSceneRuntime, type SceneRuntime } from "./runtime";
import type { FrameTarget, Pose, SlotModel, SlotPart, Vec3 } from "./slotModel";

type SceneStage = "closed" | "open" | "focused" | "extracted" | "browsing" | "reading";

const isOut = (stage: SceneStage) => stage === "extracted" || stage === "browsing" || stage === "reading";

/** Cuánto se acerca el encuadre a la pieza elegida (0 = nada, 1 = centrado en ella). */
const FOCUS_PULL = 0.18;

/**
 * Escena de un organizador "de ranuras" (cajonera, archivador) con el mismo
 * contrato que la carpeta. Las animaciones son genéricas (timelines de GSAP
 * entre poses); `buildModel` aporta la geometría y las poses de cada estilo.
 * Los documentos en 3D son de la carpeta: aquí abrir un sobre solo cambia de
 * estado y el panel de documentos de la interfaz hace el resto.
 */
export function createSlotScene(mount: HTMLElement, viewDir: Vec3, buildModel: (runtime: SceneRuntime) => SlotModel): OrganizerSceneApi {
  const runtime = createSceneRuntime(mount, viewDir);
  let model: SlotModel;
  try {
    model = buildModel(runtime);
  } catch (error) {
    runtime.dispose();
    throw error;
  }
  const { root, d } = runtime;
  root.add(model.group);

  let stage: SceneStage = "closed";
  let activeId: EnvelopeId | null = null;
  let parts: SlotPart[] = [];
  let byId = new Map<EnvelopeId, SlotPart>();
  let targets: THREE.Object3D[] = [];
  let pendingItems: readonly EnvelopeItem[] | null = null;
  let intentListener: ((intent: SceneIntent) => void) | null = null;
  let hovered: SlotPart | null = null;
  let flyingTokens: MoneyTokens | null = null;

  const count = () => Math.max(1, parts.length);
  function indexParts() {
    byId = new Map(parts.map((part) => [part.item.id, part]));
    targets = [model.group];
  }

  // ── Encuadres ─────────────────────────────────────────────────────────────
  const openFrame = () => model.frame("open", count());
  /** Encuadre con una pieza elegida: el mismo, corrido un poco hacia ella. */
  const focusFrame = (part: SlotPart) => (): FrameTarget => {
    const frame = model.frame("open", count());
    const pose = model.focus(part.index, count());
    const pull = (a: number, b: number) => a + (b - a) * FOCUS_PULL;
    return { ...frame, center: { x: pull(frame.center.x, pose.x), y: pull(frame.center.y, pose.y), z: pull(frame.center.z, pose.z) } };
  };
  const frameNow = (): FrameTarget => {
    const part = activeId ? byId.get(activeId) : undefined;
    if (stage === "closed") return model.frame("overview", count());
    if (part && isOut(stage)) return model.presentFrame(part.index, count());
    if (part && stage === "focused") return focusFrame(part)();
    return openFrame();
  };

  // ── Poses ─────────────────────────────────────────────────────────────────
  function toPose(tl: gsap.core.Timeline, part: SlotPart, pose: Pose, at: number, duration: number, ease = "power3.out") {
    tl.to(part.group.position, { x: pose.x, y: pose.y, z: pose.z, duration, ease }, at);
    tl.to(part.group.rotation, { x: pose.rx, y: pose.ry, z: pose.rz, duration, ease }, at);
    tl.to(part.group.scale, { x: pose.scale, y: pose.scale, z: pose.scale, duration, ease }, at);
  }
  function setPose(part: SlotPart, pose: Pose) {
    part.group.position.set(pose.x, pose.y, pose.z);
    part.group.rotation.set(pose.rx, pose.ry, pose.rz, "YXZ");
    part.group.scale.setScalar(pose.scale);
  }
  /** Hover a cero (las transiciones parten de la pose limpia). */
  function settleHover(tl: gsap.core.Timeline, part: SlotPart, at: number) {
    tl.to(part.hover.position, { x: 0, y: 0, z: 0, duration: d(0.2), ease: "power2.out" }, at);
  }
  /** Recorre poses en orden; cada tramo arranca un poco antes de que acabe el anterior (sin frenar en seco). */
  function followPath(tl: gsap.core.Timeline, part: SlotPart, path: readonly Pose[], at: number, durations: readonly number[]): number {
    let t = at;
    path.forEach((pose, i) => {
      const duration = d(durations[Math.min(i, durations.length - 1)]);
      const last = i === path.length - 1;
      toPose(tl, part, pose, t, duration, last ? "power3.out" : "power2.inOut");
      t += duration * (last ? 1 : 0.82);
    });
    return t;
  }

  // ── Acciones del contrato ─────────────────────────────────────────────────
  async function open() {
    if (runtime.isDisposed() || stage !== "closed") return;
    stage = "open";
    await runtime.play((tl) => {
      runtime.cameraTo(tl, openFrame, 0, d(1.2));
      // Saludo: cada pieza asoma y vuelve, en cascada (se ve que se pueden sacar).
      const offset = model.hoverOffset;
      parts.forEach((part) => {
        const at = d(0.35) + part.index * d(0.07);
        tl.to(part.hover.position, { x: offset.x * 1.6, y: offset.y * 1.6, z: offset.z * 1.6, duration: d(0.28), ease: "power2.out" }, at);
        tl.to(part.hover.position, { x: 0, y: 0, z: 0, duration: d(0.45), ease: "back.out(2)" }, at + d(0.28));
      });
    });
  }

  async function close() {
    if (runtime.isDisposed() || stage === "closed") return;
    const part = activeId ? byId.get(activeId) : undefined;
    const wasOut = isOut(stage);
    stage = "closed";
    activeId = null;
    clearHover();
    await runtime.play((tl) => {
      const start = part && wasOut ? returnAlongPath(tl, part, 0) : 0;
      parts.forEach((each) => toPose(tl, each, model.rest(each.index, count()), start, d(0.5), "power2.inOut"));
      runtime.cameraTo(tl, () => model.frame("overview", count()), start, d(1.1));
    });
  }

  async function focus(id: EnvelopeId) {
    const part = byId.get(id);
    if (!part || runtime.isDisposed() || stage === "closed" || isOut(stage)) return;
    const previous = activeId && activeId !== id ? byId.get(activeId) : undefined;
    stage = "focused";
    activeId = id;
    clearHover();
    await runtime.play((tl) => {
      // El anterior vuelve a su lugar antes de que el nuevo salga.
      if (previous) toPose(tl, previous, model.rest(previous.index, count()), 0, d(0.38), "power2.inOut");
      const start = previous ? d(0.22) : 0;
      settleHover(tl, part, start);
      toPose(tl, part, model.focus(part.index, count()), start, d(0.6), "back.out(1.4)");
      runtime.cameraTo(tl, focusFrame(part), start, d(0.9));
    });
  }

  async function extract(id: EnvelopeId) {
    const part = byId.get(id);
    if (!part || runtime.isDisposed() || stage !== "focused") return;
    stage = "extracted";
    activeId = id;
    clearHover();
    await runtime.play((tl) => {
      settleHover(tl, part, 0);
      const path = model.exitPath(part.index, count());
      const durations = path.length > 2 ? [0.5, 0.45, 0.75] : [0.55, 0.8];
      const end = followPath(tl, part, path, 0, durations);
      runtime.cameraTo(tl, () => model.presentFrame(part.index, count()), end * 0.3, Math.max(d(0.5), end * 0.75));
    });
  }

  /** Regresa por el mismo camino por el que salió, hasta la pose de elegida. Devuelve cuándo termina. */
  function returnAlongPath(tl: gsap.core.Timeline, part: SlotPart, at: number): number {
    const path = model.exitPath(part.index, count());
    const back = [...path.slice(0, -1).reverse(), model.focus(part.index, count())];
    const durations = back.length > 2 ? [0.6, 0.45, 0.5] : [0.6, 0.55];
    return followPath(tl, part, back, at, durations);
  }

  async function returnEnvelope(id: EnvelopeId) {
    const part = byId.get(id);
    if (!part || runtime.isDisposed() || stage !== "extracted") return;
    stage = "focused";
    activeId = id;
    await runtime.play((tl) => {
      settleHover(tl, part, 0);
      const end = returnAlongPath(tl, part, 0);
      runtime.cameraTo(tl, focusFrame(part), end * 0.2, Math.max(d(0.5), end * 0.8));
    });
  }

  async function clearFocus() {
    if (runtime.isDisposed() || stage !== "focused") return;
    const part = activeId ? byId.get(activeId) : undefined;
    stage = "open";
    activeId = null;
    await runtime.play((tl) => {
      if (part) toPose(tl, part, model.rest(part.index, count()), 0, d(0.5), "power2.inOut");
      runtime.cameraTo(tl, openFrame, 0, d(0.8));
    });
  }

  // Documentos: solo estado (el abanico 3D es de la carpeta); la pieza "asiente" para dar respuesta.
  async function nod() {
    const part = activeId ? byId.get(activeId) : undefined;
    if (!part) return;
    await runtime.play((tl) => {
      tl.to(part.hover.rotation, { x: 0.06, duration: d(0.18), ease: "power2.out" }, 0);
      tl.to(part.hover.rotation, { x: 0, duration: d(0.35), ease: "back.out(2)" }, d(0.18));
    });
  }
  async function openEnvelope() {
    if (stage !== "extracted") return;
    stage = "browsing";
    await nod();
  }
  async function closeEnvelope() {
    if (stage === "browsing" || stage === "reading") stage = "extracted";
  }
  async function pickDocument() {
    if (stage === "browsing" || stage === "reading") stage = "reading";
  }
  async function returnDocument() {
    if (stage === "reading") stage = "browsing";
  }

  /** Pose actual "en reposo" de una pieza: la elegida está fuera a medias; las demás, en su lugar. */
  const basePose = (part: SlotPart) => (stage === "focused" && part.item.id === activeId ? model.focus(part.index, count()) : model.rest(part.index, count()));

  /** Dónde queda la boca de una pieza cuando está en su pose de elegida (ahí entran o salen las fichas). */
  function mouthWhenOpen(part: SlotPart): THREE.Vector3 {
    const { position, rotation, scale } = part.group;
    const saved = { position: position.clone(), rotation: rotation.clone(), scale: scale.clone() };
    setPose(part, model.focus(part.index, count()));
    part.group.updateMatrixWorld(true);
    const point = part.mouth(new THREE.Vector3());
    position.copy(saved.position);
    rotation.copy(saved.rotation);
    scale.copy(saved.scale);
    part.group.updateMatrixWorld(true);
    return point;
  }

  /**
   * Fichas de dinero de una pieza a otra; `null` = fuera del organizador. Las
   * piezas salen a su pose de elegida (el cajón se abre, la carpeta sube) para
   * que las fichas caigan dentro a la vista, y después vuelven.
   */
  async function transfer(fromId: EnvelopeId | null, toId: EnvelopeId | null) {
    const from = fromId ? byId.get(fromId) : undefined;
    const to = toId ? byId.get(toId) : undefined;
    if ((fromId && !from) || (toId && !to) || (!from && !to) || from === to || runtime.isDisposed() || (stage !== "open" && stage !== "focused")) return;
    clearHover();
    const tokens = createMoneyTokens(3);
    flyingTokens = tokens;
    tokens.meshes.forEach((mesh) => runtime.scene.add(mesh));
    const end = to ? mouthWhenOpen(to) : runtime.outsideOf(mouthWhenOpen(from!));
    const start = from ? mouthWhenOpen(from) : runtime.outsideOf(end);
    const lift = from && to ? new THREE.Vector3(0, 1.4, 1.2) : new THREE.Vector3(0.3, 0.9, 0.6);
    const control = start.clone().lerp(end, 0.5).add(lift);
    const opening = d(0.45);
    const flight = d(1.3);
    const stagger = d(0.14);
    const arrival = opening + flight + stagger * (tokens.meshes.length - 1);
    const fade = (t: number) => (from ? 1 : Math.min(1, t * 4)) * (to ? 1 : Math.min(1, (1 - t) * 4));
    await runtime.play((tl) => {
      // Origen y destino salen a la vez; cada uno vuelve en cuanto termina su parte.
      if (from) {
        toPose(tl, from, model.focus(from.index, count()), 0, opening, "power2.out");
        toPose(tl, from, basePose(from), opening + flight * 0.55, d(0.5), "power2.inOut");
      }
      if (to) {
        toPose(tl, to, model.focus(to.index, count()), 0, opening, "power2.out");
        tl.to(to.hover.position, { x: 0, y: -0.04, z: 0, duration: d(0.12), ease: "power2.in" }, arrival);
        tl.to(to.hover.position, { y: 0, duration: d(0.3), ease: "back.out(2)" }, arrival + d(0.12));
        toPose(tl, to, basePose(to), arrival + d(0.25), d(0.5), "power2.inOut");
      }
      tokens.meshes.forEach((mesh, i) => {
        const progress = { t: 0 };
        const point = new THREE.Vector3();
        const at = opening + i * stagger;
        tl.call(() => {
          mesh.visible = true;
        }, [], at);
        tl.to(progress, {
          t: 1,
          duration: flight,
          ease: "power1.inOut",
          onUpdate: () => {
            const t = progress.t;
            point.copy(start).multiplyScalar((1 - t) * (1 - t)).addScaledVector(control, 2 * (1 - t) * t).addScaledVector(end, t * t);
            mesh.position.copy(point);
            mesh.rotation.set(-0.15 + (1 - Math.sin(t * Math.PI)) * 0.5, Math.sin(t * Math.PI * 2) * 0.5 + i * 0.12, (t - 0.5) * 0.6 + i * 0.08);
            mesh.scale.setScalar(Math.max(0.001, (0.6 + Math.sin(t * Math.PI) * 0.6) * fade(t)));
          },
        }, at);
        tl.call(() => {
          mesh.visible = false;
        }, [], at + flight);
      });
      tl.call(() => {
        tokens.dispose();
        flyingTokens = null;
      }, [], arrival + d(0.8));
    });
  }

  function restyleEnvelope(item: EnvelopeItem) {
    byId.get(item.id)?.restyle(item);
    runtime.wake(800);
  }

  async function setEnvelopes(items: readonly EnvelopeItem[]) {
    if (runtime.isDisposed()) return;
    const sameSet = items.length === parts.length && items.every((item, index) => parts[index].item.id === item.id);
    if (sameSet) {
      items.forEach((item, index) => {
        parts[index].item = item;
        parts[index].restyle(item);
      });
      runtime.wake(800);
      return;
    }
    // Con una pieza fuera (o algo animándose) no se reacomoda: se aplica después.
    if (isOut(stage) || runtime.isRunning()) {
      pendingItems = items;
      return;
    }
    pendingItems = null;
    const first = parts.length === 0;
    model.resize(items.length);
    const previous = new Map(parts.map((part) => [part.item.id, part]));
    const next = items.map((item, index) => {
      const existing = previous.get(item.id);
      if (existing) {
        previous.delete(item.id);
        existing.index = index;
        existing.item = item;
        existing.restyle(item);
        return existing;
      }
      const created = model.createPart(item, index, items.length);
      setPose(created, model.rest(index, items.length));
      if (!first) created.group.scale.setScalar(0.001);
      model.group.add(created.group);
      return created;
    });
    const removed = [...previous.values()];
    if (activeId && !next.some((part) => part.item.id === activeId)) {
      activeId = null;
      if (stage === "focused") stage = "open";
    }
    parts = next;
    indexParts();
    if (first) {
      runtime.setFraming(frameNow);
      return;
    }
    await runtime.play((tl) => {
      // Las que se van se encogen; las nuevas crecen en su lugar; todas se reacomodan.
      removed.forEach((part) => tl.to(part.group.scale, { x: 0.001, y: 0.001, z: 0.001, duration: d(0.3), ease: "power2.in" }, 0));
      tl.call(() => removed.forEach((part) => part.dispose()), [], d(0.32));
      parts.forEach((part) => {
        const focused = stage === "focused" && part.item.id === activeId;
        toPose(tl, part, focused ? model.focus(part.index, count()) : model.rest(part.index, count()), d(0.12) + part.index * d(0.03), d(0.55), "back.out(1.3)");
      });
      runtime.cameraTo(tl, frameNow, 0, d(0.7));
    });
  }
  runtime.onSettled(() => {
    const pending = pendingItems;
    if (pending && !isOut(stage)) void setEnvelopes(pending);
  });

  // ── Puntero ───────────────────────────────────────────────────────────────
  const partOf = (object: THREE.Object3D | null): SlotPart | undefined => {
    const id = object?.userData.envelopeId as EnvelopeId | undefined;
    return id ? byId.get(id) : undefined;
  };
  function setHover(next: SlotPart | null) {
    if (next === hovered) return;
    const offset = model.hoverOffset;
    if (hovered) runtime.tween(hovered.hover.position, { x: 0, y: 0, z: 0, duration: d(0.3), ease: "power2.out" });
    if (next) runtime.tween(next.hover.position, { x: offset.x, y: offset.y, z: offset.z, duration: d(0.3), ease: "power2.out" });
    hovered = next;
    runtime.markDirty(400);
  }
  function clearHover() {
    setHover(null);
  }

  runtime.setHandlers({
    targets: () => targets,
    hover: (object) => {
      const part = partOf(object);
      const canHover = stage === "open" || stage === "focused";
      setHover(canHover && part && part.item.id !== activeId ? part : null);
      if (stage === "closed") return Boolean(object);
      if (isOut(stage)) return part?.item.id === activeId;
      return Boolean(part);
    },
    tap: (object) => {
      const part = partOf(object);
      if (part) intentListener?.({ type: "envelope", id: part.item.id });
      else if (object) intentListener?.({ type: "binder" });
    },
    swipe: (direction, startedOn) => intentListener?.({ type: "swipe", direction, envelope: partOf(startedOn)?.item.id }),
    // La pieza activa sigue un poco al dedo en vertical; al soltar vuelve.
    drag: (_dx, dy) => {
      const part = activeId ? byId.get(activeId) : undefined;
      if (part && (stage === "focused" || stage === "extracted")) part.hover.position.y = THREE.MathUtils.clamp(-dy / 400, -0.25, 0.35);
    },
    release: () => {
      const part = activeId ? byId.get(activeId) : undefined;
      if (part) runtime.tween(part.hover.position, { y: 0, duration: d(0.3), ease: "power2.out" });
    },
    touchAction: () => (stage === "closed" || stage === "open" ? "pan-y" : "none"),
  });

  runtime.setFraming(frameNow);
  runtime.start();

  const api: OrganizerSceneApi = {
    open,
    close,
    focus,
    extract,
    returnEnvelope,
    clearFocus,
    openEnvelope,
    closeEnvelope,
    showDocuments: () => undefined,
    pickDocument,
    returnDocument,
    transfer,
    restyleEnvelope,
    setEnvelopes,
    setSafeArea: runtime.setSafeArea,
    onIntent: (callback) => {
      intentListener = callback;
    },
    dispose: () => {
      intentListener = null;
      flyingTokens?.dispose();
      flyingTokens = null;
      parts.forEach((part) => part.dispose());
      parts = [];
      model.dispose();
      runtime.dispose();
    },
  };
  return api;
}
