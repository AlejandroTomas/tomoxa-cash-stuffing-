import * as THREE from "three";
import { roundedSlab } from "./geometry";

/** Ficha de dinero abstracta (no imita billetes ni monedas reales): papel arena con un símbolo. */
export const TOKEN = { width: 0.95, height: 0.52, depth: 0.018 } as const;

export interface MoneyTokens {
  meshes: THREE.Mesh[];
  dispose: () => void;
}

function tokenTexture(): THREE.CanvasTexture {
  const width = 512;
  const height = Math.round((width * TOKEN.height) / TOKEN.width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f3e2b8";
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 34);
    ctx.fill();
    ctx.strokeStyle = "#cfae6a";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(22, 22, width - 44, height - 44, 22);
    ctx.stroke();
    ctx.fillStyle = "#e7cf94";
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, height * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a6a2c";
    ctx.font = `700 ${Math.round(height * 0.38)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", width / 2, height / 2 + 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** `count` fichas que comparten geometría y materiales; se liberan juntas. */
export function createMoneyTokens(count: number): MoneyTokens {
  const body = roundedSlab(TOKEN.width, TOKEN.height, TOKEN.depth, 0.08, 0.006);
  const face = new THREE.PlaneGeometry(TOKEN.width - 0.01, TOKEN.height - 0.01);
  const texture = tokenTexture();
  const edge = new THREE.MeshStandardMaterial({ color: "#e9d5a4", roughness: 0.8 });
  const print = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, roughness: 0.75, side: THREE.DoubleSide });
  const meshes = Array.from({ length: count }, () => {
    const mesh = new THREE.Mesh(body, edge);
    const front = new THREE.Mesh(face, print);
    front.position.z = TOKEN.depth / 2 + 0.001;
    const back = front.clone();
    back.position.z = -front.position.z;
    back.rotation.y = Math.PI;
    mesh.add(front, back);
    mesh.castShadow = true;
    mesh.visible = false;
    return mesh;
  });
  return {
    meshes,
    dispose: () => {
      meshes.forEach((mesh) => mesh.removeFromParent());
      [body, face, texture, edge, print].forEach((resource) => resource.dispose());
    },
  };
}
