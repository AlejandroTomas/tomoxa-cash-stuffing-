import "fake-indexeddb/auto";

import { DexieOutboxStore } from "@/core/sync/dexie-outbox-store";
import { LocalStore } from "@/core/sync/local-store";
import { OutboxEngine } from "@/core/sync/outbox-engine";
import type { RemoteRecord } from "@/core/sync/types";
import { ConflictError, NetworkError } from "@/core/errors";
import { TEST_REGISTRY, freshDatabase } from "@/core/sync/test-utils/test-registry";

jest.mock("@/core/logger", () => ({ reportError: jest.fn() }));

function setup() {
  const database = freshDatabase("outbox-local-integration");
  const store = new DexieOutboxStore(database);
  const local = new LocalStore(database);
  const remote = new Map<string, RemoteRecord>();
  let online = false;
  let loseResponse = false;
  const gateway = {
    mutate: jest.fn(
      async (
        _entity: string,
        operation: string,
        input: Record<string, unknown>
      ) => {
        const id = String(input.id);
        if (operation === "CREATE" && remote.has(id)) {
          throw new ConflictError();
        }
        const record = {
          ...remote.get(id),
          ...input,
          id,
          _version: (remote.get(id)?._version ?? 0) + 1,
          _deleted: operation === "DELETE",
          createdAt: remote.get(id)?.createdAt ?? "2026-10-13T10:00:00.000Z",
          updatedAt: "2026-10-13T10:01:00.000Z",
          _lastChangedAt: 1791885660000,
        };
        remote.set(id, record);
        if (loseResponse) {
          loseResponse = false;
          throw new NetworkError();
        }
        return record;
      }
    ),
    usesVersioning: () => true,
    fetch: async (_entity: string, id: string) => remote.get(id) ?? null,
  };
  const engine = new OutboxEngine({
    store,
    gateway,
    entities: TEST_REGISTRY,
    identity: {
      currentUserId: async () => "u1",
      onSignIn: () => () => undefined,
    },
    connectivity: { isOnline: () => online, onOnline: () => () => undefined },
    lock: {
      runExclusive: async (task) => {
        await task();
        return true;
      },
    },
    config: { baseDelayMs: 0, maxDelayMs: 0 },
  });
  return {
    engine,
    store,
    local,
    remote,
    gateway,
    goOnline: () => {
      online = true;
    },
    loseNextResponse: () => {
      loseResponse = true;
    },
  };
}

