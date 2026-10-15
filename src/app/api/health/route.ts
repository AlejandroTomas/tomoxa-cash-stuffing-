import { serverEnv } from "@/core/env/server";
import { ok, route } from "@/core/http/server";

/** Ejemplo del patrón de Route Handler: `route()` + `ok()` → `ApiResult<T>`. */
export const GET = route("api.health", async () =>
  ok({ status: "ok", env: serverEnv.NODE_ENV, time: new Date().toISOString() }),
);
