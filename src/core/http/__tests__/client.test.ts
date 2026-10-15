import {
  AxiosError,
  AxiosHeaders,
  CanceledError,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from "axios";

import {
  AppError,
  NetworkError,
  NotFoundError,
  ServerError,
  UnauthenticatedError,
  ValidationError,
} from "@/core/errors";
import { createHttpClient, isCanceled, type HttpClientOptions } from "@/core/http";

type Reply = { status: number; data?: unknown } | "network-error" | "canceled";

function clientReplying(reply: Reply, options: HttpClientOptions = {}) {
  const client = createHttpClient(options);
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    if (reply === "canceled") throw new CanceledError(undefined, undefined, config);
    if (reply === "network-error") {
      throw new AxiosError("Network Error", "ERR_NETWORK", config);
    }
    const response = {
      data: reply.data,
      status: reply.status,
      statusText: "",
      headers: new AxiosHeaders(),
      config,
    };
    if (reply.status >= 400) {
      throw new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, undefined, response);
    }
    return response;
  };
  client.instance.defaults.adapter = adapter;
  return client;
}

describe("createHttpClient — respuestas exitosas", () => {
  it("desenvuelve un ApiResult y devuelve solo data", async () => {
    const client = clientReplying({ status: 200, data: { ok: true, data: { id: "1" } } });
    await expect(client.get("/api/orders/1")).resolves.toEqual({ id: "1" });
  });

  it("devuelve el cuerpo tal cual si la API no usa ApiResult", async () => {
    const client = clientReplying({ status: 200, data: [{ cp: "68000" }] });
    await expect(client.get("https://api.externa.com/cp")).resolves.toEqual([{ cp: "68000" }]);
  });

  it("un ApiResult con ok:false en 2xx también rechaza con AppError", async () => {
    const client = clientReplying({ status: 200, data: { ok: false, message: "Sin stock" } });
    await expect(client.post("/api/orders")).rejects.toMatchObject({ message: "Sin stock" });
  });
});

describe("createHttpClient — errores tipados", () => {
  it.each([
    [404, NotFoundError],
    [401, UnauthenticatedError],
    [500, ServerError],
    [429, ServerError],
  ])("status %i → %p", async (status, ErrorClass) => {
    const client = clientReplying({ status, data: { ok: false, message: "x" } }, {
      onUnauthorized: () => undefined,
    });
    await expect(client.get("/api/x")).rejects.toBeInstanceOf(ErrorClass);
  });

  it("422 trae los errores por campo del servidor", async () => {
    const client = clientReplying({
      status: 422,
      data: { ok: false, message: "Revisa el formulario", fieldErrors: { email: "Inválido" } },
    });
    const error = (await client.post("/api/users").catch((e: unknown) => e)) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe("Revisa el formulario");
    expect(error.fieldErrors).toEqual({ email: "Inválido" });
    expect(error.debugMessage).toBe("POST /api/users → 422: Revisa el formulario");
  });

  it("sin respuesta del servidor → NetworkError", async () => {
    const client = clientReplying("network-error");
    await expect(client.get("/api/x")).rejects.toBeInstanceOf(NetworkError);
  });

  it("una API externa no muestra su mensaje técnico al usuario", async () => {
    const client = clientReplying(
      { status: 404, data: { message: "Resource /v2/cp/999 not found in shard 3" } },
      { trustServerMessages: false },
    );
    const error = (await client.get("/cp/999").catch((e: unknown) => e)) as AppError;
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).not.toMatch(/shard/);
    expect(error.debugMessage).toMatch(/shard/);
  });

  it("varios 401 seguidos llaman a onUnauthorized una sola vez", async () => {
    const onUnauthorized = jest.fn();
    const client = clientReplying({ status: 401, data: {} }, { onUnauthorized });
    await Promise.allSettled([client.get("/a"), client.get("/b"), client.get("/c")]);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("una petición cancelada no se convierte en error de app", async () => {
    const client = clientReplying("canceled");
    const error = await client.get("/api/x").catch((e: unknown) => e);
    expect(isCanceled(error)).toBe(true);
    expect(error).not.toBeInstanceOf(AppError);
  });
});
