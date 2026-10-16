import * as THREE from "three";
import type { EnvelopeDocument } from "../domain/document";
import { createDocumentStack, type DocumentItem, type DocumentStack } from "./documents";

/** Pose de un documento en coordenadas de su contenedor (sobre, cajón o carpeta). Rotación en orden YXZ. */
export interface DeckPose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
}

/** Dónde van los documentos en un contenedor; cada estilo da el suyo. */
export interface DeckLayout {
  /** Máximo de documentos a la vista; el resto queda en la lista HTML. */
  maxShown: number;
  /** A la vista: `index` 0 = el más reciente (al frente). */
  shown: (index: number, count: number) => DeckPose;
  /** Guardado: `slot` = el lugar a la vista que ocupaba (o su orden), para guardarlo debajo de él. */
  inside: (slot: number, count: number) => DeckPose;
  /** Fuera, para leerse: al frente y de cara a la cámara. */
  reading: DeckPose;
  /**
   * Altura (centro) a la que un documento cruza entre su lugar y el frente: su
   * borde inferior libra la punta de los demás y la boca del contenedor.
   */
  travelY: number;
  /**
   * Por debajo de esta altura (local) no se dibujan: así parece que salen de
   * adentro del cajón o de la carpeta. `null` = sin recorte (el sobre los oculta).
   */
  clipY: number | null;
}

export interface DocumentDeck {
  readonly group: THREE.Group;
  readonly pickedId: string | null;
  has: (id: string) => boolean;
  /** Cambia cuáles se ven (filtro); se aplica con `arrange`. */
  setShown: (visibleIds: readonly string[]) => void;
  /** Lleva cada documento a su lugar (a la vista o guardado). Respeta el que está fuera. */
  arrange: (tl: gsap.core.Timeline, at: number, stagger: number) => void;
  /** Saca `id` para leerlo (el que estaba fuera regresa antes). Devuelve cuándo termina. */
  pick: (tl: gsap.core.Timeline, id: string, at: number) => number;
  /** Regresa el que está fuera a su lugar. Devuelve cuándo termina. */
  putBack: (tl: gsap.core.Timeline, at: number) => number;
  /** Guarda todos (el que está fuera, por arriba). Devuelve cuándo termina. */
  stowAll: (tl: gsap.core.Timeline, at: number) => number;
  dispose: () => void;
}

const PHASE = { up: 0.3, across: 0.35, down: 0.4 } as const;

/**
 * Documentos de un contenedor abierto. Solo se mueve el que sale o regresa:
 * sube en su plano hasta librar la punta de los demás, cruza a esa altura y
 * baja (como los sobres). Las animaciones se agregan a timelines de quien llama.
 */
