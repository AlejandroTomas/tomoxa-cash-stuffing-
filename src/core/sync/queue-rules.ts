import type {
  NewOutboxEntry,
  OutboxEntry,
  OutboxOperation,
  OutboxRef,
} from "./types";

/**
 * Reglas puras de la cola: cuándo fusionar, cuándo una entrada puede salir y
 * cuánto esperar entre reintentos. Sin I/O, para poder probarlas solas.
 */

export function entityKey(ref: OutboxRef): string {
  return `${ref.entityName}#${ref.entityId}`;
}

export type EnqueuePlan =
  | { kind: "append" }
  | {
      kind: "merge";
      seq: number;
      operation: OutboxOperation;
      payload: Record<string, unknown>;
    };

/**
 * Decide si una operación nueva se agrega como entrada propia o se fusiona con
 * la última pendiente de la misma entidad.
 *
 * Solo se fusiona un UPDATE sobre un CREATE/UPDATE que **nunca se intentó
 * mandar**. Si ya se mandó una vez, el servidor pudo haberlo recibido aunque la
 * respuesta no llegara: al reenviarlo, la confirmación por "ya existe"
 * descartaría los cambios fusionados. En ese caso la edición va como entrada
 * aparte, detrás.
 *
 * @param entityEntries entradas no confirmadas de la misma entidad, en orden de `seq`.
 */
export function planEnqueue(
  entityEntries: OutboxEntry[],
  incoming: Pick<NewOutboxEntry, "operation" | "payload"> & Partial<Pick<NewOutboxEntry, "enqueuedBy" | "dependsOn">>
): EnqueuePlan {
  if (incoming.operation !== "UPDATE") {
    return { kind: "append" };
  }

  const last = entityEntries[entityEntries.length - 1];

  if (
    !last ||
    last.status !== "PENDING" ||
    last.sendCount > 0 ||
    last.operation === "DELETE" ||
    ("enqueuedBy" in incoming && incoming.enqueuedBy !== last.enqueuedBy) ||
    incoming.dependsOn?.some((ref) => !last.dependsOn.some((existing) => entityKey(existing) === entityKey(ref)))
  ) {
    return { kind: "append" };
  }

  return {
    kind: "merge",
    seq: last.seq,
    operation: last.operation,
    payload: { ...last.payload, ...incoming.payload },
  };
}

/**
 * Una entrada puede mandarse si le toca por estado y nada anterior la bloquea:
 * ni otra operación de la misma entidad sin confirmar, ni una de sus dependencias.
 *
 * @param unresolvedKeys `entityKey` de las entradas anteriores (menor `seq`) aún sin confirmar.
 * @param maxWaitMs la espera más larga que el motor programa. Si `nextAttemptAt`
 *   queda más lejos que eso, el reloj del equipo se atrasó: se trata como vencido
 *   para que la entrada no se congele días.
 */
export function isRunnable(
  entry: OutboxEntry,
  unresolvedKeys: ReadonlySet<string>,
  now: number,
  maxWaitMs = Number.POSITIVE_INFINITY
): boolean {
  const waitLeft = entry.nextAttemptAt - now;
  const dueByStatus =
    entry.status === "PENDING" ||
    (entry.status === "FAILED" && (waitLeft <= 0 || waitLeft > maxWaitMs));

  if (!dueByStatus) {
    return false;
  }

  if (unresolvedKeys.has(entityKey(entry))) {
    return false;
  }

  return !entry.dependsOn.some((ref) => unresolvedKeys.has(entityKey(ref)));
}

export interface BackoffOptions {
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Backoff exponencial con jitter: base, 2×base, 4×base… hasta `maxDelayMs`.
 * El jitter (hasta +25 %) evita que varios dispositivos reintenten al mismo tiempo.
 */
export function nextAttemptDelay(
  failures: number,
  { baseDelayMs, maxDelayMs }: BackoffOptions,
  random: () => number = Math.random
): number {
  const exponent = Math.max(0, failures - 1);
  const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** exponent);
  return Math.round(delay * (1 + random() * 0.25));
}
