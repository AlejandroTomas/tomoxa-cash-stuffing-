import {
  alertService,
  alertStore,
  createAlertStore,
  formatAlertsForCopy,
  getCollectionType,
} from "@/core/alert";
import { AppError, DEFAULT_ERROR_MESSAGE } from "@/core/errors";

describe("createAlertStore", () => {
  it("agrupa alertas idénticas abiertas con un contador", () => {
    const store = createAlertStore(() => 1000);
    const failure = { type: "error" as const, title: "Productos", message: "Sin precio" };

    const first = store.add(failure);
    store.add(failure);
    store.add(failure);
    store.add({ ...failure, message: "Sin código" });

    expect(store.getSnapshot()).toHaveLength(2);
    expect(store.getSnapshot()[0]).toMatchObject({ id: first, count: 3, createdAt: 1000 });
  });

  it("al cerrar una alerta, la siguiente igual empieza de nuevo en ×1", () => {
    const store = createAlertStore();
    const id = store.add({ type: "error", title: "A", message: "x" });
    store.add({ type: "error", title: "A", message: "x" });
    store.remove(id);
    store.add({ type: "error", title: "A", message: "x" });
    expect(store.getSnapshot()).toEqual([expect.objectContaining({ count: 1 })]);
  });

  it("notifica a los suscriptores y no emite si nada cambia", () => {
    const store = createAlertStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    store.clear(); // vacío: no emite
    store.remove("no-existe"); // no emite
    store.add({ type: "info", title: "Hola", message: "Mundo" });
    unsubscribe();
    store.clear();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("cada cambio produce una lista nueva (inmutable para React)", () => {
    const store = createAlertStore();
    const before = store.getSnapshot();
    store.add({ type: "info", title: "a", message: "b" });
    expect(store.getSnapshot()).not.toBe(before);
  });
});

describe("helpers de presentación", () => {
  it("la alerta más grave decide el tipo del panel", () => {
    const store = createAlertStore();
    store.add({ type: "success", title: "a", message: "b" });
    store.add({ type: "warning", title: "a", message: "b" });
    expect(getCollectionType(store.getSnapshot())).toBe("warning");
    store.add({ type: "error", title: "a", message: "b" });
    expect(getCollectionType(store.getSnapshot())).toBe("error");
  });

  it("formatea todas las alertas para copiar, con repeticiones", () => {
    const store = createAlertStore(() => 0);
    store.add({ type: "error", title: "Pedidos", message: "Cerrado" });
    store.add({ type: "error", title: "Pedidos", message: "Cerrado" });
    expect(formatAlertsForCopy(store.getSnapshot())).toMatch(/1\. Pedidos\nCerrado\nRepeticiones: 2/);
  });
});

describe("alertService", () => {
  afterEach(() => alertService.clear());

  it("reportError muestra solo el mensaje seguro", () => {
    alertService.reportError("Pedidos", new Error("ECONNREFUSED 10.0.0.3:5432"));
    alertService.reportError("Pedidos", new AppError("El pedido ya está cerrado."));

    expect(alertStore.getSnapshot().map((alert) => alert.message)).toEqual([
      DEFAULT_ERROR_MESSAGE,
      "El pedido ya está cerrado.",
    ]);
  });

  it("reportErrors agrupa los errores repetidos de un lote", () => {
    alertService.reportErrors("Importación", [
      new AppError("Falta el precio."),
      new AppError("Falta el precio."),
      new AppError("Código duplicado."),
    ]);
    expect(alertStore.getSnapshot().map((alert) => [alert.message, alert.count])).toEqual([
      ["Falta el precio.", 2],
      ["Código duplicado.", 1],
    ]);
  });
});
