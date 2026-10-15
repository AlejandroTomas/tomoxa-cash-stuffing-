import { ConflictError, ValidationError } from "@/core/errors";

/**
 * errors/: excepciones del dominio. Extienden las de `core/errors` (así ya traen
 * su status HTTP) y su `message` es SIEMPRE seguro para el usuario. El detalle
 * técnico va en `debugMessage`.
 */
export class TaskTitleInvalidError extends ValidationError {
  constructor(reason: string) {
    super(reason, { fieldErrors: { title: reason } });
  }
}

export class TaskTitleTakenError extends ConflictError {
  constructor(title: string) {
    super("Ya existe una tarea con ese título.", { code: "TASK_TITLE_TAKEN", debugMessage: `título repetido: ${title}` });
  }
}

export class TaskAlreadyDoneError extends ValidationError {
  constructor() {
    super("La tarea ya estaba completada.");
  }
}
