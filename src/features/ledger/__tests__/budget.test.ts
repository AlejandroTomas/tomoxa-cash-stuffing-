import { budgetRange, budgetStatus } from "../domain/budget";
import { parseBackup } from "../domain/backup";
import { checkEnvelope } from "../domain/envelopes";
import { SEED_ENVELOPES } from "../domain/seed";
import type { Envelope, Movement } from "../domain/types";

const m = (fields: Partial<Movement> & Pick<Movement, "kind" | "amountMinor" | "date">): Movement => ({ id: `x${Math.random()}`, createdAt: `${fields.date}T00:00:00Z`, concept: "x", ...fields });
const week: Envelope = { id: "week", name: "Semana", description: "", color: "#ad94db", icon: "calendar", order: 4, archived: false, budget: { amountMinor: 120000, period: "week" } };

describe("budgetRange", () => {
  it("la semana empieza el lunes o el domingo según los ajustes", () => {
    // 16 oct 2026 es viernes.
    expect(budgetRange("2026-10-16", "week", 1)).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(budgetRange("2026-10-16", "week", 0)).toEqual({ start: "2026-10-11", end: "2026-10-17" });
    // El mismo día de inicio abre la semana.
    expect(budgetRange("2026-10-12", "week", 1).start).toBe("2026-10-12");
    // Domingo con semana de lunes: es el último día.
    expect(budgetRange("2026-10-18", "week", 1)).toEqual({ start: "2026-10-12", end: "2026-10-18" });
  });

  it("cruza meses y años; el mes va del 1 al último día", () => {
    expect(budgetRange("2026-12-31", "week", 1)).toEqual({ start: "2026-12-28", end: "2027-01-03" });
    expect(budgetRange("2028-02-10", "month", 1)).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
});

describe("budgetStatus", () => {
  const movements = [
    m({ kind: "expense", amountMinor: 30000, date: "2026-10-11", envelopeId: "week", accountId: "debit" }), // semana anterior
    m({ kind: "expense", amountMinor: 40000, date: "2026-10-12", envelopeId: "week", accountId: "debit" }),
    m({ id: "cancelado", kind: "expense", amountMinor: 99900, date: "2026-10-13", envelopeId: "week", accountId: "debit" }),
    m({ kind: "expense", amountMinor: 25000, date: "2026-10-14", envelopeId: "week", accountId: "visa", reserveEnvelopeId: "card" }),
    m({ kind: "expense", amountMinor: 5000, date: "2026-10-14", envelopeId: "cash", accountId: "cash" }), // otro sobre
    m({ kind: "assignment", amountMinor: 120000, date: "2026-10-12", envelopeId: "available", toEnvelopeId: "week" }), // no es gasto
  ];
  const reversed = { cancelado: "r1" };

  it("suma los gastos del sobre en el periodo, con tarjeta incluidos y sin cancelados", () => {
    expect(budgetStatus(week, 55000, movements, reversed, "2026-10-16", 1)).toEqual({
      amountMinor: 120000,
      period: "week",
      start: "2026-10-12",
      end: "2026-10-18",
      spentMinor: 65000,
      remainingMinor: 55000,
      toFundMinor: 0,
    });
  });

  it("falta apartar lo que no cubre el saldo; pasarse deja lo restante en negativo", () => {
    expect(budgetStatus(week, 20000, movements, reversed, "2026-10-16", 1)?.toFundMinor).toBe(35000);
    const over = budgetStatus({ ...week, budget: { amountMinor: 50000, period: "week" } }, 0, movements, reversed, "2026-10-16", 1);
    expect(over).toMatchObject({ remainingMinor: -15000, toFundMinor: 0 });
  });

  it("sin presupuesto no hay estado", () => {
    expect(budgetStatus({ ...week, budget: undefined }, 0, movements, reversed, "2026-10-16", 1)).toBeNull();
  });
});

describe("presupuesto al guardar e importar", () => {
  it("rechaza montos no positivos", () => {
    expect(checkEnvelope({ ...week, budget: { amountMinor: 0, period: "week" } }, SEED_ENVELOPES)?.code).toBe("INVALID_BUDGET");
    expect(checkEnvelope(week, SEED_ENVELOPES)).toBeNull();
  });

  it("el respaldo conserva el presupuesto", () => {
    const text = JSON.stringify({
      app: "aurora-ledger",
      version: 1,
      exportedAt: "2026-10-16T00:00:00Z",
      accounts: [{ id: "debit", name: "Débito", kind: "debit", archived: false }],
      envelopes: [{ id: "available", name: "Disponible", description: "", color: "#7f9fe6", icon: "wallet", order: 0, archived: false }, week],
      movements: [],
      settings: { recurringIncome: [], weekStartsOn: 1, currency: "MXN" },
    });
    const result = parseBackup(text);
    expect("contents" in result && result.contents.envelopes[1].budget).toEqual(week.budget);
  });
});
