import { fitDistance, fovFor, frameFor, presentDepth, rigFor, subFov, WIDE_ASPECT, type Viewport } from "../scene/framing";
import { BINDER, ENVELOPE, focusPose, RINGS, slotPose } from "../scene/layout";
import { envelopesMock } from "../mocks/envelopes.mock";

const vp = (aspect: number): Viewport => ({ aspect, fov: fovFor(aspect) });

describe("bolsillos de los sobres", () => {
  const flat = envelopesMock.map((_, index) => slotPose(index));
  const fanned = envelopesMock.map((_, index) => slotPose(index, true));

  it("los seis sobres caben dentro de la tapa trasera", () => {
    for (const pose of flat) {
      expect(pose.y + ENVELOPE.height / 2).toBeLessThan(BINDER.height / 2);
      expect(pose.y - ENVELOPE.height / 2).toBeGreaterThan(-BINDER.height / 2);
      expect(pose.x + ENVELOPE.width / 2).toBeLessThan(BINDER.width / 2);
    }
  });

  it("cerrada, los sobres quedan planos entre la tapa trasera y la delantera", () => {
    for (const pose of flat) {
      expect(pose.rx).toBe(0);
      expect(pose.z).toBeGreaterThan(BINDER.backZ + BINDER.panel / 2);
      expect(pose.z + 0.06).toBeLessThan(BINDER.frontZ);
    }
  });

  it("abierta, se levantan en abanico sin mover su borde inferior", () => {
    flat.forEach((pose, index) => {
      const fan = fanned[index];
      const half = ENVELOPE.height / 2;
      expect(fan.rx).toBeGreaterThan(0);
      // Borde inferior: y - half·cos(rx), z - half·sin(rx)
      expect(fan.y - half * Math.cos(fan.rx)).toBeCloseTo(pose.y - half);
      expect(fan.z - half * Math.sin(fan.rx)).toBeCloseTo(pose.z);
    });
  });

  it("cada encabezado queda a la vista y en orden", () => {
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i - 1].y - flat[i].y).toBeCloseTo(ENVELOPE.stagger);
      expect(flat[i].z).toBeGreaterThan(flat[i - 1].z);
    }
  });

  it("las anillas atraviesan el borde izquierdo de la pila", () => {
    const left = flat[0].x - ENVELOPE.width / 2;
    expect(Math.abs(left - RINGS.x)).toBeLessThan(RINGS.radius);
    expect(RINGS.z - RINGS.radius).toBeLessThan(flat[0].z);
    expect(RINGS.z + RINGS.radius).toBeGreaterThan(flat[flat.length - 1].z);
  });

  it("enfocar sube el sobre dentro de su plano, sin alcanzar al de enfrente", () => {
    const slot = slotPose(2, true);
    const focus = focusPose(2);
    expect(focus.y).toBeGreaterThan(slot.y);
    expect(focus.x).toBe(slot.x);
    expect(focus.rx).toBe(slot.rx);
    expect(focus.z).toBeLessThan(slotPose(3, true).z + 0.2);
  });
});

describe("encuadre", () => {
  it("más angosto → cámara más lejos", () => {
    const box = frameFor("closed", 1);
    expect(fitDistance(box, 30, 0.6)).toBeGreaterThan(fitDistance(box, 30, 1.6));
  });

  it("en pantallas anchas entran los sobres, la correa y media tapa abierta", () => {
    const box = frameFor("open", 1.8);
    expect(box.cx - box.width / 2).toBeLessThanOrEqual(-BINDER.width);
    expect(box.cx + box.width / 2).toBeGreaterThan(BINDER.width / 2 + 0.5);
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
    const rig = rigFor("closed", vp(1.5));
    expect(Math.abs(rig.tx)).toBeLessThan(0.5);
    expect(rig.distance).toBeGreaterThan(0);
  });

  it("una franja más baja del lienzo equivale a un FOV menor", () => {
    expect(subFov(30, 1)).toBeCloseTo(30);
    expect(subFov(30, 0.5)).toBeLessThan(15.5);
    expect(subFov(30, 0.5)).toBeGreaterThan(14.5);
  });

  it("el sobre extraído cabe completo en móvil y en escritorio", () => {
    for (const aspect of [0.7, 0.85, 1.1, 1.7, 2.2]) {
      const viewport = vp(aspect);
      const rig = rigFor("open", viewport);
      const z = presentDepth(rig, viewport, ENVELOPE.width, ENVELOPE.height);
      const tan = Math.tan((viewport.fov * Math.PI) / 360);
      expect(z).toBeGreaterThan(0);
      expect(ENVELOPE.width / 2).toBeLessThan((rig.distance - z) * tan * aspect);
    }
  });
});
