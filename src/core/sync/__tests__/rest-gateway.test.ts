import {
  AppError,
  ConflictError,
  NetworkError,
  NotFoundError,
  PermissionDeniedError,
  ServerError,
  UnauthenticatedError,
  ValidationError,
} from "@/core/errors";
import type { HttpClient } from "@/core/http";
import { classifySyncError } from "@/core/sync/classify-error";
import { defineEntity } from "@/core/sync/entities";
import { createRestGateway } from "@/core/sync/rest-gateway";

jest.mock("@/core/logger", () => ({ reportError: jest.fn() }));

type Call = { method: string; url: string; body?: unknown; params?: unknown };

function fakeClient(reply: (call: Call) => unknown) {
  const calls: Call[] = [];
  const handle = async (call: Call) => {
    calls.push(call);
    return reply(call);
  };
  const client = {
    get: (url: string) => handle({ method: "GET", url }),
    post: (url: string, body?: unknown) => handle({ method: "POST", url, body }),
    put: (url: string, body?: unknown) => handle({ method: "PUT", url, body }),
    patch: (url: string, body?: unknown) => handle({ method: "PATCH", url, body }),
    delete: (url: string, options?: { params?: unknown }) => handle({ method: "DELETE", url, params: options?.params }),
  } as unknown as HttpClient;
  return { client, calls };
}

const registry = {
  Order: defineEntity({ endpoint: "/api/orders/", versionField: "version", deletedField: "deletedAt" }),
  Note: defineEntity({ endpoint: "/api/notes", updateMethod: "PUT" }),
};

describe("createRestGateway", () => {
  it("arma las rutas REST y normaliza versión y borrado lógico", async () => {
    const { client, calls } = fakeClient(({ method }) =>
      method === "DELETE" ? { id: "o 1", version: 4, deletedAt: "2026-10-15" } : { id: "o 1", total: 10, version: 3, deletedAt: null },
    );
    const gateway = createRestGateway(registry, client);

    await expect(gateway.mutate("Order", "CREATE", { id: "o 1", total: 10 })).resolves.toMatchObject({
      id: "o 1",
      _version: 3,
      _deleted: false,
    });
    await gateway.mutate("Order", "UPDATE", { id: "o 1", total: 12, _version: 3 });
    await expect(gateway.mutate("Order", "DELETE", { id: "o 1", _version: 3 })).resolves.toMatchObject({ _deleted: true });

    expect(calls).toEqual([
      { method: "POST", url: "/api/orders/", body: { id: "o 1", total: 10 } },
      // `_version` del motor viaja como el campo de versión de la API.
      { method: "PATCH", url: "/api/orders/o%201", body: { id: "o 1", total: 12, version: 3 } },
      { method: "DELETE", url: "/api/orders/o%201", params: { version: 3 } },
    ]);
    expect(gateway.usesVersioning("Order")).toBe(true);
  });

  it("respeta PUT, no manda versión si la entidad no la usa y tolera respuestas vacías", async () => {
    const { client, calls } = fakeClient(() => undefined);
    const gateway = createRestGateway(registry, client);

    await expect(gateway.mutate("Note", "UPDATE", { id: "n1", text: "hola", _version: 9 })).resolves.toBeNull();
    expect(calls[0]).toEqual({ method: "PUT", url: "/api/notes/n1", body: { id: "n1", text: "hola" } });
    expect(gateway.usesVersioning("Note")).toBe(false);
  });

  it("fetch devuelve null en 404 y relanza cualquier otro error", async () => {
    const notFound = createRestGateway(registry, fakeClient(() => Promise.reject(new NotFoundError())).client);
    await expect(notFound.fetch("Order", "x")).resolves.toBeNull();

    const offline = createRestGateway(registry, fakeClient(() => Promise.reject(new NetworkError())).client);
    await expect(offline.fetch("Order", "x")).rejects.toBeInstanceOf(NetworkError);
  });

  it("una entidad fuera del registro es error de configuración", async () => {
    const gateway = createRestGateway(registry, fakeClient(() => ({})).client);
    await expect(gateway.mutate("Nope", "CREATE", { id: "1" })).rejects.toBeInstanceOf(AppError);
  });
});

describe("classifySyncError", () => {
  it.each([
    [new NetworkError(), "transient"],
    [new ServerError(), "transient"],
    [new TypeError("Failed to fetch"), "transient"],
    [new UnauthenticatedError(), "unauthenticated"],
    [new PermissionDeniedError(), "permission"],
    [new NotFoundError(), "notFound"],
    [new ConflictError(), "alreadyExists"],
    [new ValidationError(), "validation"],
    [new TypeError("x is not a function"), "unknown"],
    ["boom", "unknown"],
  ])("%p → %s", (error, kind) => {
    expect(classifySyncError(error).kind).toBe(kind);
  });

  it("usa el detalle técnico como mensaje para el panel de sync", () => {
    const error = new ValidationError("Revisa", { debugMessage: "POST /api/orders → 422: total requerido" });
    expect(classifySyncError(error).message).toBe("POST /api/orders → 422: total requerido");
  });
});
