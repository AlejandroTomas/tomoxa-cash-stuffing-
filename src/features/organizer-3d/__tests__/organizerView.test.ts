import { backAction, initialView, transitionView, type OrganizerView } from "../domain/organizerView";
import { neighborEnvelope } from "../domain/envelopeView";

const IDS = ["available", "card", "savings", "cash", "week", "fund"];

const open = transitionView(initialView, { type: "OPEN" });
const focused = transitionView(open, { type: "FOCUS", id: "card" });
const extracted = transitionView(focused, { type: "EXTRACT" });
const browsing = transitionView(extracted, { type: "OPEN_ENVELOPE" });
const reading = transitionView(browsing, { type: "PICK_DOCUMENT", id: "card-01" });

describe("transitionView", () => {
  it("empieza cerrada", () => expect(initialView).toEqual({ stage: "closed", activeId: null, documentId: null }));
  it("no enfoca ni extrae con la carpeta cerrada", () => {
    expect(transitionView(initialView, { type: "FOCUS", id: "card" })).toBe(initialView);
    expect(transitionView(initialView, { type: "EXTRACT" })).toBe(initialView);
  });
  it("abre", () => expect(open).toEqual({ stage: "open", activeId: null, documentId: null }));
  it("no extrae sin un sobre enfocado", () => expect(transitionView(open, { type: "EXTRACT" })).toBe(open));
  it("enfoca, extrae y regresa", () => {
    expect(focused).toEqual({ stage: "focused", activeId: "card", documentId: null });
    expect(extracted).toEqual({ stage: "extracted", activeId: "card", documentId: null });
    expect(transitionView(extracted, { type: "RETURN" })).toEqual(focused);
  });
  it("no cambia de sobre mientras uno está fuera", () => {
    for (const view of [extracted, browsing, reading]) expect(transitionView(view, { type: "FOCUS", id: "fund" })).toBe(view);
  });
  it("enfocar el mismo sobre no es una transición", () =>
    expect(transitionView(focused, { type: "FOCUS", id: "card" })).toBe(focused));
  it("suelta el enfoque", () => expect(transitionView(focused, { type: "CLEAR_FOCUS" })).toEqual(open));
  it("cierra desde cualquier estado abierto y no repite el cierre", () => {
    for (const view of [open, focused, extracted, browsing, reading] as OrganizerView[]) expect(transitionView(view, { type: "CLOSE" })).toEqual(initialView);
    expect(transitionView(initialView, { type: "CLOSE" })).toBe(initialView);
  });
  it("cada uno de los seis sobres se puede enfocar y extraer", () => {
    for (const id of IDS) {
      const view = transitionView(transitionView(open, { type: "FOCUS", id }), { type: "EXTRACT" });
      expect(view).toEqual({ stage: "extracted", activeId: id, documentId: null });
    }
  });
});

describe("sobre abierto y documentos", () => {
  it("solo se abre un sobre extraído", () => {
    expect(browsing).toEqual({ stage: "browsing", activeId: "card", documentId: null });
    for (const view of [open, focused]) expect(transitionView(view, { type: "OPEN_ENVELOPE" })).toBe(view);
  });
  it("saca un documento, cambia a otro y lo regresa", () => {
    expect(reading).toEqual({ stage: "reading", activeId: "card", documentId: "card-01" });
    expect(transitionView(reading, { type: "PICK_DOCUMENT", id: "card-02" })).toEqual({ ...reading, documentId: "card-02" });
    expect(transitionView(reading, { type: "PICK_DOCUMENT", id: "card-01" })).toBe(reading);
    expect(transitionView(reading, { type: "RETURN_DOCUMENT" })).toEqual(browsing);
  });
  it("no saca documentos con el sobre cerrado", () => expect(transitionView(extracted, { type: "PICK_DOCUMENT", id: "card-01" })).toBe(extracted));
  it("no cierra el sobre con un documento fuera ni regresa el sobre abierto", () => {
    expect(transitionView(reading, { type: "CLOSE_ENVELOPE" })).toBe(reading);
    expect(transitionView(browsing, { type: "RETURN" })).toBe(browsing);
  });
  it("cierra el sobre", () => expect(transitionView(browsing, { type: "CLOSE_ENVELOPE" })).toEqual(extracted));
});

describe("backAction", () => {
  it("retrocede un nivel a la vez hasta cerrar", () => {
    let view: OrganizerView = reading;
    const stages: string[] = [];
    for (let action = backAction(view.stage); action; action = backAction(view.stage)) {
      view = transitionView(view, action);
      stages.push(view.stage);
    }
    expect(stages).toEqual(["browsing", "extracted", "focused", "open", "closed"]);
  });
});

describe("neighborEnvelope", () => {
  it("recorre la lista en círculo", () => {
    expect(neighborEnvelope(IDS, null, 1)).toBe("available");
    expect(neighborEnvelope(IDS, null, -1)).toBe("fund");
    expect(neighborEnvelope(IDS, "fund", 1)).toBe("available");
    expect(neighborEnvelope(IDS, "available", -1)).toBe("fund");
    expect(neighborEnvelope(IDS, "card", 1)).toBe("savings");
    expect(neighborEnvelope([], null, 1)).toBeNull();
  });
});
