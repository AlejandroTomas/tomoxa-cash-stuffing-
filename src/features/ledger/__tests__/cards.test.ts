import { computeBalances } from "../domain/balances";
import { cardSummaries, checkCardSettings, checkSettings, incomesDueOn } from "../domain/cards";
import { DEFAULT_SETTINGS, SEED_ACCOUNTS, SEED_ENVELOPES, seedMovements } from "../domain/seed";
import type { Movement } from "../domain/types";

const balancesWith = (extra: Movement[] = []) => computeBalances({ accounts: SEED_ACCOUNTS, envelopes: SEED_ENVELOPES, movements: [...seedMovements(), ...extra] });
const m = (fields: Partial<Movement> & Pick<Movement, "kind" | "amountMinor">): Movement => ({ id: `x${Math.random()}`, date: "2026-10-15", createdAt: "2026-10-15T00:00:00Z", concept: "x", ...fields });

describe("cardSummaries", () => {
  it("con la historia de ejemplo la deuda está respaldada y el periodo es el de hoy", () => {
    const [visa] = cardSummaries(SEED_ACCOUNTS, balancesWith(), "2026-10-15");
    expect(visa.debt).toBeGreaterThan(0);
    expect(visa.reserve).toBe(visa.debt);
    expect(visa.unbacked).toBe(0);
    expect(visa.period).toEqual({ start: "2026-09-16", cutoff: "2026-10-15", due: "2026-11-04" });
  });

  it("sacar dinero de la reserva deja deuda sin respaldo", () => {
    const [visa] = cardSummaries(SEED_ACCOUNTS, balancesWith([m({ kind: "assignment", amountMinor: 50000, envelopeId: "card", toEnvelopeId: "available" })]), "2026-10-15");
    expect(visa.unbacked).toBe(50000);
  });

  it("un sobre sobregirado se descuenta de la reserva", () => {
    // Gasto con débito mayor a lo que tiene Fondo: Fondo queda en negativo.
    const [visa] = cardSummaries(SEED_ACCOUNTS, balancesWith([m({ kind: "expense", amountMinor: 310000, accountId: "debit", envelopeId: "fund" })]), "2026-10-15");
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
