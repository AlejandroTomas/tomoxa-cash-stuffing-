import { z } from "zod";

import { ConflictError } from "@/core/errors";
import { ok, parseJson, route } from "@/core/http/server";
import type { Task } from "@/features/_example/domain/task";
import { tasksDb } from "./_db";

const createSchema = z.object({
  title: z.string().trim().min(3, "Mínimo 3 caracteres").max(80, "Máximo 80 caracteres"),
});

export const GET = route("api.example.tasks.list", async () =>
  ok([...tasksDb.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
);

export const POST = route("api.example.tasks.create", async (request) => {
  const { title } = await parseJson(request, createSchema);
  // El servidor valida aunque el cliente ya lo haya hecho: el cliente no es confiable.
  const taken = [...tasksDb.values()].some((task) => task.title.toLowerCase() === title.toLowerCase());
  if (taken) throw new ConflictError("Ya existe una tarea con ese título.", { code: "TASK_TITLE_TAKEN" });

  const task: Task = { id: crypto.randomUUID(), title, done: false, createdAt: new Date().toISOString() };
  tasksDb.set(task.id, task);
  return ok(task, { status: 201 });
});