export function createDocumentDeck(
  holder: THREE.Object3D,
  documents: readonly EnvelopeDocument[],
  visibleIds: readonly string[],
  layout: DeckLayout,
  d: (seconds: number) => number,
  maxAnisotropy: number,
): DocumentDeck {
  const stack: DocumentStack = createDocumentStack(documents, maxAnisotropy);
  holder.add(stack.group);
  let shown = [...visibleIds];
  let pickedId: string | null = null;
  /** Lugar a la vista que ocupa cada documento (-1 = guardado). */
  const slotOf = new Map<string, number>();

  // ── Recorte: un plano en mundo que sigue al contenedor cuadro a cuadro ────
  const clipPlane = new THREE.Plane();
  const clipNormal = new THREE.Vector3();
  const clipPoint = new THREE.Vector3();
  const clipping = layout.clipY !== null;
  function updateClip() {
    if (layout.clipY === null) return;
    clipNormal.set(0, 1, 0).transformDirection(holder.matrixWorld);
    clipPoint.set(0, layout.clipY, 0).applyMatrix4(holder.matrixWorld);
    clipPlane.setFromNormalAndCoplanarPoint(clipNormal, clipPoint);
  }
  function setClipped(item: DocumentItem, on: boolean) {
    if (!clipping) return;
    item.mesh.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material: THREE.Material) => {
        material.clippingPlanes = on ? [clipPlane] : null;
      });
    });
  }

  const count = () => Math.min(shown.filter((id) => stack.items.has(id)).length, layout.maxShown);
  const fanIds = () => shown.filter((id) => stack.items.has(id)).slice(0, layout.maxShown);

  let order = 0;
  stack.items.forEach((item, id) => {
    item.mesh.rotation.order = "YXZ";
    const index = fanIds().indexOf(id);
    setPose(item.mesh, layout.inside(index >= 0 ? index : order++, count()));
    slotOf.set(id, -1);
    setClipped(item, true);
    if (clipping) item.mesh.onBeforeRender = updateClip;
  });

  function setPose(mesh: THREE.Object3D, pose: DeckPose) {
    mesh.position.set(pose.x, pose.y, pose.z);
    mesh.rotation.set(pose.rx, pose.ry, pose.rz, "YXZ");
    mesh.scale.setScalar(pose.scale);
  }

  function toPose(tl: gsap.core.Timeline, mesh: THREE.Object3D, pose: DeckPose, at: number, duration: number, ease: string) {
    tl.call(() => {
      mesh.visible = true;
    }, [], at);
    tl.to(mesh.position, { x: pose.x, y: pose.y, z: pose.z, duration, ease }, at);
    tl.to(mesh.rotation, { x: pose.rx, y: pose.ry, z: pose.rz, duration, ease }, at);
    tl.to(mesh.scale, { x: pose.scale, y: pose.scale, z: pose.scale, duration, ease }, at);
  }

  /** Misma pose, desplazada en su propio plano hasta la altura `y` (si está inclinado, también cambia z). */
  const alongPlane = (pose: DeckPose, y: number): DeckPose => ({ ...pose, y, z: pose.z + (y - pose.y) * Math.tan(pose.rx) });

  /** Guarda un documento (baja en su plano) y deja de dibujarlo al llegar. */
  function stowOne(tl: gsap.core.Timeline, item: DocumentItem, slot: number, at: number) {
    toPose(tl, item.mesh, layout.inside(slot, count()), at, d(0.35), "power2.in");
    tl.call(() => {
      item.mesh.visible = false;
    }, [], at + d(0.35));
    slotOf.set(item.doc.id, -1);
  }

  /** Su lugar a la vista o, si el filtro lo dejó fuera, guardado. */
  function homeOf(id: string): { pose: DeckPose; slot: number } {
    const index = fanIds().indexOf(id);
    return index >= 0 ? { pose: layout.shown(index, count()), slot: index } : { pose: layout.inside(0, count()), slot: -1 };
  }

  function arrange(tl: gsap.core.Timeline, at: number, stagger: number) {
    const fan = fanIds();
    let stowed = 0;
    stack.items.forEach((item, id) => {
      if (id === pickedId) return;
      const index = fan.indexOf(id);
      const previous = slotOf.get(id) ?? -1;
      if (index < 0) {
        if (previous >= 0 || item.mesh.visible) stowOne(tl, item, previous >= 0 ? previous : stowed++, at);
        return;
      }
      const start = at + index * stagger;
      if (previous === index) {
        toPose(tl, item.mesh, layout.shown(index, fan.length), start, d(0.4), "power2.out");
        return;
      }
      if (clipping && previous >= 0) {
        // Cambia de lugar en el fichero: baja y vuelve a subir en el nuevo, sin cruzar a nadie.
        stowOne(tl, item, previous, at);
        tl.call(() => setPose(item.mesh, layout.inside(index, fan.length)), [], at + d(0.36));
        toPose(tl, item.mesh, layout.shown(index, fan.length), at + d(0.36) + index * stagger, d(0.45), "power2.out");
      } else {
        toPose(tl, item.mesh, layout.shown(index, fan.length), start, d(0.5), clipping ? "power2.out" : "back.out(1.3)");
      }
      slotOf.set(id, index);
    });
  }

  /** Sale: 1) sube en su plano hasta librar a los demás, 2) cruza al frente, 3) baja a leerse delante de todos. */
  function docOut(tl: gsap.core.Timeline, item: DocumentItem, at: number): number {
    const home = homeOf(item.doc.id).pose;
    const up = d(PHASE.up);
    const across = d(PHASE.across);
    const down = d(PHASE.down);
    const mesh = item.mesh;
    const above = alongPlane(home, layout.travelY);
    tl.call(() => {
      mesh.visible = true;
    }, [], at);
    tl.to(mesh.position, { y: above.y, z: above.z, duration: up, ease: "power2.out" }, at);
    tl.to(mesh.rotation, { z: 0, duration: up, ease: "power2.out" }, at);
    // Ya fuera del contenedor: se dibuja entero.
    tl.call(() => setClipped(item, false), [], at + up);
    const { reading } = layout;
    tl.to(mesh.position, { x: reading.x, z: reading.z, duration: across, ease: "power2.inOut" }, at + up);
    tl.to(mesh.rotation, { x: reading.rx, y: reading.ry, z: reading.rz, duration: across, ease: "power2.inOut" }, at + up);
    tl.to(mesh.position, { y: reading.y, duration: down, ease: "power3.out" }, at + up + across);
    tl.to(mesh.scale, { x: reading.scale, y: reading.scale, z: reading.scale, duration: down, ease: "power3.out" }, at + up + across);
    slotOf.set(item.doc.id, -1);
    return at + up + across + down;
  }

  /** Regresa por el mismo camino: sube, va atrás sobre su lugar y baja en su plano (a la vista o guardado). */
  function docBack(tl: gsap.core.Timeline, item: DocumentItem, target: DeckPose, at: number, stow: boolean): { crossed: number; end: number } {
    const up = d(PHASE.up);
    const across = d(PHASE.across);
    const down = d(stow ? 0.35 : PHASE.down);
    const mesh = item.mesh;
    const above = alongPlane(target, layout.travelY);
    tl.to(mesh.position, { y: layout.travelY, duration: up, ease: "power2.out" }, at);
    tl.to(mesh.scale, { x: target.scale, y: target.scale, z: target.scale, duration: up, ease: "power2.out" }, at);
    tl.to(mesh.position, { x: above.x, z: above.z, duration: across, ease: "power2.inOut" }, at + up);
    tl.to(mesh.rotation, { x: target.rx, y: target.ry, z: target.rz, duration: across, ease: "power2.inOut" }, at + up);
    // Vuelve a entrar al contenedor: lo de abajo de la boca se recorta otra vez.
    tl.call(() => setClipped(item, true), [], at + up + across);
    tl.to(mesh.position, { y: target.y, z: target.z, duration: down, ease: stow ? "power2.in" : "power2.out" }, at + up + across);
    const end = at + up + across + down;
    if (stow) {
      tl.call(() => {
        mesh.visible = false;
      }, [], end);
    }
    return { crossed: at + up + across, end };
  }

  function returnTo(tl: gsap.core.Timeline, item: DocumentItem, at: number) {
    const home = homeOf(item.doc.id);
    const result = docBack(tl, item, home.slot >= 0 ? home.pose : layout.inside(0, count()), at, home.slot < 0);
    slotOf.set(item.doc.id, home.slot);
    return result;
  }

  return {
    group: stack.group,
    get pickedId() {
      return pickedId;
    },
    has: (id) => stack.items.has(id),
    setShown: (visible) => {
      shown = [...visible];
    },
    arrange,
    pick: (tl, id, at) => {
      const item = stack.items.get(id);
      if (!item || id === pickedId) return at;
      const previous = pickedId ? stack.items.get(pickedId) : undefined;
      pickedId = id;
      // El nuevo sale cuando el anterior ya cruzó de regreso.
      const start = previous ? returnTo(tl, previous, at).crossed : at;
      return docOut(tl, item, start);
    },
    putBack: (tl, at) => {
      const item = pickedId ? stack.items.get(pickedId) : undefined;
      pickedId = null;
      return item ? returnTo(tl, item, at).end : at;
    },
    stowAll: (tl, at) => {
      const picked = pickedId ? stack.items.get(pickedId) : undefined;
      pickedId = null;
      let end = at + d(0.35);
      if (picked) end = Math.max(end, docBack(tl, picked, layout.inside(0, count()), at, true).end);
      let order = picked ? 1 : 0;
      stack.items.forEach((item, id) => {
        if (item === picked) return;
        const slot = slotOf.get(id) ?? -1;
        if (slot >= 0 || item.mesh.visible) stowOne(tl, item, slot >= 0 ? slot : order++, at);
      });
      return end;
    },
    dispose: () => {
      stack.items.forEach((item) => {
        item.mesh.onBeforeRender = () => undefined;
      });
      stack.dispose();
    },
  };
}
