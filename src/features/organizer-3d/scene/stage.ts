import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
}

/** Píxeles máximos por píxel CSS: nitidez razonable sin castigar GPUs móviles. */
const MAX_PIXEL_RATIO = 1.75;

/**
 * Renderer, cámara y luz de estudio suave: luz principal cálida con sombra,
 * relleno frío discreto, contraluz y un entorno procedural para reflejos
 * (sin descargar HDRIs).
 */
export function createStage(mount: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.8;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "pan-y";
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = envMap;
  scene.environmentIntensity = 0.5;

  scene.add(new THREE.HemisphereLight("#fffaf5", "#e6d6d2", 0.6));

  const key = new THREE.DirectionalLight("#fff3e6", 2);
  key.position.set(-4.5, 6.5, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 7;
  const s = key.shadow.camera;
  s.left = -9;
  s.right = 7;
  s.top = 6;
  s.bottom = -6;
  s.near = 1;
  s.far = 30;
  scene.add(key);

  const fill = new THREE.DirectionalLight("#dbe6ff", 0.55);
  fill.position.set(7, -2, 6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight("#ffe9e4", 0.7);
  rim.position.set(2, 7, -5);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  return {
    renderer,
    scene,
    camera,
    dispose: () => {
      envMap.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
