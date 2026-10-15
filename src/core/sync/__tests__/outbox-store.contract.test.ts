import "fake-indexeddb/auto";

import { DexieOutboxStore } from "@/core/sync/dexie-outbox-store";
import type { OutboxStore } from "@/core/sync/outbox-store";
import { planEnqueue } from "@/core/sync/queue-rules";
import { MemoryOutboxStore } from "@/core/sync/test-utils/memory-outbox-store";
import type { NewOutboxEntry } from "@/core/sync/types";
import { freshDatabase } from "@/core/sync/test-utils/test-registry";

/**
 * Lo que el motor da por hecho de la cola, probado contra las dos
 * implementaciones: si la de memoria (la que usan los tests del motor) se
 * desvía de Dexie, falla aquí.
 */

const factories: Array<[string, () => OutboxStore]> = [
  ["memoria", () => new MemoryOutboxStore()],
  ["Dexie (IndexedDB)", () => new DexieOutboxStore(freshDatabase("outbox-contract"))],
];

function newEntry(overrides: Partial<NewOutboxEntry> = {}): NewOutboxEntry {
  return {
    entityName: "Payment",
    entityId: "p1",
    operation: "CREATE",
    payload: { id: "p1", amount: 100 },
    enqueuedBy: "u1",
    dependsOn: [],
    status: "PENDING",
    attempts: 0,
    transientFailures: 0,
    sendCount: 0,
    nextAttemptAt: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const plan = (entry: NewOutboxEntry, entityEntries: Parameters<typeof planEnqueue>[0]) =>
  planEnqueue(entityEntries, entry);

describe.each(factories)("OutboxStore — %s", (_name, createStore) => {
  it("no fusiona cambios de otra sesión ni pierde una dependencia nueva", async () => {
    const store = createStore();
    await store.enqueue([
      newEntry(),
      newEntry({ operation: "UPDATE", enqueuedBy: "u2", payload: { id: "p1", amount: 150 } }),
      newEntry({ operation: "UPDATE", enqueuedBy: "u2", payload: { id: "p1", amount: 200 }, dependsOn: [{ entityName: "Order", entityId: "o1" }] }),
    ], plan);
    expect(await store.listOutstanding()).toHaveLength(3);
    expect((await store.listOutstanding())[2].dependsOn).toEqual([{ entityName: "Order", entityId: "o1" }]);
  });
  it("asigna seq creciente y lista lo no confirmado en orden", async () => {
    const store = createStore();
    const saved = await store.enqueue(
      [newEntry({ entityId: "a" }), newEntry({ entityId: "b" }), newEntry({ entityId: "c" })],
      plan
    );
    expect(saved[0].seq).toBeLessThan(saved[1].seq);
    expect(saved[1].seq).toBeLessThan(saved[2].seq);

    await store.update(saved[1].seq, { status: "DONE", syncedAt: 1 });
    const outstanding = await store.listOutstanding();
    expect(outstanding.map((entry) => entry.entityId)).toEqual(["a", "c"]);
  });

  it("dentro de un lote, una edición de la misma entidad se fusiona", async () => {
    const store = createStore();
    await store.enqueue(
      [
        newEntry({ payload: { id: "p1", amount: 100, notes: "a" } }),
        newEntry({ operation: "UPDATE", payload: { id: "p1", amount: 150 } }),
      ],
      plan
    );
    const outstanding = await store.listOutstanding();
    expect(outstanding).toHaveLength(1);
    expect(outstanding[0]).toMatchObject({
      operation: "CREATE",
      payload: { id: "p1", amount: 150, notes: "a" },
    });
  });

  it("si algo falla a mitad del lote, no queda guardado nada del lote", async () => {
    const store = createStore();
    await store.enqueue([newEntry({ entityId: "previo" })], plan);

    let calls = 0;
    await expect(
      store.enqueue(
        [newEntry({ entityId: "a" }), newEntry({ entityId: "b" }), newEntry({ entityId: "c" })],
        (entry, entityEntries) => {
          calls += 1;
          if (calls === 3) throw new Error("falla simulada");
          return planEnqueue(entityEntries, entry);
        }
      )
    ).rejects.toThrow("falla simulada");

    const outstanding = await store.listOutstanding();
    expect(outstanding.map((entry) => entry.entityId)).toEqual(["previo"]);
  });

  it("claim devuelve lo que hay en disco y lo pasa a SYNCING una sola vez", async () => {
    const store = createStore();
    const [created] = await store.enqueue([newEntry()], plan);
    // Una edición fusionada después del snapshot.
    await store.enqueue([newEntry({ operation: "UPDATE", payload: { id: "p1", amount: 150 } })], plan);

    const claimed = await store.claim(created.seq, 5);
    expect(claimed).toMatchObject({ status: "SYNCING", sendCount: 1, payload: { amount: 150 } });
    await expect(store.claim(created.seq, 6)).resolves.toBeNull();
  });

  it("claim no toma lo bloqueado ni lo confirmado", async () => {
    const store = createStore();
    const [blocked, done] = await store.enqueue(
      [newEntry({ entityId: "a" }), newEntry({ entityId: "b" })],
      plan
    );
    await store.update(blocked.seq, { status: "BLOCKED" });
    await store.update(done.seq, { status: "DONE", syncedAt: 1 });

    await expect(store.claim(blocked.seq, 1)).resolves.toBeNull();
    await expect(store.claim(done.seq, 1)).resolves.toBeNull();
  });

  it("update con undefined borra el campo", async () => {
    const store = createStore();
    const [entry] = await store.enqueue([newEntry()], plan);
    await store.update(entry.seq, { lastError: "x", lastErrorKind: "transient" });
    await store.update(entry.seq, { lastError: undefined, lastErrorKind: undefined });

    const [stored] = await store.listOutstanding();
    expect("lastError" in stored).toBe(false);
    expect("lastErrorKind" in stored).toBe(false);
  });

  it("resetInFlight, expediteRetries y releaseBlocked solo tocan su estado", async () => {
    const store = createStore();
    const [syncing, failedNet, failedOther, blocked] = await store.enqueue(
      [
        newEntry({ entityId: "a" }),
        newEntry({ entityId: "b" }),
        newEntry({ entityId: "c" }),
        newEntry({ entityId: "d" }),
      ],
      plan
    );
    await store.update(syncing.seq, { status: "SYNCING" });
    await store.update(failedNet.seq, { status: "FAILED", lastErrorKind: "transient", nextAttemptAt: 999 });
    await store.update(failedOther.seq, { status: "FAILED", lastErrorKind: "unknown", nextAttemptAt: 999 });
    await store.update(blocked.seq, { status: "BLOCKED", attempts: 8 });

    expect(await store.resetInFlight(10)).toBe(1);
    expect(await store.expediteRetries(10, ["transient"])).toBe(1);
    expect(await store.releaseBlocked(10)).toBe(1);

    const byId = Object.fromEntries((await store.listOutstanding()).map((e) => [e.entityId, e]));
    expect(byId.a.status).toBe("PENDING");
    expect(byId.b.nextAttemptAt).toBe(10);
    expect(byId.c.nextAttemptAt).toBe(999);
    expect(byId.d).toMatchObject({ status: "PENDING", attempts: 0 });
  });

  it("releaseBlocked con seq libera solo esa entrada", async () => {
    const store = createStore();
    const [a, b] = await store.enqueue([newEntry({ entityId: "a" }), newEntry({ entityId: "b" })], plan);
    await store.update(a.seq, { status: "BLOCKED" });
    await store.update(b.seq, { status: "BLOCKED" });

    expect(await store.releaseBlocked(1, b.seq)).toBe(1);
    const summary = await store.summary();
    expect(summary).toMatchObject({ BLOCKED: 1, PENDING: 1 });
  });

  it("reassignEnqueuedBy solo cambia lo de otro usuario sin confirmar", async () => {
    const store = createStore();
    const [mine, other, otherDone] = await store.enqueue(
      [
        newEntry({ entityId: "a", enqueuedBy: "u1" }),
        newEntry({ entityId: "b", enqueuedBy: "u2" }),
        newEntry({ entityId: "c", enqueuedBy: "u2" }),
        newEntry({ entityId: "d", enqueuedBy: null }),
      ],
      plan
    );
    await store.update(otherDone.seq, { status: "DONE", syncedAt: 1 });

    expect(await store.reassignEnqueuedBy("u1", 5)).toBe(1);
    const owners = (await store.listOutstanding()).map((e) => [e.entityId, e.enqueuedBy]);
    expect(owners).toEqual([
      ["a", "u1"],
      ["b", "u1"],
      ["d", null],
    ]);
    expect(mine.seq).toBeLessThan(other.seq);
  });

  it("listByEntity trae todas las entradas de un modelo, confirmadas incluidas", async () => {
    const store = createStore();
    const [done] = await store.enqueue(
      [
        newEntry({ entityId: "a" }),
        newEntry({ entityId: "b" }),
        newEntry({ entityName: "Order", entityId: "o1" }),
      ],
      plan
    );
    await store.update(done.seq, { status: "DONE", syncedAt: 1 });

    const payments = await store.listByEntity("Payment");
    expect(payments.map((entry) => [entry.entityId, entry.status])).toEqual([
      ["a", "DONE"],
      ["b", "PENDING"],
    ]);
  });

  it("purgeConfirmed solo borra DONE confirmados antes del corte", async () => {
    const store = createStore();
    const [oldDone, newDone, pending] = await store.enqueue(
      [newEntry({ entityId: "a" }), newEntry({ entityId: "b" }), newEntry({ entityId: "c" })],
      plan
    );
    await store.update(oldDone.seq, { status: "DONE", syncedAt: 100 });
    await store.update(newDone.seq, { status: "DONE", syncedAt: 900 });
    await store.update(pending.seq, { status: "FAILED", syncedAt: 1 });

    expect(await store.purgeConfirmed(500)).toBe(1);
    expect(await store.summary()).toMatchObject({ DONE: 1, FAILED: 1 });
  });
});
