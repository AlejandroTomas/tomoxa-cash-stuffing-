
import { entityKey, isRunnable, nextAttemptDelay, planEnqueue } from "@/core/sync/queue-rules";
import type { OutboxEntry } from "@/core/sync/types";

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    seq: 1,
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

describe("planEnqueue", () => {
  it("fusiona un UPDATE en un CREATE que nunca se mandó", () => {
    const plan = planEnqueue([entry()], { operation: "UPDATE", payload: { id: "p1", amount: 150 } });
    expect(plan).toEqual({
      kind: "merge",
      seq: 1,
      operation: "CREATE",
      payload: { id: "p1", amount: 150 },
    });
  });

  it("no fusiona si el CREATE ya se intentó mandar: la edición va aparte", () => {
    const plan = planEnqueue([entry({ sendCount: 1, status: "FAILED" })], {
      operation: "UPDATE",
      payload: { id: "p1", amount: 150 },
    });
    expect(plan).toEqual({ kind: "append" });
  });

  it("no fusiona en un CREATE que volvió a PENDING tras un envío interrumpido", () => {
    const plan = planEnqueue([entry({ sendCount: 1, status: "PENDING" })], {
      operation: "UPDATE",
      payload: { id: "p1", amount: 150 },
    });
    expect(plan).toEqual({ kind: "append" });
  });

  it("nunca fusiona un CREATE ni un DELETE nuevos", () => {
    expect(planEnqueue([entry()], { operation: "DELETE", payload: { id: "p1" } })).toEqual({
      kind: "append",
    });
    expect(planEnqueue([entry()], { operation: "CREATE", payload: { id: "p1" } })).toEqual({
      kind: "append",
    });
  });

  it("no fusiona sobre un DELETE pendiente", () => {
    const plan = planEnqueue([entry({ operation: "DELETE" })], {
      operation: "UPDATE",
      payload: { id: "p1" },
    });
    expect(plan).toEqual({ kind: "append" });
  });
});

describe("isRunnable", () => {
  const keysOf = (...entries: OutboxEntry[]) => new Set(entries.map(entityKey));

  it("espera a que se confirme la operación anterior de la misma entidad", () => {
    const create = entry({ seq: 1, status: "FAILED", nextAttemptAt: 99 });
    const update = entry({ seq: 2, operation: "UPDATE" });
    expect(isRunnable(update, keysOf(create), 0)).toBe(false);
    expect(isRunnable(update, keysOf(), 0)).toBe(true);
  });

  it("espera a sus dependencias", () => {
    const order = entry({ seq: 1, entityName: "Order", entityId: "o1", status: "BLOCKED" });
    const payment = entry({
      seq: 2,
      dependsOn: [{ entityName: "Order", entityId: "o1" }],
    });
    expect(isRunnable(payment, keysOf(order), 0)).toBe(false);
  });

  it("no frena por otra entidad sin relación", () => {
    const other = entry({ seq: 1, entityId: "p0", status: "BLOCKED" });
    expect(isRunnable(entry({ seq: 2 }), keysOf(other), 0)).toBe(true);
  });

  it("un FAILED corre solo cuando venció su espera; un BLOCKED nunca solo", () => {
    expect(isRunnable(entry({ status: "FAILED", nextAttemptAt: 10 }), keysOf(), 5)).toBe(false);
    expect(isRunnable(entry({ status: "FAILED", nextAttemptAt: 10 }), keysOf(), 10)).toBe(true);
    expect(isRunnable(entry({ status: "BLOCKED" }), keysOf(), 1_000)).toBe(false);
  });

  it("si el reloj se atrasó y la espera quedó más larga que la máxima, la da por vencida", () => {
    const failed = entry({ status: "FAILED", nextAttemptAt: 10 * 24 * 60 * 60_000 });
    expect(isRunnable(failed, keysOf(), 0, 60_000)).toBe(true);
    expect(isRunnable(entry({ status: "FAILED", nextAttemptAt: 30_000 }), keysOf(), 0, 60_000)).toBe(
      false
    );
  });
});

describe("nextAttemptDelay", () => {
  const options = { baseDelayMs: 1_000, maxDelayMs: 8_000 };

  it("crece exponencialmente hasta el tope", () => {
    const noJitter = () => 0;
    expect([1, 2, 3, 4, 5].map((n) => nextAttemptDelay(n, options, noJitter))).toEqual([
      1_000, 2_000, 4_000, 8_000, 8_000,
    ]);
  });

  it("agrega a lo más 25 % de jitter", () => {
    expect(nextAttemptDelay(1, options, () => 1)).toBe(1_250);
  });
});
