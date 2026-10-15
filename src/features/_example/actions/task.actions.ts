import { createAsyncThunkWithErrorHandling } from "@/store/utils/createAsyncThunkWithErrorHandling";
import type { Task } from "../domain/task";
import type { CreateTaskDto } from "../dto/create-task.dto";
import { taskService } from "../services/task.service";

/**
 * actions/: thunks delgados. Cada uno llama a UN método del service y nada más:
 * sin try/catch (el wrapper reporta y rechaza con mensaje seguro) y sin UI (el
 * middleware manda el error al panel de alertas).
 *
 * El `typePrefix` es único en TODO el store: "exampleTasks/…", no solo "fetch".
 * Son privados: otro módulo los importa desde el slice, que los reexporta.
 */
export const fetchTasks = createAsyncThunkWithErrorHandling<Task[]>("exampleTasks/fetch", () => taskService.list());

export const createTask = createAsyncThunkWithErrorHandling<Task, CreateTaskDto>(
  "exampleTasks/create",
  (dto, { getState }) => taskService.create(dto, getState().exampleTasks.items),
);

export const completeTask = createAsyncThunkWithErrorHandling<Task, Task>("exampleTasks/complete", (task) =>
  taskService.complete(task),
);

export const reopenTask = createAsyncThunkWithErrorHandling<Task, Task>("exampleTasks/reopen", (task) =>
  taskService.reopen(task),
);

export const removeTask = createAsyncThunkWithErrorHandling<string, Task>("exampleTasks/remove", (task) =>
  taskService.remove(task),
);
