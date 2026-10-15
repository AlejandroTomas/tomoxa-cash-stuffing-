import { fitDistance, fovFor, frameFor, presentDepth, rigFor, WIDE_ASPECT } from "../scene/framing";
import { BINDER, ENVELOPE, focusPose, RINGS, slotPose } from "../scene/layout";
import { envelopesMock } from "../mocks/envelopes.mock";

describe("bolsillos de los sobres", () => {
  const poses = envelopesMock.map((_, index) => slotPose(index));

  it("los seis sobres caben dentro de la tapa trasera", () => {
    for (const pose of poses) {
      expect(pose.y + ENVELOPE.height / 2).toBeLessThan(BINDER.height / 2);
      expect(pose.y - ENVELOPE.height / 2).toBeGreaterThan(-BINDER.height / 2);
      expect(pose.x + ENVELOPE.width / 2).toBeLessThan(BINDER.width / 2);
    }
  });

  it("quedan entre la tapa trasera y la delantera cerrada", () => {
    for (const pose of poses) {
      expect(pose.z).toBeGreaterThan(BINDER.backZ + BINDER.panel / 2);
      expect(pose.z + 0.05).toBeLessThan(BINDER.frontZ);
    }
  });

  it("cada encabezado queda a la vista y en orden", () => {
    for (let i = 1; i < poses.length; i++) {
      expect(poses[i - 1].y - poses[i].y).toBeCloseTo(ENVELOPE.stagger);
      expect(poses[i].z).toBeGreaterThan(poses[i - 1].z);
    }
  });

  it("las anillas atraviesan el borde izquierdo de la pila", () => {
    const left = poses[0].x - ENVELOPE.width / 2;
    expect(Math.abs(left - RINGS.x)).toBeLessThan(RINGS.radius);
    expect(RINGS.z - RINGS.radius).toBeLessThan(poses[0].z);
    expect(RINGS.z + RINGS.radius).toBeGreaterThan(poses[poses.length - 1].z);
  });

  it("enfocar sube el sobre sin sacarlo de su plano", () => {
    const slot = slotPose(2);
    const focus = focusPose(2);
    expect(focus.y).toBeGreaterThan(slot.y);
    expect(focus.x).toBe(slot.x);
    // No debe alcanzar al sobre de enfrente.
    expect(focus.z).toBeLessThan(slotPose(3).z);
  });
});

describe("encuadre", () => {
  const fov = 30;

  it("más angosto → cámara más lejos", () => {
    const box = frameFor("closed", 1);
    expect(fitDistance(box, fov, 0.6)).toBeGreaterThan(fitDistance(box, fov, 1.6));
  });

  it("en pantallas anchas la carpeta abierta entra completa", () => {
    const box = frameFor("open", 1.8);
    expect(box.cx - box.width / 2).toBeLessThan(-BINDER.width * 1.5);
    expect(box.cx + box.width / 2).toBeGreaterThan(BINDER.width / 2);
  });

  it("en móvil vertical se priorizan los sobres sin recortarlos", () => {
    const box = frameFor("open", 0.8);
    expect(0.8).toBeLessThan(WIDE_ASPECT);
    expect(box.cx - box.width / 2).toBeLessThan(slotPose(0).x - ENVELOPE.width / 2);
    expect(box.cx + box.width / 2).toBeGreaterThan(slotPose(5).x + ENVELOPE.width / 2);
  });

  it("el encuadre cerrado incluye el lomo y la correa", () => {
    const box = frameFor("closed", 0.7);
    expect(box.cx - box.width / 2).toBeLessThan(-BINDER.width / 2 - 0.5);
    expect(box.cx + box.width / 2).toBeGreaterThan(BINDER.width / 2);
  });

  it("la cámara cerrada mira al centro de la carpeta", () => {
    const rig = rigFor("closed", 1.5);
    expect(Math.abs(rig.tx)).toBeLessThan(0.5);
    expect(rig.distance).toBeGreaterThan(0);
  });

  it("el sobre extraído cabe completo en móvil y en escritorio", () => {
    for (const aspect of [0.7, 0.85, 1.1, 1.7, 2.2]) {
      const rig = rigFor("open", aspect);
      const z = presentDepth(rig, aspect, ENVELOPE.width, ENVELOPE.height);
      const tan = Math.tan((fovFor(aspect) * Math.PI) / 360);
      const halfVisibleWidth = (rig.distance - z) * tan * aspect;
      expect(z).toBeGreaterThan(0);
      expect(ENVELOPE.width / 2).toBeLessThan(halfVisibleWidth);
    }
  });
});
