import { z } from "zod";

import { ok, parseJson, route } from "@/core/http/server";
import { assertVersion, checkMode, demo, findNote } from "../_store";

type Context = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  text: z.string().trim().min(1).max(200).optional(),
  done: z.boolean().optional(),
  version: z.number().int().optional(),
});

export const GET = route<Context>("api.showcase.notes.get", async (_request, { params }) => {
  const { id } = await params;
  return ok(findNote(id));
});

export const PATCH = route<Context>("api.showcase.notes.update", async (request, { params }) => {
  checkMode();
  const { id } = await params;
  const note = findNote(id);
  const { version, ...changes } = await parseJson(request, patchSchema);
  assertVersion(note, version);
  const updated = { ...note, ...changes, version: note.version + 1, updatedAt: new Date().toISOString() };
  demo.notes.set(id, updated);
  return ok(updated);
});

export const DELETE = route<Context>("api.showcase.notes.delete", async (request, { params }) => {
  checkMode();
  const { id } = await params;
  const note = findNote(id);
  assertVersion(note, new URL(request.url).searchParams.get("version") ?? undefined);
  demo.notes.delete(id);
  return ok(null);
});
