import * as THREE from "three";
import type { EnvelopeDocument } from "../domain/document";
import type { EnvelopeId, EnvelopeItem } from "../domain/envelopeView";
import type { OrganizerSceneApi, SceneIntent } from "./contract";
import { createCardStand } from "./cardStand";
import { cardDeck, mergeFrames, standAjar, standExitPath, standFrame, standPresentFrame, standRest } from "./cardStandLayout";
import { createDocumentDeck, type DeckLayout, type DocumentDeck } from "./documentDeck";
import { DOCUMENT } from "./layout";
import { createMoneyTokens, type MoneyTokens } from "./moneyTokens";
import { createSceneRuntime, type SceneRuntime } from "./runtime";
import { facing, type FrameKind, type FrameTarget, type Pose, type SlotDeck, type SlotModel, type SlotPart, type Vec3 } from "./slotModel";
import { createCardGeometries } from "./walletCard";

type SceneStage = "closed" | "open" | "browsing" | "reading";

const isOut = (stage: SceneStage) => stage === "browsing" || stage === "reading";

/**
 * Escena de un organizador "de ranuras" (cajonera, archivador) con el mismo
 * contrato que la carpeta. Las animaciones son genéricas (timelines de GSAP
 * entre poses); `buildModel` aporta la geometría y las poses de cada estilo.
 * Abrir un sobre lo saca, lo presenta y sus documentos asoman como en un
 * fichero (`documentDeck`, el mismo que usa la carpeta de anillas).
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
  // Tarjetas de crédito: de pie en un tarjetero de escritorio junto al organizador.
  const cardGeometries = createCardGeometries();
  const stand = createCardStand(runtime.kit, model.stand.finish, cardGeometries, runtime.maxAnisotropy);
  const cardsLayer = new THREE.Group();
  cardsLayer.add(stand.group);
  root.add(cardsLayer);
  const CARD_DECK: SlotDeck = cardDeck();
  const CARD_HOVER: Vec3 = { x: 0, y: 0.22, z: 0 };

  let stage: SceneStage = "closed";
  let activeId: EnvelopeId | null = null;
  let parts: SlotPart[] = [];
  let cards: SlotPart[] = [];
  let byId = new Map<EnvelopeId, SlotPart>();
  let targets: THREE.Object3D[] = [];
  let pendingItems: readonly EnvelopeItem[] | null = null;
  let intentListener: ((intent: SceneIntent) => void) | null = null;
  let hovered: SlotPart | null = null;
  let flyingTokens: MoneyTokens | null = null;
  let deck: DocumentDeck | null = null;
  let deckOwner: SlotPart | null = null;

  const count = () => Math.max(1, parts.length);
  function indexParts() {
    byId = new Map([...parts, ...cards].map((part) => [part.item.id, part]));
    targets = [model.group, cardsLayer];
  }
  const all = () => [...parts, ...cards];

  // Poses y documentos según sea pieza del organizador o tarjeta del tarjetero.
  const placement = () => model.stand.placement(count(), cards.length);
  const restOf = (part: SlotPart) => (part.kind === "card" ? standRest(part.index, cards.length, placement()) : model.rest(part.index, count()));
  const ajarOf = (part: SlotPart) => (part.kind === "card" ? standAjar(part.index, cards.length, placement()) : model.ajar(part.index, count()));
  const exitOf = (part: SlotPart) =>
    part.kind === "card" ? standExitPath(part.index, cards.length, placement(), viewDir, model.stand.reach(count())) : model.exitPath(part.index, count());
  const deckOf = (part: SlotPart) => (part.kind === "card" ? CARD_DECK : model.deck);
  const hoverOf = (part: SlotPart) => (part.kind === "card" ? CARD_HOVER : model.hoverOffset);
  /** Encuadre del organizador sumándole el tarjetero (si hay tarjetas). */
  function frameOf(kind: FrameKind): FrameTarget {
    const base = model.frame(kind, count());
    if (!cards.length) return base;
    const box = standFrame(cards.length, placement(), viewDir);
    const margin = kind === "overview" ? 1.35 : 1.2;
    return mergeFrames(base, { ...box, width: box.width * margin, height: box.height * margin }, viewDir);
  }

  // ── Encuadres ─────────────────────────────────────────────────────────────
  const openFrame = () => frameOf("open");
  /** Con la pieza presentada: su encuadre, crecido hacia arriba para el documento que cruza por encima (casi entero). */
  const presentFrame = (part: SlotPart): FrameTarget => {
    const frame = part.kind === "card" ? standPresentFrame(cards.length, placement(), viewDir, model.stand.reach(count())) : model.presentFrame(part.index, count());
    const path = exitOf(part);
    const present = path[path.length - 1];
    const deckLayoutOf = deckOf(part);
    const card = deckLayoutOf.shown(0, 1);
    // Hasta un poco arriba del centro del que cruza: es un instante y así la vista normal queda más cerca.
    const travelTop = present.y + (deckLayoutOf.travelY + (DOCUMENT.height / 4) * card.scale) * present.scale;
    const bottom = frame.center.y - frame.height / 2;
    const top = Math.max(frame.center.y + frame.height / 2, travelTop);
    return { ...frame, center: { ...frame.center, y: (top + bottom) / 2 }, height: top - bottom };
  };
  const frameNow = (): FrameTarget => {
    const part = activeId ? byId.get(activeId) : undefined;
    if (stage === "closed") return frameOf("overview");
    if (part && isOut(stage)) return presentFrame(part);
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
      all().forEach((part, order) => {
        const offset = hoverOf(part);
        const at = d(0.35) + order * d(0.07);
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
      const stowed = part && wasOut ? stowDeck(tl, 0) : 0;
      const start = part && wasOut ? returnAlongPath(tl, part, stowed) : 0;
      all().forEach((each) => toPose(tl, each, restOf(each), start, d(0.5), "power2.inOut"));
      runtime.cameraTo(tl, () => frameOf("overview"), start, d(1.1));
    });
  }

  /** Regresa por el mismo camino por el que salió, hasta su lugar. Devuelve cuándo termina. */
  function returnAlongPath(tl: gsap.core.Timeline, part: SlotPart, at: number): number {
    const path = exitOf(part);
    const back = [...path.slice(0, -1).reverse(), restOf(part)];
    const durations = back.length > 2 ? [0.6, 0.45, 0.5] : [0.6, 0.55];
    return followPath(tl, part, back, at, durations);
  }

  /**
   * Giro (local de la pieza presentada) con el que un documento queda de cara a
   * la cámara: el de la cámara menos el de la pieza.
   */
  function readingRotation(part: SlotPart): { rx: number; ry: number; rz: number } {
    const path = exitOf(part);
    const present = path[path.length - 1];
    const face = facing(viewDir);
    const pieceTurn = new THREE.Quaternion().setFromEuler(new THREE.Euler(present.rx, present.ry, present.rz, "YXZ"));
    const cameraTurn = new THREE.Quaternion().setFromEuler(new THREE.Euler(face.rx, face.ry, 0, "YXZ"));
    const local = new THREE.Euler().setFromQuaternion(pieceTurn.invert().multiply(cameraTurn), "YXZ");
    return { rx: local.x, ry: local.y, rz: local.z };
  }

  function deckLayout(part: SlotPart): DeckLayout {
    const { reading, ...layout } = deckOf(part);
    return { ...layout, reading: { ...reading, ...readingRotation(part) } };
  }

  /** Guarda los documentos (el que está fuera, por arriba) y los libera. Devuelve cuándo termina. */
  function stowDeck(tl: gsap.core.Timeline, at: number): number {
    const current = deck;
    const owner = deckOwner;
    if (!current) return at;
    const end = current.stowAll(tl, at);
    tl.call(() => {
      current.dispose();
      if (owner?.contents) owner.contents.visible = true;
      if (deck === current) {
        deck = null;
        deckOwner = null;
      }
    }, [], end);
    return end;
  }

  /** Saca la pieza de su lugar, la presenta y sus documentos asoman en cascada. */
  async function openEnvelope(id: EnvelopeId, documents: readonly EnvelopeDocument[], visibleIds: readonly string[]) {
    const part = byId.get(id);
    if (!part || runtime.isDisposed() || stage !== "open") return;
    stage = "browsing";
    activeId = id;
    clearHover();
    deck?.dispose();
    deck = createDocumentDeck(part.hover, documents, visibleIds, deckLayout(part), d, runtime.maxAnisotropy);
    deckOwner = part;
    const opened = deck;
    await runtime.play((tl) => {
      settleHover(tl, part, 0);
      const path = exitOf(part);
      const durations = path.length > 2 ? [0.5, 0.45, 0.75] : [0.6, 0.8];
      const end = followPath(tl, part, path, 0, durations);
      runtime.cameraTo(tl, () => presentFrame(part), end * 0.3, Math.max(d(0.5), end * 0.75));
      // Ya presentada, el adorno de adentro se va y los documentos suben desde el fondo.
      tl.call(() => {
        if (part.contents) part.contents.visible = false;
      }, [], end - d(0.1));
      opened.arrange(tl, end - d(0.1), d(0.06));
    });
  }

  async function closeEnvelope() {
    const part = activeId ? byId.get(activeId) : undefined;
    if (!part || runtime.isDisposed() || !isOut(stage)) return;
    stage = "open";
    activeId = null;
    await runtime.play((tl) => {
      const stowed = stowDeck(tl, 0);
      settleHover(tl, part, stowed);
      const end = returnAlongPath(tl, part, stowed);
      runtime.cameraTo(tl, openFrame, stowed + (end - stowed) * 0.2, Math.max(d(0.5), (end - stowed) * 0.8));
    });
  }

  function showDocuments(visibleIds: readonly string[]) {
    const current = deck;
    current?.setShown(visibleIds);
    if (!current || runtime.isDisposed() || !isOut(stage) || runtime.isRunning()) return;
    void runtime.play((tl) => current.arrange(tl, 0, d(0.03)));
  }

  async function pickDocument(id: string) {
    const current = deck;
    if (!current?.has(id) || runtime.isDisposed() || !isOut(stage)) return;
    stage = "reading";
    // El que estaba fuera vuelve a su lugar; el nuevo sale cuando aquel ya cruzó.
    await runtime.play((tl) => void current.pick(tl, id, 0));
  }

  async function returnDocument() {
    const current = deck;
    if (!current?.pickedId || runtime.isDisposed() || stage !== "reading") return;
    stage = "browsing";
    await runtime.play((tl) => void current.putBack(tl, 0));
  }

  /** Dónde queda la boca de una pieza cuando está entreabierta (ahí entran o salen las fichas). */
  function mouthWhenOpen(part: SlotPart): THREE.Vector3 {
    const { position, rotation, scale } = part.group;
    const saved = { position: position.clone(), rotation: rotation.clone(), scale: scale.clone() };
    setPose(part, ajarOf(part));
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
   * piezas se entreabren (el cajón sale un tramo, la carpeta sube) para
   * que las fichas caigan dentro a la vista, y después vuelven.
   */
  async function transfer(fromId: EnvelopeId | null, toId: EnvelopeId | null) {
    const from = fromId ? byId.get(fromId) : undefined;
    const to = toId ? byId.get(toId) : undefined;
    if ((fromId && !from) || (toId && !to) || (!from && !to) || from === to || runtime.isDisposed() || stage !== "open") return;
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
        toPose(tl, from, ajarOf(from), 0, opening, "power2.out");
        toPose(tl, from, restOf(from), opening + flight * 0.55, d(0.5), "power2.inOut");
      }
      if (to) {
        toPose(tl, to, ajarOf(to), 0, opening, "power2.out");
        tl.to(to.hover.position, { x: 0, y: -0.04, z: 0, duration: d(0.12), ease: "power2.in" }, arrival);
        tl.to(to.hover.position, { y: 0, duration: d(0.3), ease: "back.out(2)" }, arrival + d(0.12));
        toPose(tl, to, restOf(to), arrival + d(0.25), d(0.5), "power2.inOut");
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
    const pieceItems = items.filter((item) => !item.card);
    const cardItems = items.filter((item) => item.card);
    const same = (list: readonly SlotPart[], next: readonly EnvelopeItem[]) => next.length === list.length && next.every((item, index) => list[index].item.id === item.id);
    if (same(parts, pieceItems) && same(cards, cardItems)) {
      all().forEach((part) => {
        const item = items.find((candidate) => candidate.id === part.item.id);
        if (!item) return;
        part.item = item;
        part.restyle(item);
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
    const first = parts.length === 0 && cards.length === 0;
    model.resize(pieceItems.length);
    const previous = new Map(all().map((part) => [part.item.id, part]));
    const reuse = (item: EnvelopeItem, index: number, isCard: boolean) => {
      const existing = previous.get(item.id);
      if (!existing || (existing.kind === "card") !== isCard) return null;
      previous.delete(item.id);
      existing.index = index;
      existing.item = item;
      existing.restyle(item);
      return existing;
    };
    const created: SlotPart[] = [];
    const nextParts = pieceItems.map((item, index) => {
      const existing = reuse(item, index, false);
      if (existing) return existing;
      const part = model.createPart(item, index, pieceItems.length);
      model.group.add(part.group);
      created.push(part);
      return part;
    });
    const nextCards = cardItems.map((item, index) => {
      const existing = reuse(item, index, true);
      if (existing) return existing;
      const part = stand.createCard(item, index);
      cardsLayer.add(part.group);
      created.push(part);
      return part;
    });
    const removed = [...previous.values()];
    parts = nextParts;
    cards = nextCards;
    indexParts();
    stand.resize(cards.length, placement());
    // Las nuevas nacen en su lugar (crecen desde ahí si no es la primera carga).
    created.forEach((part) => {
      setPose(part, restOf(part));
      if (!first) part.group.scale.setScalar(0.001);
    });
    if (first) {
      runtime.setFraming(frameNow);
      return;
    }
    await runtime.play((tl) => {
      // Las que se van se encogen; las nuevas crecen en su lugar; todas se reacomodan.
      removed.forEach((part) => tl.to(part.group.scale, { x: 0.001, y: 0.001, z: 0.001, duration: d(0.3), ease: "power2.in" }, 0));
      tl.call(() => removed.forEach((part) => part.dispose()), [], d(0.32));
      all().forEach((part, order) => toPose(tl, part, restOf(part), d(0.12) + order * d(0.03), d(0.55), "back.out(1.3)"));
      runtime.cameraTo(tl, frameNow, 0, d(0.7));
    });
  }
  runtime.onSettled(() => {
    const pending = pendingItems;
    if (pending && !isOut(stage)) void setEnvelopes(pending);
  });

  // ── Puntero ───────────────────────────────────────────────────────────────
  const documentOf = (object: THREE.Object3D | null): string | undefined => object?.userData.documentId as string | undefined;
  const partOf = (object: THREE.Object3D | null): SlotPart | undefined => {
    const id = object?.userData.envelopeId as EnvelopeId | undefined;
    return id ? byId.get(id) : undefined;
  };
  function setHover(next: SlotPart | null) {
    if (next === hovered) return;
    if (hovered) runtime.tween(hovered.hover.position, { x: 0, y: 0, z: 0, duration: d(0.3), ease: "power2.out" });
    if (next) {
      const offset = hoverOf(next);
      runtime.tween(next.hover.position, { x: offset.x, y: offset.y, z: offset.z, duration: d(0.3), ease: "power2.out" });
    }
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
      // Cualquier pieza a la vista se puede abrir (también desde la vista general).
      const canHover = stage === "closed" || stage === "open";
      setHover(canHover && part ? part : null);
      if (stage === "closed") return Boolean(object);
      if (isOut(stage)) return Boolean(documentOf(object)) || (Boolean(part) && part?.item.id !== activeId);
      return Boolean(part);
    },
    tap: (object) => {
      const document = documentOf(object);
      if (document) {
        intentListener?.({ type: "document", id: document });
        return;
      }
      const part = partOf(object);
      if (part) intentListener?.({ type: "envelope", id: part.item.id });
      else if (object) intentListener?.({ type: "binder" });
    },
    swipe: (direction, startedOn) => intentListener?.({ type: "swipe", direction, envelope: partOf(startedOn)?.item.id, document: documentOf(startedOn) }),
    // La pieza presentada sigue un poco al dedo en vertical; al soltar vuelve.
    drag: (_dx, dy) => {
      const part = activeId ? byId.get(activeId) : undefined;
      if (part && isOut(stage)) part.hover.position.y = THREE.MathUtils.clamp(-dy / 400, -0.25, 0.35);
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
    openEnvelope,
    closeEnvelope,
    showDocuments,
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
      deck?.dispose();
      deck = null;
      all().forEach((part) => part.dispose());
      parts = [];
      cards = [];
      stand.dispose();
      cardsLayer.removeFromParent();
      Object.values(cardGeometries).forEach((geometry) => geometry.dispose());
      model.dispose();
      runtime.dispose();
    },
  };
  return api;
}
