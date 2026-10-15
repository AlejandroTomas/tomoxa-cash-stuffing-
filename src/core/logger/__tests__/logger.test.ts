import { AppError, DEFAULT_ERROR_MESSAGE } from "@/core/errors";
import { registerErrorSink, reportError, type ErrorReport } from "@/core/logger";

describe("reportError", () => {
  it("devuelve el mensaje seguro y manda el detalle a los sinks", () => {
    const reports: ErrorReport[] = [];
    const unregister = registerErrorSink((report) => {
      reports.push(report);
    });

    const message = reportError(new TypeError("cannot read id"), {
      context: "orders.create",
      details: { orderId: "42" },
    });
    unregister();

    expect(message).toBe(DEFAULT_ERROR_MESSAGE);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      context: "orders.create",
      userMessage: DEFAULT_ERROR_MESSAGE,
      name: "TypeError",
      message: "cannot read id",
      details: { orderId: "42" },
    });
  });

  it("conserva el mensaje y el debugMessage de un AppError", () => {
    const reports: ErrorReport[] = [];
    const unregister = registerErrorSink((report) => {
      reports.push(report);
    });

    const message = reportError(new AppError("Sin stock", { debugMessage: "sku 9 qty 0" }));
    unregister();

    expect(message).toBe("Sin stock");
    expect(reports[0].debugMessage).toBe("sku 9 qty 0");
  });

  it("un sink que falla no rompe el reporte", async () => {
    const unregisterSync = registerErrorSink(() => {
      throw new Error("sink sync roto");
    });
    const unregisterAsync = registerErrorSink(async () => {
      throw new Error("sink async roto");
    });

    expect(reportError(new Error("x"))).toBe(DEFAULT_ERROR_MESSAGE);
    unregisterSync();
    unregisterAsync();
    // Deja correr el rechazo del sink async: no debe quedar sin manejar.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
