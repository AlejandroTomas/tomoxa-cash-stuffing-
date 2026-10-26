import { computeBalances, unbackedDebt } from "../domain/balances";
import { budgetStatus } from "../domain/budget";
import { cardStatement, cardSummaries } from "../domain/cards";
import { deferredByCard, installmentAmount, installmentCutoffs, installmentPlans } from "../domain/installments";
import { paymentReminders } from "../domain/reminders";
import type { Account, Envelope, Movement } from "../domain/types";

const accounts: Account[] = [
  { id: "debit", name: "Débito", kind: "debit", archived: false },
  { id: "nu", name: "Nu", kind: "credit", archived: false, card: { cutoffDay: 15, paymentDays: 20, reserveEnvelopeId: "nu-reserve" } },
];
const envelopes: Envelope[] = [
  { id: "available", name: "Disponible", description: "", color: "#7f9fe6", icon: "wallet", order: 0, archived: false },
  { id: "home", name: "Casa", description: "", color: "#7cc3a3", icon: "piggy", order: 1, archived: false, budget: { amountMinor: 300000, period: "month" } },
  { id: "nu-reserve", name: "Nu", description: "", color: "#ee8586", icon: "card", order: 2, archived: false },
];
let n = 0;
const move = (patch: Partial<Movement> & Pick<Movement, "kind" | "date" | "amountMinor">): Movement => ({ id: `m${++n}`, createdAt: `${patch.date}T12:00:${String(n).padStart(2, "0")}.000Z`, concept: "x", ...patch });

describe("mensualidades", () => {
  it("son iguales y la última absorbe el redondeo", () => {
    expect([1, 2, 3].map((i) => installmentAmount(100000, 3, i))).toEqual([33333, 33333, 33334]);
    expect(installmentAmount(1800000, 18, 18)).toBe(100000);
  });

  it("la primera se cobra en el corte del periodo de la compra; cambian de año", () => {
    expect(installmentCutoffs("2026-10-10", 15, 3)).toEqual(["2026-10-15", "2026-11-15", "2026-12-15"]);
    expect(installmentCutoffs("2026-10-16", 15, 3)).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
    expect(installmentCutoffs("2026-12-20", 31, 3)).toEqual(["2026-12-31", "2027-01-31", "2027-02-28"]);
  });
});

describe("compra a meses en el libro", () => {
  const income = move({ kind: "income", date: "2026-10-01", amountMinor: 500000, accountId: "debit", envelopeId: "available" });
  const purchase = move({ kind: "expense", date: "2026-10-10", amountMinor: 1800000, accountId: "nu", envelopeId: "home", installments: 18 });
  const first = move({ kind: "assignment", date: "2026-10-12", amountMinor: 100000, envelopeId: "available", toEnvelopeId: "nu-reserve", installmentOf: purchase.id, installmentNumber: 1 });
  const movements = [income, purchase, first];
  const balances = computeBalances({ accounts, envelopes, movements });

  it("solo la deuda sube; el sobre paga la mensualidad al apartarla", () => {
    expect(balances.debt.nu).toBe(1800000);
    expect(balances.envelopes.home).toBe(0);
    expect(balances.envelopes["nu-reserve"]).toBe(100000);
  });

  it("el estado de cuenta cobra solo las mensualidades cortadas", () => {
    const statement = cardStatement({ ...accounts[1], card: accounts[1].card! }, movements, balances.reversed, "2026-11-20");
    expect(statement).toMatchObject({ cutoff: "2026-11-15", amount: 200000 });
  });

  it("avance del plan: próxima mensualidad, lo diferido no es deuda sin respaldo", () => {
    const [plan] = installmentPlans(accounts, movements, balances.reversed, "2026-10-20");
    expect(plan).toMatchObject({ months: 18, billed: 1, setAside: [1], remainingMinor: 1700000, deferredMinor: 1700000 });
    expect(plan.next).toMatchObject({ number: 2, amountMinor: 100000, cutoff: "2026-11-15", due: "2026-12-05" });
    expect(plan.nextDue).toBe(true);
    expect(unbackedDebt(balances, accounts, deferredByCard([plan]))).toBe(0);
    expect(cardSummaries(accounts, balances, movements, "2026-10-20")[0]).toMatchObject({ unbacked: 0, deferred: 1700000, plans: [plan] });
  });

  it("una mensualidad cortada y sin apartar sí cuenta como deuda sin respaldo", () => {
    const [plan] = installmentPlans(accounts, movements, balances.reversed, "2026-11-16");
    expect(plan.deferredMinor).toBe(1600000);
    expect(unbackedDebt(balances, accounts, deferredByCard([plan]))).toBe(100000);
  });

  it("la mensualidad apartada cuenta en el presupuesto del sobre que la paga; la compra no", () => {
    const fromHome = { ...first, envelopeId: "home" };
    const status = budgetStatus(envelopes[1], 0, [purchase, fromHome], {}, "2026-10-20", 1);
    expect(status?.spentMinor).toBe(100000);
  });

  it("cancelada la compra, ya no hay plan", () => {
    const reversal = move({ kind: "reversal", date: "2026-10-13", amountMinor: 1800000, reversalOf: purchase.id });
    const all = [...movements, reversal];
    expect(installmentPlans(accounts, all, computeBalances({ accounts, envelopes, movements: all }).reversed, "2026-10-20")).toEqual([]);
  });
});

describe("recordatorios", () => {
  it("avisa la mensualidad por apartar y el pago cercano, una vez por día", () => {
    const purchase = move({ kind: "expense", date: "2026-10-10", amountMinor: 1800000, accountId: "nu", envelopeId: "home", installments: 18, concept: "Colchón" });
    const movements = [purchase];
    const balances = computeBalances({ accounts, envelopes, movements });
    const reminders = paymentReminders(cardSummaries(accounts, balances, movements, "2026-11-01"), "2026-11-01");
    expect(reminders.map((reminder) => reminder.key)).toEqual([`pay:nu:2026-11-04:2026-11-01`, `msi:${purchase.id}:1:2026-11-01`]);
    expect(reminders[0].title).toBe("Pago de Nu: vence el 4 nov");
    expect(reminders[1]).toMatchObject({ title: "Aparta la mensualidad 1 de 18: Colchón", body: expect.stringContaining("$ 1,000.00 en Nu") });
  });
});
