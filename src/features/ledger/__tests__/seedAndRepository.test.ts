import "fake-indexeddb/auto";

import { computeBalances, totalCash, unbackedDebt } from "../domain/balances";
import { DEFAULT_SETTINGS, SEED_ACCOUNTS, SEED_DRAFTS, SEED_ENVELOPES, seedMovements } from "../domain/seed";
import type { LedgerSnapshot } from "../domain/types";
import { checkMovement } from "../domain/validation";
import { LedgerDatabase } from "../repositories/ledgerDatabase";
import { createLedgerRepository } from "../repositories/ledger.repository";

describe("datos iniciales", () => {
  it("cada movimiento de la historia es válido en su momento y los sobres siempre suman el dinero real", () => {
    const movements = seedMovements();
    let snapshot: LedgerSnapshot = { accounts: SEED_ACCOUNTS, envelopes: SEED_ENVELOPES, movements: [] };
    movements.forEach((movement, index) => {
      const issue = checkMovement(SEED_DRAFTS[index], snapshot);
      expect({ index, concept: movement.concept, issue }).toEqual({ index, concept: movement.concept, issue: null });
      snapshot = { ...snapshot, movements: [...snapshot.movements, movement] };
      const b = computeBalances(snapshot);
      expect(Object.values(b.envelopes).reduce((s, v) => s + v, 0)).toBe(totalCash(b));
    });
  });

  it("termina con saldos sanos: ningún sobre sobregirado, deuda respaldada", () => {
    const b = computeBalances({ accounts: SEED_ACCOUNTS, envelopes: SEED_ENVELOPES, movements: seedMovements() });
    for (const value of Object.values(b.envelopes)) expect(value).toBeGreaterThanOrEqual(0);
    expect(b.debt.visa).toBeGreaterThan(0);
    expect(unbackedDebt(b, SEED_ACCOUNTS)).toBe(0);
    // Documenta los saldos de arranque (si cambias la historia, revisa que sigan teniendo sentido).
    expect(b.envelopes).toMatchSnapshot();
  });

  it("ids únicos y orden de registro igual al de la historia", () => {
    const movements = seedMovements();
    expect(new Set(movements.map((m) => m.id)).size).toBe(movements.length);
    const sorted = [...movements].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(sorted.map((m) => m.id)).toEqual(movements.map((m) => m.id));
  });
});

describe("repositorio (IndexedDB)", () => {
  let n = 0;
  const fresh = () => {
    const db = new LedgerDatabase(`ledger-test-${++n}`);
    return { db, repo: createLedgerRepository(() => db) };
  };

  it("siembra una vez y lee todo en orden", async () => {
    const { repo } = fresh();
    expect(await repo.isSeeded()).toBe(false);
    await repo.seed({ accounts: SEED_ACCOUNTS, envelopes: SEED_ENVELOPES, movements: seedMovements(), settings: DEFAULT_SETTINGS }, "2026-10-15T10:00:00.000Z");
    expect(await repo.isSeeded()).toBe(true);
    const data = await repo.loadAll();
    expect(data.accounts).toHaveLength(SEED_ACCOUNTS.length);
    expect(data.envelopes.map((e) => e.id)).toEqual(SEED_ENVELOPES.map((e) => e.id));
    expect(data.movements.map((m) => m.id)).toEqual(seedMovements().map((m) => m.id));
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("agrega movimientos y no deja repetir un id", async () => {
    const { repo } = fresh();
    const movement = seedMovements()[0];
    await repo.addMovement(movement);
    await expect(repo.addMovement(movement)).rejects.toThrow();
    expect((await repo.loadAll()).movements).toHaveLength(1);
  });

  it("guarda sobres editados o archivados y los ajustes", async () => {
    const { repo } = fresh();
    await repo.putEnvelope({ ...SEED_ENVELOPES[1], name: "Viajes", archived: true });
    await repo.saveSettings({ ...DEFAULT_SETTINGS, weekStartsOn: 0 });
    const data = await repo.loadAll();
    expect(data.envelopes[0]).toMatchObject({ id: "card", name: "Viajes", archived: true });
    expect(data.settings?.weekStartsOn).toBe(0);
  });
});
