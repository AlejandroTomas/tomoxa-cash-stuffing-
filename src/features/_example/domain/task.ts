/**
 * domain/: la entidad y el cálculo PURO sobre ella. Sin I/O, sin async, sin
 * React. Es lo más fácil de probar y lo único que otro feature puede importar
 * libremente (junto con services/, errors/, components/, selector y slice).
 *
 * Si la entidad la comparten varios features, su tipo va a `@/types`.
 */
export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string; // ISO
}

export interface TaskSummary {
  total: number;
  done: number;
  pending: number;
  /** 0–100, entero. */
  progress: number;
}

export function summarizeTasks(tasks: readonly Task[]): TaskSummary {
  const done = tasks.filter((task) => task.done).length;
  return {
    total: tasks.length,
    done,
    pending: tasks.length - done,
    progress: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

/** Título normalizado para comparar duplicados: sin espacios extra ni mayúsculas. */
export const normalizeTitle = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();
