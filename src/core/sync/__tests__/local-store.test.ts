import "fake-indexeddb/auto";

import { LocalStore } from "@/core/sync/local-store";
import { freshDatabase } from "@/core/sync/test-utils/test-registry";

const newStore = () => new LocalStore(freshDatabase("local-store-test"));

describe("LocalStore", () => {
  it("un tombstone viejo no borra un pago más nuevo", async () => {
    const store = newStore();
    await store.applyRemote("Payment", [{ id: "p1", amount: 150, _version: 3 }]);
    expect(await store.applyRemote("Payment", [{ id: "p1", _version: 2, _deleted: true }])).toEqual({ saved: 0, deleted: 0, stale: 1 });
    expect((await store.get("Payment", "p1"))?.amount).toBe(150);
  });

  it("conserva el borrado para rechazar respuestas anteriores que lleguen después", async () => {
    const store = newStore();
    await store.applyRemote("Payment", [{ id: "p1", _version: 3, _deleted: true }]);
    expect(await store.applyRemote("Payment", [{ id: "p1", amount: 100, _version: 2 }])).toEqual({ saved: 0, deleted: 0, stale: 1 });
    expect(await store.get("Payment", "p1")).toBeUndefined();
    expect(await store.listAll("Payment")).toEqual([]);
    expect(await store.count("Payment")).toBe(0);
    await store.applyRemote("Payment", [{ id: "p1", _version: 3, amount: 100 }]);
    expect(await store.get("Payment", "p1")).toBeUndefined();
    expect(await store.listByIds("Payment", ["p1"])).toEqual([{ id: "p1", _version: 3, _deleted: true }]);
  });

  it("dos copias del mismo id en un lote conservan la versión mayor", async () => {
    const store = newStore();
    await store.applyRemote("Payment", [{ id: "p1", amount: 150, _version: 3 }, { id: "p1", amount: 100, _version: 2 }]);
    expect((await store.get("Payment", "p1"))?.amount).toBe(150);
  });

  it("guarda lo que llega del servidor y lo consulta por índice", async () => {
    const store = newStore();
    await store.applyRemote("Payment", [
      { id: "p1", orderId: "o1", date: "2026-10-01T10:00:00.000Z", _version: 1 },
      { id: "p2", orderId: "o2", date: "2026-10-02T10:00:00.000Z", _version: 1 },
      { id: "p3", chargeNoteId: "c1", date: "2026-10-03T10:00:00.000Z", _version: 1 },
    ]);

    expect((await store.listWhereAnyOf("Payment", "orderId", ["o1", "o2"])).map((p) => p.id).sort()).toEqual([
      "p1",
      "p2",
    ]);
    expect(
      (
        await store.listBetween("Payment", "date", "2026-10-02T00:00:00.000Z", "2026-10-03T23:59:59.999Z")
      ).map((p) => p.id)
    ).toEqual(["p2", "p3"]);
    expect(await store.count("Payment")).toBe(3);
  });

  it("nunca pisa un registro con uno más viejo", async () => {
    const store = newStore();
    await store.applyRemote("Payment", [{ id: "p1", amount: 150, _version: 3 }]);

    const result = await store.applyRemote("Payment", [{ id: "p1", amount: 100, _version: 2 }]);

    expect(result).toEqual({ saved: 0, deleted: 0, stale: 1 });
    expect((await store.get("Payment", "p1"))?.amount).toBe(150);
  });

  it("una versión igual o más nueva sí reemplaza", async () => {
    const store = newStore();
    await store.applyRemote("Payment", [{ id: "p1", amount: 100, _version: 2 }]);
    await store.applyRemote("Payment", [{ id: "p1", amount: 120, _version: 3 }]);
    expect((await store.get("Payment", "p1"))?.amount).toBe(120);
  });

  it("lo que llega borrado se quita del equipo", async () => {
    const store = newStore();
    await store.applyRemote("Payment", [{ id: "p1", _version: 1 }]);

    const result = await store.applyRemote("Payment", [{ id: "p1", _version: 2, _deleted: true }]);

    expect(result.deleted).toBe(1);
    expect(await store.get("Payment", "p1")).toBeUndefined();
  });

  it("no guarda __typename", async () => {
    const store = newStore();
    await store.applyRemote("Payment", [{ id: "p1", __typename: "Payment", _version: 1 }]);
    expect(await store.get("Payment", "p1")).not.toHaveProperty("__typename");
  });

  it("guarda y lee el estado de sincronización", async () => {
    const store = newStore();
    await store.saveSyncState({ key: "Payment#u1", lastSyncAt: 10, cursor: "page-7" });
    expect(await store.getSyncState("Payment#u1")).toMatchObject({ lastSyncAt: 10, cursor: "page-7" });
    expect(await store.getSyncState("Payment#otro")).toBeUndefined();
  });
});
