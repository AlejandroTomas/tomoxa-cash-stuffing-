import { z } from "zod";

import { ok, parseJson, route } from "@/core/http/server";
import { demo } from "../_store";

/** Cambia cómo responde la API de demo, para ver reintentos y bloqueos del outbox. */
export const POST = route("api.showcase.notes.mode", async (request) => {
  const { mode } = await parseJson(request, z.object({ mode: z.enum(["ok", "down", "reject"]) }));
  demo.mode = mode;
  return ok({ mode });
});

export const GET = route("api.showcase.notes.mode.get", async () => ok({ mode: demo.mode }));
