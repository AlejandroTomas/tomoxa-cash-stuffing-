import { z } from "zod";

import { NotFoundError } from "@/core/errors";
import { ok, parseJson, route } from "@/core/http/server";
import { tasksDb } from "../_db";

type Context = { params: Promise<{ id: string }> };

const findTask = (id: string) => {
  const task = tasksDb.get(id);
  if (!task) throw new NotFoundError("La tarea no existe.");
  return task;
};

export const PATCH = route<Context>("api.example.tasks.update", async (request, { params }) => {
  const { id } = await params;
  const changes = await parseJson(request, z.object({ done: z.boolean() }));
  const updated = { ...findTask(id), ...changes };
  tasksDb.set(id, updated);
  return ok(updated);
});

export const DELETE = route<Context>("api.example.tasks.delete", async (_request, { params }) => {
  const { id } = await params;
  findTask(id);
  tasksDb.delete(id);
  return ok(null);
});
