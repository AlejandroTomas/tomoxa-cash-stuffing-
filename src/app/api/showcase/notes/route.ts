import { z } from "zod";

import { ConflictError } from "@/core/errors";
import { ok, parseJson, route } from "@/core/http/server";
import { checkMode, demo, type DemoNote } from "./_store";

const createSchema = z.object({
  // El id lo genera el cliente: así reenviar el mismo CREATE no duplica.
  id: z.string().min(1),
  text: z.string().trim().min(1, "Escribe la nota").max(200),
  done: z.boolean().default(false),
});

export const GET = route("api.showcase.notes.list", async () =>
  ok([...demo.notes.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
);

export const POST = route("api.showcase.notes.create", async (request) => {
  checkMode();
  const input = await parseJson(request, createSchema);
  if (demo.notes.has(input.id)) throw new ConflictError("Ya existe una nota con ese id.");
  const note: DemoNote = { ...input, version: 1, updatedAt: new Date().toISOString() };
  demo.notes.set(note.id, note);
  return ok(note, { status: 201 });
});
