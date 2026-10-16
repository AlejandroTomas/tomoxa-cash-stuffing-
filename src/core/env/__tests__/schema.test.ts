import { parseEnv, publicSchema, serverSchema } from "@/core/env/schema";

describe("parseEnv", () => {
  it("aplica los defaults y trata las variables vacías como no definidas", () => {
    const env = parseEnv(
      publicSchema,
      { NEXT_PUBLIC_APP_NAME: "" },
      "públicas",
    );
    expect(env).toEqual({ NEXT_PUBLIC_APP_NAME: "Ahorroxa" });
  });

  it("valida NODE_ENV en el esquema de servidor", () => {
    expect(() => parseEnv(serverSchema, { NODE_ENV: "staging" }, "de servidor")).toThrow(
      /NODE_ENV/,
    );
  });
});
