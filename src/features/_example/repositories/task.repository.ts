import { http } from "@/core/http";
import type { Task } from "../domain/task";
import type { CreateTaskDto } from "../dto/create-task.dto";

/**
 * repositories/: habla con el mundo exterior y NADA más. Un método por
 * consulta, con nombre de negocio. Sin `if` de negocio, sin toast, sin
 * try/catch: si falla, el `AppError` tipado de `core/http` sube tal cual.
 *
 * Es privado del feature: otro feature que necesite tareas llama al service.
 * (Con el outbox, aquí se usaría `outbox.create(...)` en lugar de `http.post`.)
 */
const BASE = "/api/example/tasks";

export const taskRepository = {
  list: () => http.get<Task[]>(BASE),
  create: (dto: CreateTaskDto) => http.post<Task>(BASE, dto),
  setDone: (id: string, done: boolean) => http.patch<Task>(`${BASE}/${id}`, { done }),
  remove: (id: string) => http.delete<null>(`${BASE}/${id}`),
};
