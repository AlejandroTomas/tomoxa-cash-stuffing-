import { fitDistance, fovFor, frameFor, freeNdc, outsideNdc, presentDepth, rigFor, subFov, WIDE_ASPECT, type Viewport } from "../scene/framing";
import { BINDER, DOCUMENT, ENVELOPE, fanPose, insidePose, labelScale, POCKET_CLEARANCE, pocketClearance, RINGS, slotPose, stackLayout } from "../scene/layout";

const vp = (aspect: number): Viewport => ({ aspect, fov: fovFor(aspect) });

describe("bolsillos de los sobres", () => {
  const flat = Array.from({ length: 6 }, (_, index) => slotPose(index));
  const fanned = Array.from({ length: 6 }, (_, index) => slotPose(index, true));

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

describe("abanico de documentos", () => {
  it("cada documento visible asoma por arriba del sobre y los guardados quedan dentro", () => {
    const top = ENVELOPE.height / 2;
    for (let count = 1; count <= DOCUMENT.maxFan; count++) {
      for (let i = 0; i < count; i++) expect(fanPose(i, count).y + DOCUMENT.height / 2).toBeGreaterThan(top + 0.4);
    }
    expect(insidePose().y + DOCUMENT.height / 2).toBeLessThan(top);
  });

  it("no se sale de los lados del sobre", () => {
    for (let i = 0; i < DOCUMENT.maxFan; i++) {
      const pose = fanPose(i, DOCUMENT.maxFan);
      expect(Math.abs(pose.x) + DOCUMENT.width / 2).toBeLessThan(ENVELOPE.width / 2);
    }
  });

  it("el más reciente (0) queda al frente y a la derecha", () => {
    const newest = fanPose(0, 5);
    const oldest = fanPose(4, 5);
    expect(newest.z).toBeGreaterThan(oldest.z);
    expect(newest.x).toBeGreaterThan(oldest.x);
  });

  it("uno solo va centrado y derecho", () => expect(fanPose(0, 1)).toMatchObject({ x: 0, rz: 0 }));
});

describe("salir y volver al bolsillo sin atravesar", () => {
  it("al subir POCKET_CLEARANCE, el borde inferior libra el borde superior del sobre de enfrente", () => {
    for (let i = 0; i < 5; i++) {
      const own = slotPose(i, true);
      const front = slotPose(i + 1, true);
      const half = ENVELOPE.height / 2;
      const ownBottom = own.y + POCKET_CLEARANCE * Math.cos(own.rx) - half * Math.cos(own.rx);
      const frontTop = front.y + half * Math.cos(front.rx);
      expect(ownBottom).toBeGreaterThan(frontTop + 0.2);
    }
  });
});

describe("cualquier número de sobres", () => {
  it("con 1 a 8 sobres todos caben en la tapa y conservan su orden", () => {
    for (let count = 1; count <= 8; count++) {
      const poses = Array.from({ length: count }, (_, index) => slotPose(index, false, count));
      for (const pose of poses) {
        expect(pose.y + ENVELOPE.height / 2).toBeLessThan(BINDER.height / 2);
        expect(pose.y - ENVELOPE.height / 2).toBeGreaterThan(-BINDER.height / 2);
        expect(pose.z + 0.06).toBeLessThan(BINDER.frontZ);
      }
      for (let i = 1; i < count; i++) expect(poses[i].y).toBeLessThan(poses[i - 1].y);
    }
  });
  it("con más sobres se aprietan, pero siguen librándose al salir del bolsillo", () => {
    expect(stackLayout(8).stagger).toBeLessThan(stackLayout(6).stagger);
    for (const count of [6, 7, 8]) {
      const own = slotPose(2, true, count);
      const front = slotPose(3, true, count);
      const half = ENVELOPE.height / 2;
      expect(own.y + pocketClearance(count) * Math.cos(own.rx) - half * Math.cos(own.rx)).toBeGreaterThan(front.y + half * Math.cos(front.rx) + 0.2);
    }
  });
});

describe("labelScale", () => {
  it("hasta seis sobres la etiqueta es de tamaño completo; con más se achica como la franja visible", () => {
    expect(labelScale(3)).toBe(1);
    expect(labelScale(6)).toBe(1);
    expect(labelScale(8)).toBeLessThan(stackLayout(8).stagger / ENVELOPE.stagger);
    expect(labelScale(8)).toBeLessThan(labelScale(7));
  });
});

describe("dinero que llega de fuera o se va", () => {
  // Lienzo de 1000×800 con la barra arriba (100 px) y la tarjeta a la derecha (300 px).
  const free = freeNdc(1000, 800, { top: 100, right: 300, bottom: 20, left: 8 });

  it("la zona libre descuenta lo que tapa la interfaz", () => {
    expect(free.top).toBeCloseTo(0.75);
    expect(free.right).toBeCloseTo(0.4);
    expect(free.bottom).toBeCloseTo(-0.95);
  });

  it("aparece arriba a la derecha del sobre cuando hay espacio", () => {
    expect(outsideNdc({ x: -0.5, y: 0 }, free)).toEqual({ x: -0.2, y: 0.3 });
  });

  it("nunca queda bajo la barra ni la tarjeta", () => {
    const point = outsideNdc({ x: 0.3, y: 0.6 }, free);
    expect(point.x).toBeCloseTo(0.28);
    expect(point.y).toBeCloseTo(0.63);
  });

  it("si la zona es más chica que la holgura, se queda en su centro", () => {
    const tiny = { left: 0, right: 0.1, bottom: 0, top: 0.1 };
    expect(outsideNdc({ x: 0.9, y: 0.9 }, tiny)).toEqual({ x: 0.05, y: 0.05 });
  });
});
