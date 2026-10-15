import { z } from "zod";

import { DEFAULT_ERROR_MESSAGE, NotFoundError, ValidationError } from "@/core/errors";
import { fail, ok, parseJson, route } from "@/core/http/server";

const jsonRequest = (body: string) =>
  new Request("http://localhost/api/test", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });

describe("ok / fail", () => {
  it("ok envuelve en ApiResult con el status pedido", async () => {
    const response = ok({ id: "1" }, { status: 201 });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, data: { id: "1" } });
  });

  it("fail usa status y mensaje de un AppError", async () => {
    const response = fail(new NotFoundError("Pedido no encontrado"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, message: "Pedido no encontrado" });
  });

  it("fail nunca expone el mensaje de un error inesperado", async () => {
    const response = fail(new Error("connection refused 10.0.0.3:5432"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, message: DEFAULT_ERROR_MESSAGE });
  });
});

describe("route + parseJson", () => {
  const schema = z.object({ name: z.string().min(1), qty: z.number().int().positive() });
  const handler = route("test.create", async (request) => {
    const input = await parseJson(request, schema);
    return ok(input, { status: 201 });
  });

  it("deja pasar un body válido", async () => {
    const response = await handler(jsonRequest('{"name":"Tornillo","qty":3}'), undefined);
    expect(response.status).toBe(201);
  });

  it("responde 422 con errores por campo", async () => {
    const response = await handler(jsonRequest('{"name":"","qty":-1}'), undefined);
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(Object.keys(body.fieldErrors)).toEqual(["name", "qty"]);
  });

  it("un body que no es JSON es ValidationError, no un 500", async () => {
    await expect(parseJson(jsonRequest("{roto"), schema)).rejects.toBeInstanceOf(ValidationError);
  });
});
