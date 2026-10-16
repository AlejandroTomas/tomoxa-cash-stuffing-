import { computeBalances } from "../domain/balances";
import { cardStatement, cardSummaries, checkCardSettings, checkSettings, incomesDueOn, paymentDueSoon } from "../domain/cards";
import { lastCutoffOnOrBefore } from "../domain/statement";
import { DEFAULT_SETTINGS, SEED_ACCOUNTS, SEED_ENVELOPES, seedMovements } from "../domain/seed";
import type { Account, CardSettings, Movement } from "../domain/types";

const balancesWith = (extra: Movement[] = []) => computeBalances({ accounts: SEED_ACCOUNTS, envelopes: SEED_ENVELOPES, movements: [...seedMovements(), ...extra] });
const m = (fields: Partial<Movement> & Pick<Movement, "kind" | "amountMinor">): Movement => ({ id: `x${Math.random()}`, date: "2026-10-15", createdAt: "2026-10-15T00:00:00Z", concept: "x", ...fields });

describe("cardSummaries", () => {
  it("con la historia de ejemplo la deuda está respaldada y el periodo es el de hoy", () => {
    const [visa] = cardSummaries(SEED_ACCOUNTS, balancesWith(), seedMovements(), "2026-10-15");
    expect(visa.debt).toBeGreaterThan(0);
    expect(visa.reserve).toBe(visa.debt);
    expect(visa.unbacked).toBe(0);
    expect(visa.nextCutoff).toBe("2026-10-15");
    expect(visa.statement).toMatchObject({ cutoff: "2026-10-15", due: "2026-11-04", daysLeft: 20 });
  });

  it("sacar dinero de la reserva deja deuda sin respaldo", () => {
    const [visa] = cardSummaries(SEED_ACCOUNTS, balancesWith([m({ kind: "assignment", amountMinor: 50000, envelopeId: "card", toEnvelopeId: "available" })]), seedMovements(), "2026-10-15");
    expect(visa.unbacked).toBe(50000);
  });

  it("un sobre sobregirado se descuenta de la reserva", () => {
    // Gasto con débito mayor a lo que tiene Fondo: Fondo queda en negativo.
    const [visa] = cardSummaries(SEED_ACCOUNTS, balancesWith([m({ kind: "expense", amountMinor: 310000, accountId: "debit", envelopeId: "fund" })]), seedMovements(), "2026-10-15");
    expect(visa.unbacked).toBe(10000);
  });
});

describe("ajustes", () => {
  it("día de corte y días para pagar", () => {
    expect(checkCardSettings({ cutoffDay: 15, paymentDays: 20 })).toBeNull();
    expect(checkCardSettings({ cutoffDay: 0, paymentDays: 20 })?.field).toBe("cutoffDay");
    expect(checkCardSettings({ cutoffDay: 32, paymentDays: 20 })?.field).toBe("cutoffDay");
    expect(checkCardSettings({ cutoffDay: 15, paymentDays: 61 })?.field).toBe("paymentDays");
  });
  it("ingresos recurrentes: nombre, día y cuenta de débito o efectivo", () => {
    expect(checkSettings(DEFAULT_SETTINGS, SEED_ACCOUNTS)).toBeNull();
    const bad = (patch: object) => checkSettings({ ...DEFAULT_SETTINGS, recurringIncome: [{ ...DEFAULT_SETTINGS.recurringIncome[0], ...patch }] }, SEED_ACCOUNTS);
    expect(bad({ label: " " })?.field).toBe("recurringIncome.0.label");
    expect(bad({ weekday: 7 })?.field).toBe("recurringIncome.0.weekday");
    expect(bad({ accountId: "visa" })?.field).toBe("recurringIncome.0.accountId");
  });
  it("qué ingresos tocan cada día", () => {
    expect(incomesDueOn(DEFAULT_SETTINGS, 5).map((i) => i.label)).toEqual(["Nómina"]);
    expect(incomesDueOn(DEFAULT_SETTINGS, 1).map((i) => i.label)).toEqual(["Efectivo semanal"]);
    expect(incomesDueOn(DEFAULT_SETTINGS, 3)).toEqual([]);
  });
});

describe("estado de cuenta", () => {
  const visa = SEED_ACCOUNTS.find((account) => account.id === "visa") as Account & { card: CardSettings };
  const buy = (date: string, amount: number, id = `b-${date}`) => m({ id, kind: "expense", date, amountMinor: amount, accountId: "visa", envelopeId: "week", reserveEnvelopeId: "card" });
  const pay = (date: string, amount: number, id = `p-${date}`) => m({ id, kind: "cardPayment", date, amountMinor: amount, accountId: "debit", toAccountId: "visa", reserveEnvelopeId: "card" });

  it("el último corte es el de este mes si ya pasó; si no, el del mes anterior", () => {
    expect(lastCutoffOnOrBefore("2026-10-16", 15)).toBe("2026-10-15");
    expect(lastCutoffOnOrBefore("2026-10-15", 15)).toBe("2026-10-15");
    expect(lastCutoffOnOrBefore("2026-10-14", 15)).toBe("2026-09-15");
    expect(lastCutoffOnOrBefore("2026-01-10", 31)).toBe("2025-12-31");
    expect(lastCutoffOnOrBefore("2026-03-01", 31)).toBe("2026-02-28");
  });

  it("al día siguiente del corte se paga lo del corte, no lo del periodo nuevo", () => {
    const statement = cardStatement(visa, [buy("2026-10-10", 30000), buy("2026-10-16", 5000)], {}, "2026-10-16");
    expect(statement).toEqual({ cutoff: "2026-10-15", due: "2026-11-04", amount: 30000, daysLeft: 19 });
  });

  it("los pagos (antes o después del corte) y las cancelaciones bajan lo que se debe", () => {
    const movements = [buy("2026-10-01", 30000), pay("2026-10-05", 10000), buy("2026-10-12", 20000, "cancelada"), pay("2026-10-20", 5000)];
    expect(cardStatement(visa, movements, { cancelada: "r1" }, "2026-10-21").amount).toBe(15000);
    expect(cardStatement(visa, [...movements, pay("2026-10-22", 20000)], { cancelada: "r1" }, "2026-10-22").amount).toBe(0);
  });

  it("avisa cuando faltan 5 días o menos y queda algo por pagar", () => {
    const owed = [buy("2026-10-10", 30000)];
    expect(paymentDueSoon(cardStatement(visa, owed, {}, "2026-10-29"))).toBe(false);
    expect(paymentDueSoon(cardStatement(visa, owed, {}, "2026-10-30"))).toBe(true);
    expect(paymentDueSoon(cardStatement(visa, [...owed, pay("2026-10-30", 30000)], {}, "2026-10-30"))).toBe(false);
  });
});
