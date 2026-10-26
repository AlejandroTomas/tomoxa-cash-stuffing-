import "fake-indexeddb/auto";

import { computeBalances } from "../domain/balances";
import { EMPTY_ENVELOPES, SEED_ENVELOPES, seedMovements } from "../domain/seed";
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
  it("la primera vez no hay libro: no se siembra solo", async () => {
    const { service } = setup();
    expect(await service.open()).toBeNull();
  });

  it("empezar con el ejemplo guarda su historia; después solo lee", async () => {
    const { service, repository } = setup();
    const first = await service.start("sample");
    expect(first.movements).toHaveLength(seedMovements().length);
    await repository.addMovement({ ...seedMovements()[0], id: "extra", createdAt: "2026-10-15T00:00:00.000Z" });
    expect((await service.open())?.movements).toHaveLength(seedMovements().length + 1);
  });

  it("empezar de cero quita los sobres, ingresos y movimientos de ejemplo", async () => {
    const { service } = setup();
    await service.start("sample");
    const empty = await service.start("empty");
    expect(empty.movements).toEqual([]);
    expect(empty.envelopes.map((envelope) => envelope.id)).toEqual(EMPTY_ENVELOPES.map((envelope) => envelope.id));
    expect(empty.envelopes.every((envelope) => !envelope.budget)).toBe(true);
    expect(empty.settings?.recurringIncome).toEqual([]);
    expect(Object.values(computeBalances(empty).envelopes).every((amount) => amount === 0)).toBe(true);
  });

  it("registra un gasto con tarjeta y completa su sobre de reserva", async () => {
    const { service } = setup();
    await service.start("sample");
    const movement = await service.record({ kind: "expense", date: "2026-10-15", concept: "  Súper ", amountMinor: 50000, accountId: "visa", envelopeId: "week" });
    expect(movement).toMatchObject({ id: "new-1", concept: "Súper", reserveEnvelopeId: "card", createdAt: "2026-10-15T18:00:00.000Z" });
  });

  it("rechaza con un error tipado y su campo", async () => {
    const { service } = setup();
    await service.start("sample");
    const attempt = service.record({ kind: "assignment", date: "2026-10-15", concept: "Mover", amountMinor: 99999999, envelopeId: "week", toEnvelopeId: "savings" });
    await expect(attempt).rejects.toBeInstanceOf(LedgerRuleError);
    await expect(attempt).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS", fieldErrors: { amountMinor: expect.any(String) } });
  });

  it("cancela un movimiento una sola vez", async () => {
    const { service } = setup();
    await service.start("sample");
    const moved = await service.record({ kind: "assignment", date: "2026-10-15", concept: "Mover", amountMinor: 10000, envelopeId: "available", toEnvelopeId: "savings" });
    const [reversal] = await service.cancel(moved.id, "2026-10-15");
    expect(reversal).toMatchObject({ kind: "reversal", reversalOf: moved.id, concept: "Cancelación: Mover" });
    await expect(service.cancel(moved.id, "2026-10-15")).rejects.toMatchObject({ code: "ALREADY_REVERSED" });
  });

  it("crea un sobre al final, rechaza nombres repetidos y solo archiva sobres vacíos", async () => {
    const { service } = setup();
    const { envelopes } = await service.start("sample");
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
    await service.start("sample"); // 6 sobres
    const make = (id: string) => service.saveEnvelope({ id, name: id, description: "", color: "#6fbcc6", icon: "wallet", order: 0, archived: false });
    await make("seven");
    await make("eight");
    await expect(make("nine")).rejects.toMatchObject({ code: "TOO_MANY" });
    await service.archiveEnvelope("eight");
    await expect(make("nine")).resolves.toMatchObject({ id: "nine" });
  });

  it("los saldos se recalculan con lo guardado (sobreviven a recargar)", async () => {
    const { service } = setup();
    await service.start("sample");
    await service.record({ kind: "assignment", date: "2026-10-15", concept: "Mover", amountMinor: 10000, envelopeId: "available", toEnvelopeId: "savings" });
    const reloaded = await service.load();
    const before = computeBalances({ ...reloaded, movements: seedMovements() });
    const after = computeBalances(reloaded);
    expect(after.envelopes.savings - before.envelopes.savings).toBe(10000);
  });

  it("guarda ajustes de tarjeta e ingresos validados", async () => {
    const { service } = setup();
    const { settings } = await service.start("sample");
    const visa = { id: "visa", name: "Tarjeta de crédito", kind: "credit" as const };
    expect((await service.saveAccount({ ...visa, cutoffDay: 31, paymentDays: 18 })).account).toMatchObject({ card: { cutoffDay: 31, paymentDays: 18, reserveEnvelopeId: "card" } });
    await expect(service.saveAccount({ ...visa, cutoffDay: 40, paymentDays: 18 })).rejects.toMatchObject({ fieldErrors: { cutoffDay: expect.any(String) } });
    await expect(service.saveSettings({ ...settings!, recurringIncome: [{ id: "x", label: "Bono", weekday: 3, accountId: "visa" }] })).rejects.toBeInstanceOf(LedgerRuleError);
    expect((await service.saveSettings({ ...settings!, recurringIncome: [{ id: "x", label: " Bono ", weekday: 3, accountId: "debit" }] })).recurringIncome[0].label).toBe("Bono");
    expect((await service.load()).accounts.find((a) => a.id === "visa")?.card?.cutoffDay).toBe(31);
  });

  it("agrega varias cuentas de débito y tarjetas, cada tarjeta con su sobre de reserva", async () => {
    const { service } = setup();
    await service.start("empty");
    const bbva = await service.saveAccount({ name: " BBVA ", kind: "debit" });
    expect(bbva).toEqual({ account: { id: "new-1", name: "BBVA", kind: "debit", archived: false }, envelope: null });
    const nu = await service.saveAccount({ name: "Nu", kind: "credit", cutoffDay: 5, paymentDays: 20 });
    expect(nu.account.card).toEqual({ cutoffDay: 5, paymentDays: 20, reserveEnvelopeId: nu.envelope?.id });
    expect(nu.envelope).toMatchObject({ name: "Nu", icon: "card", archived: false });
    await expect(service.saveAccount({ name: "nu", kind: "debit" })).rejects.toMatchObject({ code: "NAME_TAKEN" });

    // Renombrar la tarjeta renombra su reserva (si se llamaba igual).
    const renamed = await service.saveAccount({ id: nu.account.id, name: "Nu bank", kind: "credit", cutoffDay: 5, paymentDays: 20 });
    expect(renamed.envelope?.name).toBe("Nu bank");

    // Una compra con la nueva tarjeta va a su propia reserva.
    await service.record({ kind: "income", date: "2026-10-15", concept: "Nómina", amountMinor: 100000, accountId: "new-1", envelopeId: "available" });
    const purchase = await service.record({ kind: "expense", date: "2026-10-15", concept: "Cena", amountMinor: 30000, accountId: nu.account.id, envelopeId: "available" });
    expect(purchase.reserveEnvelopeId).toBe(nu.envelope?.id);
    expect(computeBalances(await service.load()).envelopes[nu.envelope!.id]).toBe(30000);

    // Solo se archiva vacía: primero se paga y se libera la reserva.
    await expect(service.archiveAccount(nu.account.id)).rejects.toMatchObject({ code: "NOT_EMPTY" });
    await service.record({ kind: "cardPayment", date: "2026-10-15", concept: "Pago", amountMinor: 30000, accountId: "new-1", toAccountId: nu.account.id });
    const archived = await service.archiveAccount(nu.account.id);
    expect(archived.account.archived).toBe(true);
    expect(archived.envelope).toMatchObject({ id: nu.envelope?.id, archived: true });
    await expect(service.archiveAccount("new-1")).rejects.toMatchObject({ code: "NOT_EMPTY" });
  });

  it("un gasto pagado con efectivo y tarjeta se guarda y se cancela completo", async () => {
    const { service } = setup();
    await service.start("sample");
    const base = { kind: "expense" as const, date: "2026-10-15", concept: "Súper", envelopeId: "week" };
    const parts = await service.recordSplit([
      { ...base, amountMinor: 20000, accountId: "cash" },
      { ...base, amountMinor: 30000, accountId: "visa" },
    ]);
    expect(parts).toHaveLength(2);
    expect(parts[0].splitId).toBeDefined();
    expect(parts[1]).toMatchObject({ splitId: parts[0].splitId, reserveEnvelopeId: "card" });
    await expect(service.recordSplit([{ ...base, amountMinor: 100, accountId: "cash" }, { ...base, amountMinor: 100, accountId: "cash" }])).rejects.toMatchObject({ code: "INVALID_SPLIT" });

    const before = computeBalances({ ...(await service.load()), movements: seedMovements() });
    const reversals = await service.cancel(parts[0].id, "2026-10-15");
    expect(reversals.map((reversal) => reversal.reversalOf)).toEqual([parts[0].id, parts[1].id]);
    const after = computeBalances(await service.load());
    expect(after.envelopes).toEqual(before.envelopes);
    expect(after.accounts).toEqual(before.accounts);
    expect(after.debt).toEqual(before.debt);
  });

  it("si un pago dividido no alcanza, no se guarda ninguna parte", async () => {
    const { service } = setup();
    const { movements } = await service.start("sample");
    const base = { kind: "expense" as const, date: "2026-10-15", concept: "Súper", envelopeId: "week" };
    await expect(service.recordSplit([{ ...base, amountMinor: 100, accountId: "visa" }, { ...base, amountMinor: 99999999, accountId: "cash" }])).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect((await service.load()).movements).toHaveLength(movements.length);
  });

  it("compra a meses: sube la deuda, el sobre aparta cada mensualidad una vez", async () => {
    const { service } = setup();
    await service.start("sample");
    const purchase = await service.record({ kind: "expense", date: "2026-10-15", concept: "Colchón", amountMinor: 1800000, accountId: "visa", envelopeId: "available", installments: 18 });
    const data = await service.load();
    const before = computeBalances({ ...data, movements: seedMovements() });
    const after = computeBalances(data);
    expect(after.debt.visa - before.debt.visa).toBe(1800000);
    expect(after.envelopes.available).toBe(before.envelopes.available);

    const setAside = { kind: "assignment" as const, date: "2026-10-15", concept: "Mensualidad 1 de 18: Colchón", amountMinor: 100000, envelopeId: "available", toEnvelopeId: "card", installmentOf: purchase.id, installmentNumber: 1 };
    await service.record(setAside);
    await expect(service.record(setAside)).rejects.toMatchObject({ code: "INVALID_INSTALLMENTS" });
    await expect(service.record({ ...setAside, installmentNumber: 2, amountMinor: 5000 })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(service.record({ ...setAside, installmentNumber: 2, toEnvelopeId: "savings" })).rejects.toMatchObject({ code: "WRONG_ACCOUNT_KIND" });
    await expect(service.record({ kind: "expense", date: "2026-10-15", concept: "Tele", amountMinor: 900000, accountId: "debit", envelopeId: "available", installments: 6 })).rejects.toMatchObject({
      code: "INVALID_INSTALLMENTS",
    });
  });
});
