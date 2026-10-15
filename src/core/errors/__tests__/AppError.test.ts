import {
  AppError,
  DEFAULT_ERROR_MESSAGE,
  NotFoundError,
  ValidationError,
  isErrorStatus,
  toSafeMessage,
} from "@/core/errors";

class OrderClosedError extends ValidationError {}

describe("AppError", () => {
  it("conserva nombre de la subclase, status y datos técnicos", () => {
    const cause = new Error("db down");
    const error = new OrderClosedError("El pedido ya está cerrado.", {
      cause,
      debugMessage: "order 42 status=CLOSED",
      fieldErrors: { status: "cerrado" },
    });

    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("OrderClosedError");
    expect(error.status).toBe(422);
    expect(error.cause).toBe(cause);
    expect(error.fieldErrors).toEqual({ status: "cerrado" });
  });

  it("cada subclase trae un mensaje por defecto pensado para el usuario", () => {
    expect(new NotFoundError().message).toMatch(/No se encontró/);
    expect(new NotFoundError().status).toBe(404);
  });
});

describe("toSafeMessage", () => {
  it("usa el mensaje de un AppError", () => {
    expect(toSafeMessage(new AppError("Sin stock"))).toBe("Sin stock");
  });

  it("nunca filtra el mensaje de un error que no es AppError", () => {
    expect(toSafeMessage(new TypeError("x is undefined"))).toBe(DEFAULT_ERROR_MESSAGE);
    expect(toSafeMessage("boom")).toBe(DEFAULT_ERROR_MESSAGE);
    expect(toSafeMessage({ message: "SQL error near SELECT" })).toBe(DEFAULT_ERROR_MESSAGE);
  });

  it("acepta un fallback propio", () => {
    expect(toSafeMessage(null, "No se pudo guardar")).toBe("No se pudo guardar");
  });
});

it("isErrorStatus compara el status del AppError", () => {
  expect(isErrorStatus(new NotFoundError(), 404)).toBe(true);
  expect(isErrorStatus(new Error("x"), 404)).toBe(false);
});
