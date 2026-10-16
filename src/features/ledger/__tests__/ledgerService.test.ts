import "fake-indexeddb/auto";

import { computeBalances } from "../domain/balances";
import { SEED_ENVELOPES, seedMovements } from "../domain/seed";
import { LedgerRuleError } from "../errors/ledger-errors";
import { LedgerDatabase } from "../repositories/ledgerDatabase";
import { createLedgerRepository } from "../repositories/ledger.repository";
import { createLedgerService } from "../services/ledger.service";

let n = 0;
function setup() {
  const db = new LedgerDatabase(`ledger-service-${++n}`);
  const repository = createLedgerRepository(() => db);
  let id = 0;
  const service = createLedgerService({ repository, now: () => new Date("2026-10-15T18:00:00.000Z"), newId: () => `new-${++id}` });
  return { repository, service };
}

describe("ledgerService", () => {
  it("la primera vez siembra; después solo lee", async () => {
    const { service, repository } = setup();
    const first = await service.load();
    expect(first.movements).toHaveLength(seedMovements().length);
    await repository.addMovement({ ...seedMovements()[0], id: "extra", createdAt: "2026-10-15T00:00:00.000Z" });
    const second = await service.load();
    expect(second.movements).toHaveLength(seedMovements().length + 1);
  });

  it("registra un gasto con tarjeta y completa su sobre de reserva", async () => {
    const { service } = setup();
    await service.load();
    const movement = await service.record({ kind: "expense", date: "2026-10-15", concept: "  Súper ", amountMinor: 50000, accountId: "visa", envelopeId: "week" });
    expect(movement).toMatchObject({ id: "new-1", concept: "Súper", reserveEnvelopeId: "card", createdAt: "2026-10-15T18:00:00.000Z" });
  });

  it("rechaza con un error tipado y su campo", async () => {
    const { service } = setup();
    await service.load();
    const attempt = service.record({ kind: "assignment", date: "2026-10-15", concept: "Mover", amountMinor: 99999999, envelopeId: "week", toEnvelopeId: "savings" });
    await expect(attempt).rejects.toBeInstanceOf(LedgerRuleError);
    await expect(attempt).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS", fieldErrors: { amountMinor: expect.any(String) } });
  });

  it("cancela un movimiento una sola vez", async () => {
    const { service } = setup();
    await service.load();
    const moved = await service.record({ kind: "assignment", date: "2026-10-15", concept: "Mover", amountMinor: 10000, envelopeId: "available", toEnvelopeId: "savings" });
    const reversal = await service.cancel(moved.id, "2026-10-15");
    expect(reversal).toMatchObject({ kind: "reversal", reversalOf: moved.id, concept: "Cancelación: Mover" });
    await expect(service.cancel(moved.id, "2026-10-15")).rejects.toMatchObject({ code: "ALREADY_REVERSED" });
  });

  it("crea un sobre al final, rechaza nombres repetidos y solo archiva sobres vacíos", async () => {
    const { service } = setup();
    const { envelopes } = await service.load();
    const trip = await service.saveEnvelope({ id: "trip", name: " Viajes ", description: "", color: "#6fbcc6", icon: "piggy", order: 0, archived: false });
    expect(trip).toMatchObject({ name: "Viajes", order: envelopes.length, archived: false });
    await expect(service.saveEnvelope({ ...SEED_ENVELOPES[2], id: "dup", name: "ahorro" })).rejects.toMatchObject({ code: "NAME_TAKEN" });
    await expect(service.archiveEnvelope("savings")).rejects.toMatchObject({ code: "NOT_EMPTY" });
    await expect(service.archiveEnvelope("available")).rejects.toMatchObject({ code: "PROTECTED" });
    await expect(service.archiveEnvelope("card")).rejects.toMatchObject({ code: "PROTECTED" });
    expect(await service.archiveEnvelope("trip")).toMatchObject({ archived: true });
  });

  it("caben 8 sobres activos; para crear otro hay que archivar uno", async () => {
    const { service } = setup();
    await service.load(); // 6 sobres
    const make = (id: string) => service.saveEnvelope({ id, name: id, description: "", color: "#6fbcc6", icon: "wallet", order: 0, archived: false });
    await make("seven");
    await make("eight");
    await expect(make("nine")).rejects.toMatchObject({ code: "TOO_MANY" });
    await service.archiveEnvelope("eight");
    await expect(make("nine")).resolves.toMatchObject({ id: "nine" });
  });

  it("los saldos se recalculan con lo guardado (sobreviven a recargar)", async () => {
    const { service } = setup();
    await service.load();
    await service.record({ kind: "assignment", date: "2026-10-15", concept: "Mover", amountMinor: 10000, envelopeId: "available", toEnvelopeId: "savings" });
    const reloaded = await service.load();
    const before = computeBalances({ ...reloaded, movements: seedMovements() });
    const after = computeBalances(reloaded);
    expect(after.envelopes.savings - before.envelopes.savings).toBe(10000);
  });

  it("guarda ajustes de tarjeta e ingresos validados", async () => {
    const { service } = setup();
    const { settings } = await service.load();
    expect(await service.saveCardSettings("visa", { cutoffDay: 31, paymentDays: 18 })).toMatchObject({ card: { cutoffDay: 31, paymentDays: 18, reserveEnvelopeId: "card" } });
    await expect(service.saveCardSettings("visa", { cutoffDay: 40, paymentDays: 18 })).rejects.toMatchObject({ fieldErrors: { cutoffDay: expect.any(String) } });
    await expect(service.saveSettings({ ...settings!, recurringIncome: [{ id: "x", label: "Bono", weekday: 3, accountId: "visa" }] })).rejects.toBeInstanceOf(LedgerRuleError);
    expect((await service.saveSettings({ ...settings!, recurringIncome: [{ id: "x", label: " Bono ", weekday: 3, accountId: "debit" }] })).recurringIncome[0].label).toBe("Bono");
    expect((await service.load()).accounts.find((a) => a.id === "visa")?.card?.cutoffDay).toBe(31);
  });
});
