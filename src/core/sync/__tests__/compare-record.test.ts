
import { diffSentVsStored } from "@/core/sync/compare-record";

describe("diffSentVsStored", () => {
  it("el mismo registro no tiene diferencias", () => {
    const sent = { id: "p1", amount: 100, notes: "a", isActive: true };
    expect(diffSentVsStored(sent, { ...sent, _version: 1, createdAt: "2026-10-02T00:00:00.000Z" })).toEqual(
      []
    );
  });

  it("detecta un valor distinto", () => {
    expect(diffSentVsStored({ id: "p1", amount: 150 }, { id: "p1", amount: 100 })).toEqual([
      { field: "amount", sent: 150, stored: 100 },
    ]);
  });

  it("ignora campos sin valor en alguno de los dos lados", () => {
    // Un default del servidor (settlementStatus) o un campo que no vino en la respuesta.
    expect(
      diffSentVsStored(
        { id: "p1", settlementStatus: null, notes: "x", folio: undefined },
        { id: "p1", settlementStatus: "PENDING", folio: "F-1" }
      )
    ).toEqual([]);
  });

  it("compara fechas ISO como instante, no como texto", () => {
    expect(
      diffSentVsStored({ date: "2026-10-02T10:00:00Z" }, { date: "2026-10-02T10:00:00.000Z" })
    ).toEqual([]);
    expect(
      diffSentVsStored({ date: "2026-10-02T10:00:00Z" }, { date: "2026-10-02T11:00:00.000Z" })
    ).toHaveLength(1);
  });

  it("compara AWSJSON por valor, sin importar espacios ni orden de llaves", () => {
    expect(
      diffSentVsStored(
        { invoicedProducts: '[{"productID":"a","quantity":2}]' },
        { invoicedProducts: '[{"quantity": 2, "productID": "a"}]' }
      )
    ).toEqual([]);
  });

  it("compara listas y objetos anidados", () => {
    expect(diffSentVsStored({ tags: ["a", "b"] }, { tags: ["a", "b"] })).toEqual([]);
    expect(diffSentVsStored({ tags: ["a", "b"] }, { tags: ["a"] })).toHaveLength(1);
    expect(
      diffSentVsStored({ address: { street: "x", zip: null } }, { address: { street: "x", zip: "1" } })
    ).toEqual([]);
  });

  it("nunca compara el id", () => {
    expect(diffSentVsStored({ id: "a" }, { id: "b" })).toEqual([]);
  });
});
