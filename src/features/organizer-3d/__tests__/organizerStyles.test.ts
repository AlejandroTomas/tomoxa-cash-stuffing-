import { isOrganizerStyle, ORGANIZER_STYLES, parseOrganizerStyle, styleInfo } from "../domain/organizerStyle";
import { CABINET, CABINET_VIEW, cabinetFrame, cabinetSize, cellCenter, drawerExitPath, drawerAjar, drawerPresent, drawerRest, drawerSize, rowsFor } from "../scene/cabinet/cabinetLayout";
import { FILES, FILES_VIEW, filesSize, folderExitPath, folderAjar, folderPresent, folderRest } from "../scene/files/filesLayout";
import { apparentSize, facing, normalize, type Pose } from "../scene/slotModel";

describe("estilo del organizador", () => {
  it("lo guardado inválido o vacío vuelve a la carpeta", () => {
    expect(parseOrganizerStyle("cabinet")).toBe("cabinet");
    expect(parseOrganizerStyle("files")).toBe("files");
    expect(parseOrganizerStyle(null)).toBe("binder");
    expect(parseOrganizerStyle("tablero")).toBe("binder");
    expect(isOrganizerStyle("binder")).toBe(true);
  });
  it("cada estilo tiene nombre y textos para el botón", () => {
    expect(ORGANIZER_STYLES.map((style) => style.id)).toEqual(["binder", "cabinet", "files"]);
    for (const style of ORGANIZER_STYLES) expect(styleInfo(style.id).openLabel.length).toBeGreaterThan(0);
  });
});

describe("cuentas de cámara", () => {
  it("una cara mirando a la cámara queda de frente a la dirección de vista", () => {
    const { rx, ry } = facing(normalize({ x: 0, y: 0, z: 1 }));
    expect(rx).toBeCloseTo(0);
    expect(ry).toBeCloseTo(0);
    // Vista desde arriba a la izquierda: gira hacia la izquierda (ry < 0) y se inclina hacia arriba (rx < 0).
    const angled = facing(CABINET_VIEW);
    expect(angled.ry).toBeLessThan(0);
    expect(angled.rx).toBeLessThan(0);
  });
  it("de frente, el tamaño aparente es el ancho por el alto; de lado se suma el fondo", () => {
    expect(apparentSize({ x: 4, y: 3, z: 2 }, { x: 0, y: 0, z: 1 })).toEqual({ width: 4, height: 3 });
    const angled = apparentSize({ x: 4, y: 3, z: 2 }, CABINET_VIEW);
    expect(angled.width).toBeGreaterThan(4);
    expect(angled.height).toBeGreaterThan(3);
  });
});

const near = (a: Pose, b: Pose) => ["x", "y", "z", "rx", "ry", "rz", "scale"].every((key) => Math.abs(a[key as keyof Pose] - b[key as keyof Pose]) < 1e-9);

describe("cajonera", () => {
  it("dos columnas; las filas crecen con los sobres", () => {
    expect(rowsFor(6)).toBe(3);
    expect(rowsFor(7)).toBe(4);
    expect(rowsFor(1)).toBe(1);
    expect(cabinetSize(8).y).toBeGreaterThan(cabinetSize(6).y);
  });

  it("los huecos no se enciman y quedan dentro de la carcasa", () => {
    const size = cabinetSize(6);
    const cells = Array.from({ length: 6 }, (_, i) => cellCenter(i, 6));
    for (const cell of cells) {
      expect(Math.abs(cell.x) + CABINET.cellWidth / 2).toBeLessThanOrEqual(size.x / 2 - CABINET.wall + 1e-9);
      expect(cell.y - CABINET.cellHeight / 2).toBeGreaterThanOrEqual(CABINET.feet + CABINET.wall - 1e-9);
      expect(cell.y + CABINET.cellHeight / 2).toBeLessThanOrEqual(CABINET.feet + size.y - CABINET.wall + 1e-9);
    }
    // Vecinos de fila separados al menos por el entrepaño.
    expect(cells[0].y - cells[2].y).toBeCloseTo(CABINET.cellHeight + CABINET.divider);
    expect(cells[1].x - cells[0].x).toBeCloseTo(CABINET.cellWidth + CABINET.divider);
  });

  it("al salir, primero libra su hueco y después viene al frente", () => {
    const rest = drawerRest(2, 6);
    const [out, present] = drawerExitPath(2, 6);
    expect(out.x).toBe(rest.x);
    expect(out.y).toBe(rest.y);
    // El fondo del cajón queda fuera de la cara frontal.
    expect(out.z - CABINET.front / 2 - drawerSize().depth).toBeGreaterThan(CABINET.depth / 2);
    expect(near(present, drawerPresent(6))).toBe(true);
    expect(drawerAjar(2, 6).z).toBeGreaterThan(rest.z);
  });

  it("presentado, su fondo no toca la carcasa", () => {
    const present = drawerPresent(6);
    const back = present.z - Math.cos(present.ry) * drawerSize().depth * present.scale;
    expect(back).toBeGreaterThan(CABINET.depth / 2);
  });

  it("vista general más lejos que abierta", () => {
    expect(cabinetFrame("overview", 6).width).toBeGreaterThan(cabinetFrame("open", 6).width);
  });
});

describe("archivador", () => {
  it("las carpetas van en fila sin encimarse, dentro de la bandeja", () => {
    const size = filesSize(6);
    const rests = Array.from({ length: 6 }, (_, i) => folderRest(i, 6));
    for (let i = 1; i < rests.length; i++) expect(rests[i].x - rests[i - 1].x).toBeCloseTo(FILES.folderWidth + FILES.gap);
    expect(rests[0].x - FILES.folderWidth / 2).toBeGreaterThan(-size.x / 2 + FILES.wall);
    expect(rests[5].x + FILES.folderWidth / 2).toBeLessThan(size.x / 2 - FILES.wall);
    // De pie sobre la placa.
    expect(rests[0].y - FILES.folderHeight / 2).toBeGreaterThanOrEqual(FILES.plate);
  });

  it("al salir sube por encima de las paredes, después va al frente y al final se presenta", () => {
    const rest = folderRest(3, 6);
    const [lifted, ahead, present] = folderExitPath(3, 6);
    expect(lifted.x).toBe(rest.x);
    expect(lifted.y - FILES.folderHeight / 2).toBeGreaterThan(FILES.plate + FILES.wallHeight);
    // Al frente, su cara trasera ya libró la pared frontal.
    expect(ahead.z - FILES.folderDepth / 2).toBeGreaterThan(filesSize(6).z / 2);
    expect(ahead.y).toBe(lifted.y);
    expect(near(present, folderPresent(6))).toBe(true);
  });

  it("entreabierta sube pero sigue en su compartimento", () => {
    const ajar = folderAjar(0, 6);
    expect(ajar.y).toBeGreaterThan(folderRest(0, 6).y);
    expect(ajar.y - FILES.folderHeight / 2).toBeLessThan(FILES.plate + FILES.wallHeight);
  });

  it("presentada mira hacia la cámara", () => {
    const present = folderPresent(6);
    expect(present.z).toBeGreaterThan(filesSize(6).z / 2 + FILES.folderDepth / 2);
    expect(Math.sign(present.ry)).toBe(Math.sign(FILES_VIEW.x));
  });
});
