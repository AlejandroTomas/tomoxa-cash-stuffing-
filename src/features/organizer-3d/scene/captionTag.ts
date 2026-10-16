import * as THREE from "three";

const WIDTH = 1024;
const HEIGHT = 256;
/** Tamaño de la etiqueta en unidades de escena. */
export const CAPTION_SIZE = { width: 2.1, height: 0.525 } as const;

export interface CaptionTag {
  mesh: THREE.Mesh;
  /** Dibuja los primeros `chars` caracteres de `text` (para la animación de escritura). */
  draw: (text: string, chars: number) => void;
  dispose: () => void;
}

/**
 * Etiqueta de papel sujeta al sobre abierto, con la frase de búsqueda en
 * caligrafía. `fontFamily` es la familia que cargó la app (Caveat).
 */
export function createCaptionTag(fontFamily: string, maxAnisotropy: number): CaptionTag {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const geometry = new THREE.PlaneGeometry(CAPTION_SIZE.width, CAPTION_SIZE.height);
  const mesh = new THREE.Mesh(geometry, material);

  const draw = (text: string, chars: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    // Papel con una sombra suave y un "clip" a la izquierda.
    ctx.shadowColor = "rgba(60, 40, 30, 0.25)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#fffaf0";
    ctx.beginPath();
    ctx.roundRect(16, 16, WIDTH - 32, HEIGHT - 40, 22);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#d9c7a8";
    ctx.beginPath();
    ctx.roundRect(40, 6, 26, 90, 10);
    ctx.fill();
    ctx.fillStyle = "#3a3340";
    ctx.font = `600 104px ${fontFamily}`;
    ctx.textBaseline = "middle";
    ctx.fillText(Array.from(text).slice(0, chars).join(""), 92, HEIGHT / 2 - 4, WIDTH - 130);
    texture.needsUpdate = true;
  };

  return {
    mesh,
    draw,
    dispose: () => {
      mesh.removeFromParent();
      texture.dispose();
      material.dispose();
      geometry.dispose();
    },
  };
}
