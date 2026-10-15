/**
 * Tipos del motor de sincronización (outbox).
 *
 * Una entrada de outbox es UNA operación pendiente contra el servidor, no una
 * entidad: crear un pago y luego editarlo pueden ser dos entradas distintas
 * del mismo `entityId`. El orden de llegada lo da `seq`.
 */

export type OutboxOperation = "CREATE" | "UPDATE" | "DELETE";

/**
 * - `PENDING`  esperando turno.
 * - `SYNCING`  enviándose ahora. Si la app muere a la mitad, se recupera como PENDING.
 * - `FAILED`   falló por algo pasajero; se reintenta solo cuando llega `nextAttemptAt`.
 * - `BLOCKED`  necesita atención (permiso, validación, conflicto sin confirmar).
 *              No se reintenta solo, pero tampoco se borra: `retryBlocked()` lo devuelve a la cola.
 * - `DONE`     confirmado por el servidor. Es el único estado que se puede purgar.
 */
export type OutboxStatus = "PENDING" | "SYNCING" | "FAILED" | "BLOCKED" | "DONE";

/** Información de envío que puede acompañar a un registro de la tabla local. */
export interface PendingInfo {
  status: OutboxStatus;
  seq: number;
}

export type SyncErrorKind =
  /** Sin red, timeout, throttling o error 5xx. No gasta intentos. */
  | "transient"
  /** Sin sesión o token vencido. No gasta intentos: se resuelve al volver a entrar. */
  | "unauthenticated"
  /** El id ya existe en el servidor. Hay que confirmarlo con un get antes de darlo por hecho. */
  | "alreadyExists"
  /** Choque de versión. Se reintenta con la versión fresca del servidor. */
  | "conflict"
  /** El servidor rechazó el input: no va a pasar reintentando igual. */
  | "validation"
  /** El usuario no tiene permiso sobre la operación. */
  | "permission"
  /** El registro a editar no existe (o fue borrado) en el servidor. */
  | "notFound"
  /** El registro existe en el servidor pero con otros datos: lo enviado no quedó guardado. */
  | "divergent"
  | "unknown";

export interface OutboxRef {
  entityName: string;
  entityId: string;
}

export interface OutboxEntry {
  /** Autoincremental: el orden de llegada. Lo asigna la base al guardar. */
  seq: number;
  entityName: string;
  entityId: string;
  operation: OutboxOperation;
  payload: Record<string, unknown>;
  /**
   * Quién encoló la operación (`Identity.currentUserId`). Solo se manda con la
   * sesión de ese usuario; si en el equipo entra otro, la entrada espera hasta
   * que alguien la adopte. `null` = se encoló sin sesión, la manda cualquiera.
   *
   * No confundir con el dueño de negocio del registro: si una cajera cobra el
   * pedido de un vendedor, `enqueuedBy` es la cajera.
   */
  enqueuedBy: string | null;
  /** Entradas que deben estar confirmadas antes de mandar esta (ej. el pedido antes de su pago). */
  dependsOn: OutboxRef[];
  status: OutboxStatus;
  /** Fallos que cuentan contra el límite. Los pasajeros no suman. */
  attempts: number;
  /** Fallos pasajeros seguidos; solo alimentan el backoff. */
  transientFailures: number;
  /** Veces que se intentó mandar. Si es > 0 el payload ya no se fusiona con ediciones nuevas. */
  sendCount: number;
  nextAttemptAt: number;
  lastError?: string;
  lastErrorKind?: SyncErrorKind;
  remoteVersion?: number;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
}

export type NewOutboxEntry = Omit<OutboxEntry, "seq">;

export type OutboxEntryPatch = Partial<Omit<OutboxEntry, "seq">>;

/**
 * Un registro del servidor, **normalizado por el gateway**: el motor solo
 * depende de `id` y, si la entidad los usa, de `_version` (concurrencia
 * optimista) y `_deleted` (borrado lógico). El gateway traduce los nombres que
 * use cada API (`version`, `rowVersion`, `deletedAt`…) a estos dos.
 */
export interface RemoteRecord {
  id: string;
  _version?: number | null;
  _deleted?: boolean | null;
  [field: string]: unknown;
}

export type OutboxSummary = Record<OutboxStatus, number>;

export interface SyncRunResult {
  synced: number;
  failed: number;
  blocked: number;
  /** El ciclo no corrió: otra pestaña tiene el lock, o no hay red. */
  skipped: boolean;
}
