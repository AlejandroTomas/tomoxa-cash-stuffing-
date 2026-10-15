import { ConflictError, NetworkError } from "@/core/errors";
import { summarizeTasks, type Task } from "@/features/_example/domain/task";
import {
  TaskAlreadyDoneError,
  TaskTitleInvalidError,
  TaskTitleTakenError,
} from "@/features/_example/errors/task-errors";
import { taskRepository } from "@/features/_example/repositories/task.repository";
import { taskService } from "@/features/_example/services/task.service";

/**
 * Cómo se prueba cada capa:
 * - domain/: directo, sin mocks (es puro).
 * - services/: con el repository simulado. Se prueban las reglas, no la red.
 */
jest.mock("@/features/_example/repositories/task.repository", () => ({
  taskRepository: { list: jest.fn(), create: jest.fn(), setDone: jest.fn(), remove: jest.fn() },
}));

const repo = jest.mocked(taskRepository);
const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Comprar tornillos",
  done: false,
  createdAt: "2026-10-15T00:00:00.000Z",
  ...overrides,
});

beforeEach(() => jest.resetAllMocks());

describe("taskService.create", () => {
  it("normaliza espacios y manda solo lo que decide el caller", async () => {
    repo.create.mockResolvedValue(task({ title: "Pintar barda" }));
    await taskService.create({ title: "  Pintar   barda " });
    expect(repo.create).toHaveBeenCalledWith({ title: "Pintar barda" });
  });

  it("rechaza títulos inválidos sin llamar al servidor, con error por campo", async () => {
    const error = await taskService.create({ title: "ab" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TaskTitleInvalidError);
    expect((error as TaskTitleInvalidError).fieldErrors).toEqual({ title: expect.stringContaining("3") });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("detecta duplicados contra la lista cargada, sin importar mayúsculas", async () => {
    await expect(taskService.create({ title: "comprar TORNILLOS" }, [task()])).rejects.toBeInstanceOf(
      TaskTitleTakenError,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("traduce el duplicado que detecta el servidor al error del dominio", async () => {
    repo.create.mockRejectedValue(new ConflictError(undefined, { code: "TASK_TITLE_TAKEN" }));
    await expect(taskService.create({ title: "Nueva" })).rejects.toBeInstanceOf(TaskTitleTakenError);
  });

  it("deja pasar los demás errores tal cual (los clasifica core/http)", async () => {
    repo.create.mockRejectedValue(new NetworkError());
    await expect(taskService.create({ title: "Nueva" })).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("taskService.complete", () => {
  it("no completa dos veces", async () => {
    await expect(taskService.complete(task({ done: true }))).rejects.toBeInstanceOf(TaskAlreadyDoneError);
    expect(repo.setDone).not.toHaveBeenCalled();
  });

  it("marca como hecha", async () => {
    repo.setDone.mockResolvedValue(task({ done: true }));
    await expect(taskService.complete(task())).resolves.toMatchObject({ done: true });
    expect(repo.setDone).toHaveBeenCalledWith("t1", true);
  });
});

describe("summarizeTasks (domain)", () => {
  it("calcula progreso entero y aguanta la lista vacía", () => {
    expect(summarizeTasks([])).toEqual({ total: 0, done: 0, pending: 0, progress: 0 });
    expect(summarizeTasks([task({ done: true }), task(), task()])).toEqual({ total: 3, done: 1, pending: 2, progress: 33 });
  });
});
