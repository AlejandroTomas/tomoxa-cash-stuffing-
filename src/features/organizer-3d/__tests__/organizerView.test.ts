import { backAction, initialView, transitionView, type OrganizerView } from "../domain/organizerView";
import { neighborEnvelope } from "../domain/envelopeView";

const IDS = ["available", "card", "savings", "cash", "week", "fund"];

const open = transitionView(initialView, { type: "OPEN" });
const browsing = transitionView(open, { type: "OPEN_ENVELOPE", id: "card" });
const reading = transitionView(browsing, { type: "PICK_DOCUMENT", id: "card-01" });

describe("transitionView", () => {
  it("empieza cerrada", () => expect(initialView).toEqual({ stage: "closed", activeId: null, documentId: null }));
  it("abre", () => expect(open).toEqual({ stage: "open", activeId: null, documentId: null }));
  it("no abre un sobre con la carpeta cerrada", () => expect(transitionView(initialView, { type: "OPEN_ENVELOPE", id: "card" })).toBe(initialView));
  it("cierra desde cualquier estado abierto y no repite el cierre", () => {
    for (const view of [open, browsing, reading] as OrganizerView[]) expect(transitionView(view, { type: "CLOSE" })).toEqual(initialView);
    expect(transitionView(initialView, { type: "CLOSE" })).toBe(initialView);
  });
});

describe("sobre abierto y documentos", () => {
  it("un toque saca el sobre ya abierto", () => expect(browsing).toEqual({ stage: "browsing", activeId: "card", documentId: null }));
  it("cada uno de los seis sobres se puede abrir", () => {
    for (const id of IDS) expect(transitionView(open, { type: "OPEN_ENVELOPE", id })).toEqual({ stage: "browsing", activeId: id, documentId: null });
  });
  it("no abre otro sobre mientras uno está fuera", () => {
    for (const view of [browsing, reading]) expect(transitionView(view, { type: "OPEN_ENVELOPE", id: "fund" })).toBe(view);
  });
  it("saca un documento, cambia a otro y lo regresa", () => {
    expect(reading).toEqual({ stage: "reading", activeId: "card", documentId: "card-01" });
    expect(transitionView(reading, { type: "PICK_DOCUMENT", id: "card-02" })).toEqual({ ...reading, documentId: "card-02" });
    expect(transitionView(reading, { type: "PICK_DOCUMENT", id: "card-01" })).toBe(reading);
    expect(transitionView(reading, { type: "RETURN_DOCUMENT" })).toEqual(browsing);
  });
  it("no saca documentos sin un sobre abierto", () => expect(transitionView(open, { type: "PICK_DOCUMENT", id: "card-01" })).toBe(open));
  it("no regresa el sobre con un documento fuera", () => expect(transitionView(reading, { type: "CLOSE_ENVELOPE" })).toBe(reading));
  it("regresa el sobre a la carpeta", () => expect(transitionView(browsing, { type: "CLOSE_ENVELOPE" })).toEqual(open));
});

describe("backAction", () => {
  it("retrocede un nivel a la vez hasta cerrar", () => {
    let view: OrganizerView = reading;
    const stages: string[] = [];
    for (let action = backAction(view.stage); action; action = backAction(view.stage)) {
      view = transitionView(view, action);
      stages.push(view.stage);
    }
    expect(stages).toEqual(["browsing", "open", "closed"]);
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
