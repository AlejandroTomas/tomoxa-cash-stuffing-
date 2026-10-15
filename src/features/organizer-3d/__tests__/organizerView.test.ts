import { initialView, transitionView, type OrganizerView } from "../domain/organizerView";
import { envelopesMock, neighborEnvelope } from "../mocks/envelopes.mock";

const open = transitionView(initialView, { type: "OPEN" });
const focused = transitionView(open, { type: "FOCUS", id: "card" });
const extracted = transitionView(focused, { type: "EXTRACT" });

describe("transitionView", () => {
  it("empieza cerrada", () => expect(initialView).toEqual({ stage: "closed", activeId: null }));
  it("no enfoca ni extrae con la carpeta cerrada", () => {
    expect(transitionView(initialView, { type: "FOCUS", id: "card" })).toBe(initialView);
    expect(transitionView(initialView, { type: "EXTRACT" })).toBe(initialView);
  });
  it("abre", () => expect(open).toEqual({ stage: "open", activeId: null }));
  it("no extrae sin un sobre enfocado", () => expect(transitionView(open, { type: "EXTRACT" })).toBe(open));
  it("enfoca, extrae y regresa", () => {
    expect(focused).toEqual({ stage: "focused", activeId: "card" });
    expect(extracted).toEqual({ stage: "extracted", activeId: "card" });
    expect(transitionView(extracted, { type: "RETURN" })).toEqual(focused);
  });
  it("no cambia de sobre mientras uno está fuera", () =>
    expect(transitionView(extracted, { type: "FOCUS", id: "fund" })).toBe(extracted));
  it("enfocar el mismo sobre no es una transición", () =>
    expect(transitionView(focused, { type: "FOCUS", id: "card" })).toBe(focused));
  it("suelta el enfoque", () => expect(transitionView(focused, { type: "CLEAR_FOCUS" })).toEqual(open));
  it("cierra desde cualquier estado abierto y no repite el cierre", () => {
    for (const view of [open, focused, extracted] as OrganizerView[]) expect(transitionView(view, { type: "CLOSE" })).toEqual(initialView);
    expect(transitionView(initialView, { type: "CLOSE" })).toBe(initialView);
  });
  it("cada uno de los seis sobres se puede enfocar y extraer", () => {
    for (const { id } of envelopesMock) {
      const view = transitionView(transitionView(open, { type: "FOCUS", id }), { type: "EXTRACT" });
      expect(view).toEqual({ stage: "extracted", activeId: id });
    }
  });
});

describe("neighborEnvelope", () => {
  it("recorre la lista en círculo", () => {
    expect(neighborEnvelope(null, 1)).toBe("available");
    expect(neighborEnvelope(null, -1)).toBe("fund");
    expect(neighborEnvelope("fund", 1)).toBe("available");
    expect(neighborEnvelope("available", -1)).toBe("fund");
    expect(neighborEnvelope("card", 1)).toBe("savings");
  });
});
