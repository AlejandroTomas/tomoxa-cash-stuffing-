import { ConflictError, NotFoundError, ServerError, ValidationError } from "@/core/errors";

/**
 * "Base de datos" en memoria para la demo del outbox. Vive en `globalThis` para
 * que todas las rutas de la API compartan la misma instancia en desarrollo.
 * Se borra al reiniciar el servidor. Bórralo junto con `/showcase`.
 */
export interface DemoNote {
  id: string;
  text: string;
  done: boolean;
  version: number;
  updatedAt: string;
}

/** `ok` responde normal; `down` simula una falla del servidor (500); `reject` rechaza los datos (422). */
export type ServerMode = "ok" | "down" | "reject";

interface DemoState {
  notes: Map<string, DemoNote>;
  mode: ServerMode;
}

const globalForDemo = globalThis as typeof globalThis & { __showcaseNotes?: DemoState };
export const demo: DemoState = (globalForDemo.__showcaseNotes ??= { notes: new Map(), mode: "ok" });

/** Aplica el modo simulado antes de cada operación. */
export function checkMode(): void {
  if (demo.mode === "down") throw new ServerError(undefined, { debugMessage: "Demo: servidor en modo caído" });
  if (demo.mode === "reject") {
    throw new ValidationError("El servidor rechazó los datos.", { debugMessage: "Demo: servidor en modo rechazo (422)" });
  }
}

export function findNote(id: string): DemoNote {
  const note = demo.notes.get(id);
  if (!note) throw new NotFoundError("La nota no existe.");
  return note;
}

/** Concurrencia optimista: si mandan versión, debe ser la actual. */
export function assertVersion(note: DemoNote, version: unknown): void {
  if (version !== undefined && version !== null && Number(version) !== note.version) {
    throw new ConflictError("La nota cambió en el servidor.", {
      debugMessage: `versión enviada ${String(version)}, actual ${note.version}`,
    });
  }
}
