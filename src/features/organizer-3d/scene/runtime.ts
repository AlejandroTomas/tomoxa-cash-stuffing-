import * as THREE from "three";
import { gsap } from "gsap";
import { classifyGesture, TAP_SLOP, type SwipeDirection } from "../domain/gestures";
import type { SafeArea } from "./contract";
import { fitDistance, fovFor, freeNdc, outsideNdc, subFov, type Viewport } from "./framing";
import { createMaterialKit, type MaterialKit } from "./materials";
import type { FrameTarget, Vec3 } from "./slotModel";
import { createStage } from "./stage";

/** Tras cuánto tiempo sin interacción (ms) la escena deja de dibujarse hasta que algo cambie. */
const IDLE_MS = 6000;
/** Cuadros (ms) por encima de los cuales se baja la resolución del render (~40 fps). */
const SLOW_FRAME_MS = 25;

/** Cámara: mira a `target` desde `distance` en la dirección de la vista. */
export interface Rig {
  tx: number;
  ty: number;
  tz: number;
  distance: number;
}

export interface PointerHandlers {
  /** Objetos que responden al puntero (se prueban con sus hijos). */
  targets: () => THREE.Object3D[];
  /** Mouse encima de algo (o de nada); devuelve si es interactivo (cursor de mano). */
  hover: (hit: THREE.Object3D | null) => boolean;
  tap: (hit: THREE.Object3D | null) => void;
  swipe: (direction: SwipeDirection, startedOn: THREE.Object3D | null) => void;
  /** El dedo arrastra sin soltar (px desde donde empezó). */
  drag?: (dx: number, dy: number) => void;
  release?: () => void;
  /** "pan-y" deja desplazar la página con el dedo; "none" da todos los gestos al lienzo. */
  touchAction: () => "pan-y" | "none";
}

/**
 * Infraestructura común de las escenas de ranuras: renderer y luz de estudio
 * (`createStage`), materiales compartidos, cámara encuadrada en la zona libre,
 * un solo bucle de render que se duerme en reposo y baja la resolución si el
 * equipo no da, timelines de GSAP y gestos. Lo propio de cada organizador
 * (geometría, poses) no vive aquí.
 */