describe("outbox + tabla local (IndexedDB real)", () => {
  it("guarda datos y operaciones en una transacción y revierte ambos si falla el lote", async () => {
    const ctx = setup();
    await ctx.engine.enqueue("Payment", "CREATE", { id: "previo", amount: 10 });
    await ctx.engine.whenIdle();
    const apply = LocalStore.prototype.applyLocal;
    const spy = jest
      .spyOn(LocalStore.prototype, "applyLocal")
      .mockImplementation(async function (
        this: LocalStore,
        entity,
        id,
        operation,
        payload
      ) {
        await apply.call(this, entity, id, operation, payload);
        if (id === "p2")
          throw new Error("Falla de disco al guardar el segundo pago");
      });
    try {
      await expect(
        ctx.engine.batch((batch) => {
          batch.add("Payment", "CREATE", { id: "p1", amount: 50 });
          batch.add("Payment", "CREATE", { id: "p2", amount: 60 });
        })
      ).rejects.toThrow("Falla de disco");
    } finally {
      spy.mockRestore();
    }
    expect(
      (await ctx.local.listAll("Payment")).map((record) => record.id)
    ).toEqual(["previo"]);
    expect(
      (await ctx.store.listByEntity("Payment")).map((entry) => entry.entityId)
    ).toEqual(["previo"]);
  });

  it("actualiza createdAt, updatedAt y versión desde el servidor después del envío", async () => {
    const ctx = setup();
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 50 });
    await ctx.engine.whenIdle();
    expect((await ctx.local.get("Payment", "p1"))?.createdAt).toBeUndefined();
    ctx.goOnline();
    await ctx.engine.syncNow();
    expect(ctx.gateway.mutate.mock.calls[0][2]).toEqual({
      id: "p1",
      amount: 50,
    });
    expect(await ctx.local.get("Payment", "p1")).toMatchObject({
      amount: 50,
      createdAt: "2026-10-13T10:00:00.000Z",
      updatedAt: "2026-10-13T10:01:00.000Z",
      _version: 1,
      _lastChangedAt: 1791885660000,
    });
  });

  it("proyecta una edición fusionada en la tabla local desde el primer momento", async () => {
    const ctx = setup();
    await ctx.engine.enqueue("Payment", "CREATE", {
      id: "p1",
      amount: 50,
      sourceDocumentId: "o1",
    });
    await ctx.engine.enqueue("Payment", "UPDATE", { id: "p1", amount: 60 });
    await ctx.engine.whenIdle();
    expect(await ctx.local.get("Payment", "p1")).toMatchObject({
      amount: 60,
      sourceDocumentId: "o1",
    });
    expect(await ctx.store.listByEntity("Payment")).toHaveLength(1);
    ctx.goOnline();
    await ctx.engine.syncNow();
    expect(ctx.remote.get("p1")?.amount).toBe(60);
    expect((await ctx.local.get("Payment", "p1"))?.amount).toBe(60);
  });

  it("una confirmación de $50 no pisa la edición posterior de $60", async () => {
    const ctx = setup();
    await ctx.engine.enqueue("Payment", "CREATE", {
      id: "p1",
      amount: 50,
      sourceDocumentId: "o1",
    });
    await ctx.engine.whenIdle();
    const [created] = await ctx.store.listByEntity("Payment");
    const sending = await ctx.store.claim(created.seq, 1);
    if (!sending) throw new Error("No se tomó la entrada");
    await ctx.engine.enqueue("Payment", "UPDATE", { id: "p1", amount: 60 });
    await ctx.engine.whenIdle();
    await ctx.store.confirm(
      sending,
      { status: "DONE", syncedAt: 2 },
      {
        id: "p1",
        sourceDocumentId: "o1",
        amount: 50,
        _version: 1,
        createdAt: "2026-10-13T10:00:00.000Z",
        updatedAt: "2026-10-13T10:01:00.000Z",
      }
    );
    expect(await ctx.local.get("Payment", "p1")).toMatchObject({
      amount: 60,
      _version: 1,
      createdAt: "2026-10-13T10:00:00.000Z",
    });
    const entries = await ctx.store.listByEntity("Payment");
    expect(entries.map((entry) => entry.status)).toEqual(["DONE", "PENDING"]);
    const updated = await ctx.store.claim(entries[1].seq, 3);
    if (!updated) throw new Error("No se tomó la edición");
    await ctx.store.confirm(
      updated,
      { status: "DONE", syncedAt: 4 },
      {
        id: "p1",
        sourceDocumentId: "o1",
        amount: 60,
        _version: 2,
        createdAt: "2026-10-13T10:00:00.000Z",
        updatedAt: "2026-10-13T10:02:00.000Z",
      }
    );
    expect(await ctx.local.get("Payment", "p1")).toMatchObject({
      amount: 60,
      _version: 2,
      updatedAt: "2026-10-13T10:02:00.000Z",
    });
  });

  it("una respuesta parcial no elimina los campos conocidos de un pago", async () => {
    const ctx = setup();
    await ctx.engine.enqueue("Payment", "CREATE", {
      id: "p1",
      sourceDocumentId: "o1",
      amount: 50,
      paymentMethod: "Efectivo",
    });
    await ctx.engine.whenIdle();
    const [entry] = await ctx.store.listByEntity("Payment");
    await ctx.store.confirm(
      entry,
      { status: "DONE" },
      { id: "p1", _version: 1, createdAt: "2026-10-13" }
    );
    expect(await ctx.local.get("Payment", "p1")).toMatchObject({
      amount: 50,
      sourceDocumentId: "o1",
      paymentMethod: "Efectivo",
      createdAt: "2026-10-13",
    });
  });

  it("las descargas respetan cambios pendientes y actualizan los otros campos del servidor", async () => {
    const ctx = setup();
    await ctx.local.applyRemote("Payment", [
      { id: "p1", amount: 50, status: "PROCESADO", _version: 1 },
    ]);
    await ctx.engine.enqueue("Payment", "UPDATE", { id: "p1", amount: 60 });
    await ctx.engine.whenIdle();
    await ctx.local.applyRemote("Payment", [
      {
        id: "p1",
        amount: 50,
        status: "CANCELADO",
        _version: 2,
        printDate: "2026-10-13",
      },
    ]);
    expect(await ctx.local.get("Payment", "p1")).toMatchObject({
      amount: 60,
      status: "CANCELADO",
      printDate: "2026-10-13",
      _version: 2,
    });
    const [pending] = await ctx.store.listByEntity("Payment");
    await ctx.store.update(pending.seq, {
      status: "BLOCKED",
      lastErrorKind: "validation",
    });
    await ctx.local.applyRemote("Payment", [
      { id: "p1", amount: 50, _version: 3 },
    ]);
    expect((await ctx.local.get("Payment", "p1"))?.amount).toBe(60);
  });

  it("un DELETE local permanece oculto mientras su envío sigue pendiente", async () => {
    const ctx = setup();
    await ctx.local.applyRemote("Payment", [
      { id: "p1", amount: 50, _version: 1 },
    ]);
    await ctx.engine.enqueue("Payment", "DELETE", { id: "p1" });
    await ctx.engine.whenIdle();
    expect(await ctx.local.listAll("Payment")).toEqual([]);
    await ctx.local.applyRemote("Payment", [
      { id: "p1", amount: 50, _version: 2 },
    ]);
    expect(await ctx.local.listAll("Payment")).toEqual([]);
    expect((await ctx.local.listByIds("Payment", ["p1"]))[0]._version).toBe(2);
  });

  it("un pago offline cuenta, sobrevive a una respuesta perdida y sigue contando después de purgar DONE", async () => {
    const ctx = setup();
    await ctx.engine.enqueue("Payment", "CREATE", {
      id: "p1",
      sourceDocumentId: "g1",
      sourceDocumentType: "GENERIC_CHARGE",
      amount: 100,
    });
    await ctx.engine.whenIdle();
    expect((await ctx.local.get("Payment", "p1"))?.amount).toBe(100);
    expect(await ctx.local.count("Payment")).toBe(1);
    expect((await ctx.store.listByEntity("Payment"))[0].status).toBe("PENDING");
    ctx.goOnline();
    ctx.loseNextResponse();
    await ctx.engine.syncNow();
    expect((await ctx.store.listByEntity("Payment"))[0].status).toBe("FAILED");
    await ctx.engine.syncNow();
    expect(ctx.remote.size).toBe(1);
    expect((await ctx.store.listByEntity("Payment"))[0].status).toBe("DONE");
    expect((await ctx.local.get("Payment", "p1"))?.amount).toBe(100);
    expect(await ctx.local.count("Payment")).toBe(1);
    await ctx.store.purgeConfirmed(Date.now() + 1);
    expect(await ctx.store.listByEntity("Payment")).toEqual([]);
    expect((await ctx.local.get("Payment", "p1"))?.amount).toBe(100);
  });

  it("si falla la confirmación local, revierte la copia y DONE y recupera el envío sin duplicarlo", async () => {
    const ctx = setup();
    await ctx.engine.enqueue("Payment", "CREATE", { id: "p1", amount: 100 });
    await ctx.engine.whenIdle();
    const apply = LocalStore.prototype.applyRemote;
    const spy = jest
      .spyOn(LocalStore.prototype, "applyRemote")
      .mockImplementationOnce(async function (
        this: LocalStore,
        entity,
        records
      ) {
        await apply.call(this, entity, records);
        throw new Error("Falla de disco después de escribir la copia");
      });
    ctx.goOnline();
    try {
      await ctx.engine.syncNow();
      expect((await ctx.store.listByEntity("Payment"))[0].status).toBe(
        "SYNCING"
      );
      expect((await ctx.local.get("Payment", "p1"))?.amount).toBe(100);
      expect((await ctx.local.get("Payment", "p1"))?._version).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
    await ctx.engine.syncNow();
    expect(ctx.remote.size).toBe(1);
    expect((await ctx.store.listByEntity("Payment"))[0].status).toBe("DONE");
    expect((await ctx.local.get("Payment", "p1"))?.amount).toBe(100);
  });

  it("DELETE confirmado conserva la marca de borrado aunque el servidor ya no tenga el registro", async () => {
    const ctx = setup();
    await ctx.local.applyRemote("Payment", [
      { id: "p1", sourceDocumentId: "o1", _version: 4 },
    ]);
    await ctx.engine.enqueue("Payment", "DELETE", { id: "p1" });
    await ctx.engine.whenIdle();
    ctx.goOnline();
    await ctx.engine.syncNow();
    expect((await ctx.store.listByEntity("Payment"))[0].status).toBe("DONE");
    expect(await ctx.local.get("Payment", "p1")).toBeUndefined();
    expect((await ctx.local.listByIds("Payment", ["p1"]))[0]._deleted).toBe(
      true
    );
  });
});
