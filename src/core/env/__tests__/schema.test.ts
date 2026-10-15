import { parseEnv, publicSchema, serverSchema } from "@/core/env/schema";

describe("parseEnv", () => {
  it("aplica los defaults y trata las variables vacías como no definidas", () => {
    const env = parseEnv(
      publicSchema,
      { NEXT_PUBLIC_APP_NAME: "", NEXT_PUBLIC_API_BASE_URL: undefined },
      "públicas",
    );
    expect(env).toEqual({ NEXT_PUBLIC_APP_NAME: "Aurora", NEXT_PUBLIC_API_BASE_URL: "" });
  });

  it("nombra cada variable inválida en el error", () => {
    expect(() =>
      parseEnv(publicSchema, { NEXT_PUBLIC_API_BASE_URL: "no-es-url" }, "públicas"),
    ).toThrow(/NEXT_PUBLIC_API_BASE_URL/);
  });

  it("valida NODE_ENV en el esquema de servidor", () => {
    expect(() => parseEnv(serverSchema, { NODE_ENV: "staging" }, "de servidor")).toThrow(
      /NODE_ENV/,
    );
  });
});