export function createSceneRuntime(mount: HTMLElement, viewDir: Vec3) {
  const { renderer, scene, camera, dispose: disposeStage } = createStage(mount);
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const view = new THREE.Vector3(viewDir.x, viewDir.y, viewDir.z).normalize();

  let awakeUntil = performance.now() + IDLE_MS;
  const wake = (ms = IDLE_MS) => {
    awakeUntil = Math.max(awakeUntil, performance.now() + ms);
  };
  const loading = new THREE.LoadingManager(() => wake(500));
  loading.onProgress = () => wake(500);
  void document.fonts?.ready.then(() => wake(500));
  const kit: MaterialKit = createMaterialKit(maxAnisotropy, loading);

  // root: paralaje sutil con el puntero. El organizador y sus piezas cuelgan de aquí.
  const root = new THREE.Group();
  scene.add(root);

  // La mesa: recibe la sombra (no se ve; el fondo es la foto de la interfaz).
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), kit.shadowCatcher);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const d = (seconds: number) => (reducedMotion ? 0 : seconds);
  let disposed = false;
  let visible = true;

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
  /** Cámara que deja `target` completo a la vista en la zona libre. */
  function fit(target: FrameTarget): Rig {
    const vp = viewport();
    return { tx: target.center.x, ty: target.center.y, tz: target.center.z, distance: fitDistance({ cx: 0, cy: 0, width: target.width, height: target.height }, vp.fov, vp.aspect, 1) };
  }
  const rig: Rig = { tx: 0, ty: 0, tz: 0, distance: 12 };
  /** Encuadre a usar cuando cambia el tamaño (lo pone la escena según su estado). */
  let framing: (() => FrameTarget) | null = null;
  function applyCamera() {
    camera.position.set(rig.tx + view.x * rig.distance, rig.ty + view.y * rig.distance, rig.tz + view.z * rig.distance);
    camera.lookAt(rig.tx, rig.ty, rig.tz);
  }

  // ── Timelines ─────────────────────────────────────────────────────────────
  // Todo lo de GSAP vive en un contexto para matarlo de un golpe al desmontar.
  const ctx = gsap.context(() => undefined);
  let running: gsap.core.Timeline | null = null;
  let settle: (() => void) | null = null;
  let reframePending = false;
  let shadowsDirtyUntil = 0;
  const afterPlay = new Set<() => void>();
  /** Algo se mueve durante `ms`: sombras al día y escena despierta. */
  function markDirty(ms: number) {
    shadowsDirtyUntil = Math.max(shadowsDirtyUntil, performance.now() + ms);
    wake(ms + 300);
  }

  /**
   * Una animación a la vez: si había otra, salta a su final (nunca deja piezas
   * a medio camino) y empieza la nueva. Resuelve al terminar o al desmontar.
   */
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
            afterPlay.forEach((callback) => callback());
          },
        });
        build(tl);
        running = tl;
        settle = resolve;
        markDirty(tl.duration() * 1000 + 200);
      });
    });
  }

  /** Tween suelto (hover) dentro del contexto, para que se libere al desmontar. */
  function tween(target: gsap.TweenTarget, vars: gsap.TweenVars) {
    ctx.add(() => {
      gsap.to(target, vars);
    });
  }

  /** Lleva la cámara a un encuadre dentro de una timeline. */
  function cameraTo(tl: gsap.core.Timeline, next: () => FrameTarget, at: number, duration: number, ease = "power2.inOut") {
    framing = next;
    tl.to(rig, { ...fit(next()), duration, ease }, at);
  }

  function snapFraming() {
    reframePending = false;
    if (framing) Object.assign(rig, fit(framing()));
  }

  /** Punto "fuera del organizador" cerca de `point`: arriba a la derecha en pantalla, dentro de la zona libre. */
  function outsideOf(point: THREE.Vector3) {
    camera.updateMatrixWorld();
    const ndc = point.clone().project(camera);
    const target = outsideNdc(ndc, freeNdc(canvasSize.width, canvasSize.height, safe));
    return new THREE.Vector3(target.x, target.y, ndc.z).unproject(camera).lerp(camera.position, 0.3);
  }

  // ── Puntero: hover, paralaje y gestos ─────────────────────────────────────
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { x: 0, y: 0, active: false };
  let handlers: PointerHandlers | null = null;
  let downAt: { x: number; y: number; t: number; id: number; hit: THREE.Object3D | null } | null = null;
  let dragging = false;

  function pick(event: PointerEvent): THREE.Object3D | null {
    if (!handlers) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(handlers.targets(), true)[0]?.object ?? null;
  }

  function onPointerMove(event: PointerEvent) {
    wake();
    if (downAt && event.pointerId === downAt.id) {
      const dx = event.clientX - downAt.x;
      const dy = event.clientY - downAt.y;
      if (Math.hypot(dx, dy) > TAP_SLOP) {
        dragging = true;
        if (!running) handlers?.drag?.(dx, dy);
        markDirty(200);
      }
      return;
    }
    if (event.pointerType !== "mouse") return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    pointer.active = true;
    canvas.style.cursor = handlers?.hover(pick(event)) ? "pointer" : "";
  }
  function onPointerLeave() {
    pointer.active = false;
    handlers?.hover(null);
    canvas.style.cursor = "";
  }
  function onPointerDown(event: PointerEvent) {
    wake();
    if (event.button !== 0) return;
    downAt = { x: event.clientX, y: event.clientY, t: performance.now(), id: event.pointerId, hit: pick(event) };
    dragging = false;
  }
  function onPointerUp(event: PointerEvent) {
    if (!downAt || event.pointerId !== downAt.id) return;
    const start = downAt;
    downAt = null;
    const gesture = classifyGesture({ dx: event.clientX - start.x, dy: event.clientY - start.y, dt: performance.now() - start.t });
    if (gesture === "tap") {
      handlers?.tap(pick(event));
      return;
    }
    if (dragging) handlers?.release?.();
    dragging = false;
    if (gesture) {
      if (event.pointerType !== "mouse") navigator.vibrate?.(8);
      handlers?.swipe(gesture, start.hit);
    }
  }
  /** El navegador tomó el gesto (p. ej. para desplazar la página). */
  function onPointerCancel() {
    downAt = null;
    if (dragging) handlers?.release?.();
    dragging = false;
  }
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);

  // ── Tamaño y visibilidad ──────────────────────────────────────────────────
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
  /** ¿Hay algún tween de GSAP corriendo (hover, fichas…)? */
  const anyTweenActive = () => gsap.globalTimeline.getChildren(true, true, false).some((child) => child.isActive());

  /** Si los cuadros salen lentos de forma sostenida, baja la resolución y las sombras (nunca sube: evita oscilar). */
  function adaptQuality(now: number) {
    if (lastRenderAt && now - lastRenderAt < 100) frameTimes.push(now - lastRenderAt);
    lastRenderAt = now;
    if (frameTimes.length < 90) return;
    const average = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
    frameTimes.length = 0;
    if (average <= SLOW_FRAME_MS) return;
    if (pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(canvasSize.width, canvasSize.height, false);
    } else if (renderer.shadowMap.enabled) {
      // Ya en la resolución mínima: sin sombras dinámicas (queda la sombra de contacto).
      renderer.shadowMap.enabled = false;
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.material.needsUpdate = true;
      });
    }
  }

  const loop = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    const awake = running !== null || now < awakeUntil || anyTweenActive();
    if (!awake) {
      lastRenderAt = 0;
      return;
    }
    adaptQuality(now);
    const touchAction = handlers?.touchAction() ?? "pan-y";
    if (canvas.style.touchAction !== touchAction) canvas.style.touchAction = touchAction;
    if (!reducedMotion) {
      // Paralaje: el organizador gira apenas hacia el puntero y "respira" muy poco.
      const tx = pointer.active ? pointer.x * 0.035 : 0;
      const ty = pointer.active ? pointer.y * 0.02 : 0;
      root.rotation.y += (tx + Math.sin(now * 0.00035) * 0.006 - root.rotation.y) * 0.06;
      root.rotation.x += (ty - root.rotation.x) * 0.06;
    }
    applyCamera();
    if (now < shadowsDirtyUntil || tick++ % 8 === 0) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  };

  return {
    renderer,
    scene,
    camera,
    kit,
    root,
    maxAnisotropy,
    reducedMotion,
    d,
    rig,
    wake,
    markDirty,
    play,
    tween,
    cameraTo,
    /** Encuadre sin animación (al montar o al cambiar el tamaño). */
    setFraming: (next: () => FrameTarget) => {
      framing = next;
      snapFraming();
      wake();
    },
    outsideOf,
    isRunning: () => running !== null,
    isDisposed: () => disposed,
    /** Algo que hacer cada vez que termina una animación. */
    onSettled: (callback: () => void) => afterPlay.add(callback),
    setHandlers: (next: PointerHandlers) => {
      handlers = next;
    },
    /** Arranca: mide el lienzo y empieza a dibujar (después de armar la escena). */
    start: () => {
      resize();
      frame = requestAnimationFrame(loop);
    },
    setSafeArea: (area: SafeArea) => {
      const same = area.top === safe.top && area.right === safe.right && area.bottom === safe.bottom && area.left === safe.left;
      if (same || disposed) return;
      safe = area;
      reframe();
      wake();
    },
    dispose: () => {
      disposed = true;
      handlers = null;
      afterPlay.clear();
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
      // Geometrías y materiales que quedaron en la escena (los del kit se liberan con él).
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object instanceof THREE.InstancedMesh) object.dispose();
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      kit.dispose();
      disposeStage();
    },
  };
}

export type SceneRuntime = ReturnType<typeof createSceneRuntime>;
