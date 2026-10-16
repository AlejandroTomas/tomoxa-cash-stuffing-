import { classifyGesture, swipeCommand } from "../domain/gestures";
import { initialView, type OrganizerView } from "../domain/organizerView";

const view = (stage: OrganizerView["stage"], activeId: OrganizerView["activeId"] = null, documentId: string | null = null): OrganizerView => ({ stage, activeId, documentId });

describe("classifyGesture", () => {
  it("toque si apenas se movió", () => expect(classifyGesture({ dx: 4, dy: -6, dt: 120 })).toBe("tap"));
  it("deslizamiento largo, aunque sea lento", () => {
    expect(classifyGesture({ dx: -90, dy: 10, dt: 900 })).toBe("left");
    expect(classifyGesture({ dx: 5, dy: 120, dt: 900 })).toBe("down");
  });
  it("deslizamiento corto pero rápido (flick)", () => expect(classifyGesture({ dx: 0, dy: -35, dt: 50 })).toBe("up"));
  it("ni toque ni gesto: arrastre corto y lento", () => expect(classifyGesture({ dx: 30, dy: 0, dt: 600 })).toBeNull());
  it("gana el eje dominante", () => expect(classifyGesture({ dx: 70, dy: -50, dt: 200 })).toBe("right"));
});

describe("swipeCommand", () => {
  it("cerrada: a la izquierda abre", () => {
    expect(swipeCommand(initialView, "left")).toEqual({ kind: "action", action: { type: "OPEN" } });
    expect(swipeCommand(initialView, "right")).toBeNull();
  });
  it("abierta: horizontal cambia de sobre (izquierda = siguiente)", () => {
    expect(swipeCommand(view("open"), "left")).toEqual({ kind: "stepEnvelope", direction: 1 });
    expect(swipeCommand(view("open"), "right")).toEqual({ kind: "stepEnvelope", direction: -1 });
  });
  it("arriba sobre un sobre: lo saca ya abierto", () => {
    expect(swipeCommand(view("open"), "up", { envelope: "cash" })).toEqual({ kind: "action", action: { type: "OPEN_ENVELOPE", id: "cash" } });
    expect(swipeCommand(view("open"), "up")).toBeNull();
  });
  it("sobre abierto: horizontal recorre documentos, abajo lo regresa, arriba saca el tocado", () => {
    expect(swipeCommand(view("browsing", "card"), "left")).toEqual({ kind: "stepDocument", direction: 1 });
    expect(swipeCommand(view("browsing", "card"), "down")).toEqual({ kind: "action", action: { type: "CLOSE_ENVELOPE" } });
    expect(swipeCommand(view("browsing", "card"), "up", { document: "card-02" })).toEqual({ kind: "action", action: { type: "PICK_DOCUMENT", id: "card-02" } });
  });
  it("documento fuera: abajo lo regresa", () =>
    expect(swipeCommand(view("reading", "card", "card-01"), "down")).toEqual({ kind: "action", action: { type: "RETURN_DOCUMENT" } }));
});
