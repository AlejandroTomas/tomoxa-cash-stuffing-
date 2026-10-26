import { CABINET, CABINET_VIEW, cabinetFrame, cabinetSize, cabinetStandPlacement, cabinetStandReach } from "../scene/cabinet/cabinetLayout";
import { STAND, mergeFrames, standCardTop, standExitPath, standFrame, standRest, standSize } from "../scene/cardStandLayout";
import { filesSize, filesStandPlacement } from "../scene/files/filesLayout";
import { CARD } from "../scene/layout";

const placement = { x: 0, z: 0, ry: 0 };

describe("tarjetero de escritorio", () => {
  it("cada tarjeta de atrás asoma más alto que la de enfrente", () => {
    for (let index = 1; index < 4; index++) {
      expect(standCardTop(index, 4) - standCardTop(index - 1, 4)).toBeGreaterThanOrEqual(STAND.rise * 0.95);
      expect(standRest(index, 4, placement).z).toBeLessThan(standRest(index - 1, 4, placement).z);
    }
  });

  it("al salir sube hasta librar la punta de las de atrás y se presenta a escala de sobre", () => {
    const path = standExitPath(0, 3, placement, CABINET_VIEW, 3);
    const lifted = path[0];
    const bottom = lifted.y - (CARD.height * STAND.cardScale) / 2;
    expect(bottom).toBeGreaterThan(standCardTop(0, 3) - (CARD.height * STAND.cardScale) * 0.7);
    expect(lifted.y + (CARD.height * STAND.cardScale) / 2).toBeGreaterThan(standCardTop(2, 3));
    expect(path[path.length - 1].scale).toBe(1);
  });

  it("en la cajonera va a la izquierda sin chocar, y se presenta delante de su cara", () => {
    const place = cabinetStandPlacement(6, 2);
    expect(place.x + standSize(2).x / 2).toBeLessThan(-cabinetSize(6).x / 2);
    const present = standExitPath(0, 2, place, CABINET_VIEW, cabinetStandReach()).at(-1)!;
    expect(present.z).toBeGreaterThan(CABINET.depth / 2 + 0.5);
  });

  it("en el archivador va a la izquierda de la bandeja", () => {
    const place = filesStandPlacement(6, 3);
    expect(place.x + standSize(3).x / 2).toBeLessThan(-filesSize(6).x / 2);
  });

  it("el encuadre con tarjetero deja ver ambos", () => {
    const base = cabinetFrame("open", 6);
    const box = standFrame(2, cabinetStandPlacement(6, 2), CABINET_VIEW);
    const merged = mergeFrames(base, box, CABINET_VIEW);
    expect(merged.width).toBeGreaterThan(base.width);
    expect(merged.center.x).toBeLessThan(base.center.x);
    expect(mergeFrames(base, base, CABINET_VIEW)).toMatchObject({ width: expect.closeTo(base.width, 6), height: expect.closeTo(base.height, 6) });
  });
});
