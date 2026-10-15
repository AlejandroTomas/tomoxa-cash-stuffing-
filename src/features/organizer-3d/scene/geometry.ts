import * as THREE from "three";

/** Rectángulo redondeado centrado en el origen, en el plano XY. */
export function roundedShape(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  traceRounded(shape, width, height, radius);
  return shape;
}

function traceRounded(path: THREE.Path, width: number, height: number, radius: number) {
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  path.moveTo(x + r, y);
  path.lineTo(x + width - r, y);
  path.quadraticCurveTo(x + width, y, x + width, y + r);
  path.lineTo(x + width, y + height - r);
  path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  path.lineTo(x + r, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
}

/** Losa redondeada con canto biselado, centrada también en Z. */
export function roundedSlab(width: number, height: number, depth: number, radius: number, bevel = 0.02): THREE.BufferGeometry {
  const b = Math.min(bevel, depth / 2.2);
  const geometry = new THREE.ExtrudeGeometry(roundedShape(width - b * 2, height - b * 2, Math.max(radius - b, 0.01)), {
    depth: Math.max(depth - b * 2, 0.001),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -depth / 2 + b);
  return geometry;
}

/** Marco redondeado (rectángulo con hueco): soldaduras del plástico, ribetes. */
export function roundedFrame(width: number, height: number, radius: number, band: number, depth: number): THREE.BufferGeometry {
  const shape = roundedShape(width, height, radius);
  const hole = new THREE.Path();
  traceRounded(hole, width - band * 2, height - band * 2, Math.max(radius - band, 0.02));
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** Contorno redondeado en 3D (plano XY, a la altura `z`), cerrado. */
export function roundedOutline(width: number, height: number, radius: number, z = 0): THREE.CurvePath<THREE.Vector3> {
  const flat = roundedShape(width, height, radius);
  const path = new THREE.CurvePath<THREE.Vector3>();
  const points = flat.getSpacedPoints(160);
  for (let i = 0; i < points.length - 1; i++) {
    path.add(new THREE.LineCurve3(new THREE.Vector3(points[i].x, points[i].y, z), new THREE.Vector3(points[i + 1].x, points[i + 1].y, z)));
  }
  return path;
}

/** Ribete de cuero alrededor de un panel. */
export function pipingGeometry(width: number, height: number, radius: number, thickness: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(roundedShape(width, height, radius).getSpacedPoints(180).slice(0, -1).map((p) => new THREE.Vector3(p.x, p.y, 0)), true);
  return new THREE.TubeGeometry(curve, 220, thickness, 6, true);
}

/**
 * Puntadas a lo largo de un contorno redondeado: una sola InstancedMesh
 * (un draw call) con una cápsula por puntada.
 */
export function stitches(width: number, height: number, radius: number, material: THREE.Material, spacing = 0.11, length = 0.062): THREE.InstancedMesh {
  const shape = roundedShape(width, height, radius);
  const perimeter = shape.getLength();
  const count = Math.floor(perimeter / spacing);
  const geometry = new THREE.CapsuleGeometry(0.011, length, 2, 5);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const p = shape.getPointAt(t);
    const d = shape.getTangentAt(t);
    tangent.set(d.x, d.y, 0).normalize();
    quaternion.setFromUnitVectors(up, tangent);
    matrix.compose(new THREE.Vector3(p.x, p.y, 0), quaternion, new THREE.Vector3(1, 1, 0.55));
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Media caña (lomo de la carpeta): anillo semicircular extruido a lo largo de Y. */
export function spineGeometry(radius: number, thickness: number, height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const outer = radius + thickness / 2;
  const inner = radius - thickness / 2;
  shape.absarc(0, 0, outer, Math.PI / 2, (Math.PI * 3) / 2, false);
  shape.absarc(0, 0, inner, (Math.PI * 3) / 2, Math.PI / 2, true);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height - 0.06,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 24,
  });
  // El perfil vive en XZ (y del shape → z del mundo) y se extruye a lo largo de Y.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height / 2 - 0.03, 0);
  return geometry;
}

/** Puntadas en línea recta horizontal, centradas en el origen. */
export function stitchLine(length: number, material: THREE.Material, spacing = 0.1, stitch = 0.05): THREE.InstancedMesh {
  const count = Math.floor(length / spacing);
  const geometry = new THREE.CapsuleGeometry(0.01, stitch, 2, 5).rotateZ(Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    matrix.makeTranslation(-length / 2 + spacing / 2 + i * spacing, 0, 0);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
