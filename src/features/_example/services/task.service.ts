import { ConflictError } from "@/core/errors";
import { normalizeTitle, type Task } from "../domain/task";
import type { CreateTaskDto } from "../dto/create-task.dto";
import { TaskAlreadyDoneError, TaskTitleInvalidError, TaskTitleTakenError } from "../errors/task-errors";
import { taskRepository } from "../repositories/task.repository";

/**
 * services/: las reglas de negocio. Valida, decide, orquesta repositorios y
 * lanza errores tipados. No sabe que existe React ni muestra nada: quien llama
 * decide cómo se le enseña al usuario (normalmente, nadie: el middleware de
 * thunks lo manda al panel de alertas).
 */
export const taskService = {
  list: () => taskRepository.list(),

  /** `existing` permite validar el duplicado sin otra petición; el servidor valida de nuevo. */
  async create(dto: CreateTaskDto, existing: readonly Task[] = []): Promise<Task> {
    const title = dto.title.trim().replace(/\s+/g, " ");
    if (title.length < 3) throw new TaskTitleInvalidError("El título debe tener al menos 3 caracteres.");
    if (title.length > 80) throw new TaskTitleInvalidError("El título no puede pasar de 80 caracteres.");
    if (existing.some((task) => normalizeTitle(task.title) === normalizeTitle(title))) {
      throw new TaskTitleTakenError(title);
    }

    try {
      return await taskRepository.create({ title });
    } catch (error) {
      // El servidor detectó el duplicado (otra persona la creó): mismo error de dominio.
      if (error instanceof ConflictError && error.code === "TASK_TITLE_TAKEN") throw new TaskTitleTakenError(title);
      throw error;
    }
  },

  async complete(task: Task): Promise<Task> {
    if (task.done) throw new TaskAlreadyDoneError();
    return await taskRepository.setDone(task.id, true);
  },

  reopen: (task: Task) => taskRepository.setDone(task.id, false),

  async remove(task: Task): Promise<string> {
    await taskRepository.remove(task.id);
    return task.id;
  },
};
