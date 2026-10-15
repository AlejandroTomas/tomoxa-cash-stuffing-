import * as THREE from "three";

const TEXTURES = "/assets/organizer/textures";

/**
 * Materiales compartidos de la escena. Un solo dueño de texturas y materiales
 * para liberarlos juntos al desmontar (`dispose`).
 */
export interface MaterialKit {
  leather: THREE.MeshStandardMaterial;
  leatherEdge: THREE.MeshStandardMaterial;
  lining: THREE.MeshStandardMaterial;
  stitch: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  zipperTeeth: THREE.MeshStandardMaterial;
  shadowCatcher: THREE.ShadowMaterial;
  contactShadow: THREE.MeshBasicMaterial;
  paper: (tone: string) => THREE.MeshStandardMaterial;
  plastic: (color: string, options: PlasticOptions) => THREE.MeshPhysicalMaterial;
  track: <T extends THREE.Material | THREE.Texture>(resource: T) => T;
  dispose: () => void;
}

export interface PlasticOptions {
  opacity: number;
  roughness?: number;
  clearcoat?: number;
  /** Mezcla con blanco (0 = color puro). Aclara películas delgadas. */
  lighten?: number;
}

export function createMaterialKit(maxAnisotropy: number): MaterialKit {
  const owned = new Set<THREE.Material | THREE.Texture>();
  const track = <T extends THREE.Material | THREE.Texture>(resource: T): T => {
    owned.add(resource);
    return resource;
  };
  const loader = new THREE.TextureLoader();
  const load = (name: string, srgb: boolean, repeat: [number, number]) => {
    const texture = track(loader.load(`${TEXTURES}/${name}.png`));
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    texture.anisotropy = Math.min(4, maxAnisotropy);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  const leatherRepeat: [number, number] = [1.6, 2.1];
  const leatherNormal = load("leather_normal", false, leatherRepeat);
  const leatherRoughness = load("leather_roughness", false, leatherRepeat);
  const plasticNormal = load("plastic_normal", false, [2, 1.4]);
  const paperColor = load("paper_basecolor", true, [1, 1]);

  const leather = track(new THREE.MeshStandardMaterial({
    // Color sólido (rosa empolvado): el albedo del mapa es demasiado saturado; el grano lo dan normal y rugosidad.
    color: "#a8807c",
    normalMap: leatherNormal,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: leatherRoughness,
    roughness: 0.92,
    envMapIntensity: 0.55,
  }));
  const leatherEdge = track(new THREE.MeshStandardMaterial({
    color: "#a87774",
    normalMap: leatherNormal,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.62,
    envMapIntensity: 0.7,
  }));
  // Interior: el mismo cuero, un tono más claro.
  const lining = track(new THREE.MeshStandardMaterial({
    color: "#b38985",
    normalMap: leatherNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: leatherRoughness,
    roughness: 0.95,
    envMapIntensity: 0.45,
  }));
  const stitch = track(new THREE.MeshStandardMaterial({ color: "#fbeee6", roughness: 0.85 }));
  const metal = track(new THREE.MeshStandardMaterial({ color: "#e2c9a6", metalness: 1, roughness: 0.24, envMapIntensity: 1.15 }));
  const chrome = track(new THREE.MeshStandardMaterial({ color: "#d9d6d4", metalness: 1, roughness: 0.2, envMapIntensity: 1.1 }));
  const zipperTeeth = track(new THREE.MeshStandardMaterial({ color: "#f3f1ee", metalness: 0.2, roughness: 0.35 }));
  const shadowCatcher = track(new THREE.ShadowMaterial({ color: "#3d2422", opacity: 0.13, depthWrite: false }));
  const contactShadow = track(new THREE.MeshBasicMaterial({
    map: track(contactShadowTexture()),
    color: "#4a2a28",
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    toneMapped: false,
  }));

  const white = new THREE.Color("#ffffff");
  return {
    leather,
    leatherEdge,
    lining,
    stitch,
    metal,
    chrome,
    zipperTeeth,
    shadowCatcher,
    contactShadow,
    track,
    paper: (tone) =>
      track(new THREE.MeshStandardMaterial({ color: tone, map: paperColor, roughness: 0.95, envMapIntensity: 0.3 })),
    plastic: (color, { opacity, roughness = 0.3, clearcoat = 0.7, lighten = 0 }) =>
      track(new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(color).lerp(white, lighten),
        transparent: true,
        opacity,
        roughness,
        metalness: 0,
        clearcoat,
        clearcoatRoughness: 0.18,
        normalMap: plasticNormal,
        normalScale: new THREE.Vector2(0.18, 0.18),
        envMapIntensity: 0.9,
      })),
    dispose: () => {
      owned.forEach((resource) => resource.dispose());
      owned.clear();
    },
  };
}

/** Sombra de contacto: gradiente radial suave, sin mapas de sombra. */
function contactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
