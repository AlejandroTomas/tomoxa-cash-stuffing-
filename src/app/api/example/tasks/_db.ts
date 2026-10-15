import type { Task } from "@/features/_example/domain/task";

/**
 * "Base de datos" en memoria del feature de ejemplo. En tu proyecto aquí va el
 * acceso real (Prisma, Mongoose, SQL…). Vive en `globalThis` para que todas las
 * rutas compartan la misma instancia en desarrollo. Bórralo con `features/_example`.
 */
const globalForExample = globalThis as typeof globalThis & { __exampleTasks?: Map<string, Task> };

export const tasksDb: Map<string, Task> = (globalForExample.__exampleTasks ??= new Map(
  [
    { title: "Leer AGENTS.md", done: true },
    { title: "Borrar lo que el proyecto no use", done: false },
    { title: "Crear el primer feature copiando _example", done: false },
  ].map((seed, index): [string, Task] => {
    const id = `seed-${index + 1}`;
    return [id, { id, ...seed, createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString() }];
  }),
));
