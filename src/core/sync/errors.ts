import { AppError } from "@/core/errors";

/** La entidad no está bien configurada (sin endpoint, nombre fuera del registro…). */
export class SyncConfigError extends AppError {}

/** Una entrada que necesita atención. Solo para el log: el usuario ve el panel de sync. */
export class SyncEntryBlockedError extends AppError {}
