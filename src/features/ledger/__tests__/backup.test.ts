import "fake-indexeddb/auto";

import { computeBalances } from "../domain/balances";
import { backupFileName, createBackup, parseBackup } from "../domain/backup";
import { DEFAULT_SETTINGS, SEED_ACCOUNTS, SEED_ENVELOPES, seedMovements } from "../domain/seed";
import { LedgerDatabase } from "../repositories/ledgerDatabase";
import { createLedgerRepository } from "../repositories/ledger.repository";
import { createLedgerService } from "../services/ledger.service";

const sample = () => createBackup({ accounts: SEED_ACCOUNTS, envelopes: SEED_ENVELOPES, movements: seedMovements(), settings: DEFAULT_SETTINGS }, "2026-10-16T10:00:00.000Z");

let n = 0;
function setup() {
  const db = new LedgerDatabase(`ledger-backup-${++n}`);
  let id = 0;
  return createLedgerService({ repository: createLedgerRepository(() => db), now: () => new Date("2026-10-16T18:00:00.000Z"), newId: () => `new-${++id}` });
}

describe("parseBackup", () => {
  it("acepta los datos de ejemplo", () => {
    const result = parseBackup(JSON.stringify(sample()));
    expect("contents" in result && result.contents.movements).toHaveLength(seedMovements().length);
    expect(backupFileName("2026-10-16")).toBe("ahorroxa-respaldo-2026-10-16.json");
  });

  it("rechaza lo que no es un respaldo", () => {
    expect(parseBackup("hola")).toEqual({ message: expect.stringContaining("no es JSON") });
    expect(parseBackup(JSON.stringify({ app: "otra" }))).toEqual({ message: "Ese archivo no es un respaldo de Ahorroxa." });
    expect(parseBackup(JSON.stringify({ ...sample(), version: 9 }))).toEqual({ message: expect.stringContaining("versión") });
  });

  it("rechaza registros repetidos y movimientos que no cuadran", () => {
    const backup = sample();
    expect(parseBackup(JSON.stringify({ ...backup, movements: [...backup.movements, backup.movements[0]] }))).toEqual({ message: "El respaldo tiene registros repetidos." });
    const broken = { ...backup, movements: [...backup.movements, { ...backup.movements[0], id: "x", kind: "expense", accountId: "cash", envelopeId: "week", amountMinor: 999999999, createdAt: "2026-12-31T00:00:00.000Z" }] };
    expect(parseBackup(JSON.stringify(broken))).toEqual({ message: expect.stringContaining("no cuadra") });
  });

  it("acepta movimientos de sobres que después se archivaron", () => {
    const backup = sample();
    const envelopes = [...backup.envelopes, { id: "trip", name: "Viajes", description: "", color: "#6fbcc6", icon: "piggy" as const, order: 6, archived: true }];
    const there = { id: "m1", kind: "assignment" as const, date: "2026-10-13", createdAt: "2026-10-13T10:00:00.000Z", amountMinor: 100, concept: "Ida", envelopeId: "available", toEnvelopeId: "trip" };
    const back = { ...there, id: "m2", createdAt: "2026-10-13T11:00:00.000Z", concept: "Vuelta", envelopeId: "trip", toEnvelopeId: "available" };
    expect("contents" in parseBackup(JSON.stringify({ ...backup, envelopes, movements: [...backup.movements, there, back] }))).toBe(true);
  });
});

describe("respaldo en el servicio", () => {
  it("exportar → restablecer → importar deja el libro igual", async () => {
    const service = setup();
    await service.start("sample");
    await service.record({ kind: "expense", date: "2026-10-16", concept: "Súper", amountMinor: 12000, accountId: "debit", envelopeId: "week" });
    const backup = await service.exportBackup();
    expect(backup).toMatchObject({ app: "aurora-ledger", version: 1, exportedAt: "2026-10-16T18:00:00.000Z" });

    const reset = await service.start("sample");
    expect(reset.movements).toHaveLength(seedMovements().length);

    const imported = await service.importBackup(JSON.stringify(backup));
    expect(imported.movements).toHaveLength(seedMovements().length + 1);
    expect(computeBalances(imported)).toEqual(computeBalances({ ...backup }));
  });

  it("un respaldo inválido no toca lo guardado", async () => {
    const service = setup();
    await service.start("sample");
    await service.record({ kind: "expense", date: "2026-10-16", concept: "Súper", amountMinor: 12000, accountId: "debit", envelopeId: "week" });
    await expect(service.importBackup("{}")).rejects.toMatchObject({ code: "INVALID_BACKUP" });
    expect((await service.load()).movements).toHaveLength(seedMovements().length + 1);
  });
});
