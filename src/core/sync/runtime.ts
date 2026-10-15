import { reportError } from "@/core/logger";
import { DexieOutboxStore } from "./dexie-outbox-store";
import type { CreateInputOf, SyncEntityRegistry, UpdateInputOf } from "./entities";
import {
  browserConnectivity,
  createBrowserRunLock,
  createSessionIdentity,
  type Connectivity,
  type Identity,
} from "./environment";
import type { RemoteGateway } from "./gateway";
import { LocalStore } from "./local-store";
import { OutboxEngine, type EnqueueOptions, type OutboxBatch, type OutboxEngineConfig } from "./outbox-engine";
import { createRestGateway } from "./rest-gateway";
import type { OutboxEntry } from "./types";

export interface SyncRuntimeOptions<R extends SyncEntityRegistry> {
  /** Nombre de la base en IndexedDB. Ninguna limpieza de datos locales debe borrarla. */
  databaseName: string;
  registry: R;
  /** Súbela al agregar/quitar entidades con tabla local. Ver `SyncDatabaseOptions`. */
  schemaVersion: number;
  /** Default: REST sobre `core/http`. */
  gateway?: RemoteGateway;
  /** Default: la sesión de `core/session`. */
  identity?: Identity;
  connectivity?: Connectivity;
  config?: Partial<OutboxEngineConfig>;
}

/** Lote tipado: cada `create` devuelve el id de la entidad para referenciarlo. */
export interface TypedOutboxBatch<R extends SyncEntityRegistry> {
  create: <N extends keyof R & string>(entityName: N, input: CreateInputOf<R, N>, options?: EnqueueOptions) => string;
  update: <N extends keyof R & string>(entityName: N, input: UpdateInputOf<R, N>, options?: EnqueueOptions) => string;
  delete: (entityName: keyof R & string, id: string, options?: EnqueueOptions) => string;
}

const asPayload = (input: unknown) => ({ ...(input as Record<string, unknown>) });

/**
 * Arma un motor de sincronización completo para un registro de entidades. La
 * app usa uno (`core/sync/index.ts`); el showcase arma otro con su propia base
 * para no mezclar datos de demo con los del proyecto.
 *
 * Todo se crea al primer uso: importar esto en el servidor no toca IndexedDB.
 */
export function createSyncRuntime<R extends SyncEntityRegistry>(options: SyncRuntimeOptions<R>) {
  const dbOptions = { name: options.databaseName, registry: options.registry, schemaVersion: options.schemaVersion };
  let engine: OutboxEngine | null = null;
  let local: LocalStore | null = null;

  const getEngine = (): OutboxEngine => {
    engine ??= new OutboxEngine({
      store: new DexieOutboxStore(dbOptions),
      gateway: options.gateway ?? createRestGateway(options.registry),
      connectivity: options.connectivity ?? browserConnectivity,
      identity: options.identity ?? createSessionIdentity(),
      lock: createBrowserRunLock(`${options.databaseName}-outbox`),
      entities: options.registry,
      config: options.config,
    });
    return engine;
  };

  const typedBatch = (batch: OutboxBatch): TypedOutboxBatch<R> => ({
    create: (entityName, input, enqueueOptions) => batch.add(entityName, "CREATE", asPayload(input), enqueueOptions),
    update: (entityName, input, enqueueOptions) => batch.add(entityName, "UPDATE", asPayload(input), enqueueOptions),
    delete: (entityName, id, enqueueOptions) => batch.add(entityName, "DELETE", { id }, enqueueOptions),
  });

  return {
    getEngine,

    /** Las tablas locales de lectura (solo entidades con `local`). */
    getLocalStore: (): LocalStore => {
      local ??= new LocalStore(dbOptions);
      return local;
    },

    /**
     * Arranca el motor una vez, en el navegador. Sin entidades registradas no
     * hace nada: un proyecto que no usa el outbox no abre IndexedDB.
     */
    start(): void {
      if (typeof window === "undefined" || Object.keys(options.registry).length === 0) return;
      // Pide al navegador no desalojar IndexedDB cuando falte espacio: una cola
      // con registros sin subir no debe borrarse sola en un equipo lleno.
      navigator.storage?.persist?.().catch((error: unknown) => {
        reportError(error, { context: "sync.persistStorage" });
      });
      getEngine().start();
    },

    /**
     * Operaciones tipadas por entidad. Las usan los `repositories/`: guardan
     * local y el motor se encarga de subirlo.
     *
     * ```ts
     * await outbox.create("Order", order);
     * await outbox.update("Order", { id, status: "PAGADO" }); // solo lo que cambió
     * await outbox.batch((tx) => {                            // todo o nada
     *   const orderId = tx.create("Order", order);
     *   items.forEach((item) => tx.create("OrderItem", { ...item, orderId }));
     *   tx.create("Payment", { ...payment, orderId }, {
     *     dependsOn: [{ entityName: "Order", entityId: orderId }],
     *   });
     * });
     * ```
     */
    outbox: {
      batch: async (build: (tx: TypedOutboxBatch<R>) => void): Promise<OutboxEntry[]> =>
        await getEngine().batch((batch) => build(typedBatch(batch))),
      create: async <N extends keyof R & string>(entityName: N, input: CreateInputOf<R, N>, enqueueOptions?: EnqueueOptions) =>
        await getEngine().enqueue(entityName, "CREATE", asPayload(input), enqueueOptions),
      update: async <N extends keyof R & string>(entityName: N, input: UpdateInputOf<R, N>, enqueueOptions?: EnqueueOptions) =>
        await getEngine().enqueue(entityName, "UPDATE", asPayload(input), enqueueOptions),
      delete: async (entityName: keyof R & string, id: string, enqueueOptions?: EnqueueOptions) =>
        await getEngine().enqueue(entityName, "DELETE", { id }, enqueueOptions),
    },
  };
}

export type SyncRuntime<R extends SyncEntityRegistry> = ReturnType<typeof createSyncRuntime<R>>;
