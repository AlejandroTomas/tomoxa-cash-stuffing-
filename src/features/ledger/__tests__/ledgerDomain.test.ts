import { computeBalances, totalCash, unbackedDebt } from "../domain/balances";
import { cutoffDateIn, statementPeriodFor } from "../domain/statement";
import type { Account, Envelope, LedgerSnapshot, Movement } from "../domain/types";
import { checkMovement, type MovementDraft } from "../domain/validation";

const accounts: Account[] = [
  { id: "debit", name: "Débito", kind: "debit", archived: false },
  { id: "cash", name: "Efectivo", kind: "cash", archived: false },
  { id: "visa", name: "Tarjeta", kind: "credit", archived: false, card: { cutoffDay: 15, paymentDays: 20, reserveEnvelopeId: "card" } },
];
const env = (id: string, archived = false): Envelope => ({ id, name: id, description: "", color: "#7f9fe6", icon: "wallet", order: 0, archived });
const envelopes: Envelope[] = [env("available"), env("card"), env("week"), env("savings"), env("old", true)];

let seq = 0;
const m = (draft: MovementDraft): Movement => ({ ...draft, id: `m${++seq}`, createdAt: `2026-10-01T00:00:${String(seq).padStart(2, "0")}Z` });
const base = { date: "2026-10-09", concept: "x" };

/** Aplica movimientos uno por uno, validando cada uno y comprobando la regla en cada paso. */
function run(drafts: MovementDraft[]): LedgerSnapshot {
  let snapshot: LedgerSnapshot = { accounts, envelopes, movements: [] };
  for (const draft of drafts) {
    expect(checkMovement(draft, snapshot)).toBeNull();
    snapshot = { ...snapshot, movements: [...snapshot.movements, m(draft)] };
    const balances = computeBalances(snapshot);
    const sumEnvelopes = Object.values(balances.envelopes).reduce((sum, value) => sum + value, 0);
    // La regla del libro: los sobres suman exactamente el dinero real (débito + efectivo).
    expect(sumEnvelopes).toBe(totalCash(balances));
  }
  return snapshot;
}

const income = (amount: number, accountId = "debit"): MovementDraft => ({ ...base, kind: "income", amountMinor: amount, accountId, envelopeId: "available" });
const assign = (amount: number, from: string, to: string): MovementDraft => ({ ...base, kind: "assignment", amountMinor: amount, envelopeId: from, toEnvelopeId: to });
const spend = (amount: number, accountId: string, envelopeId = "week"): MovementDraft => ({
  ...base,
  kind: "expense",
  amountMinor: amount,
  accountId,
  envelopeId,
  ...(accountId === "visa" ? { reserveEnvelopeId: "card" } : {}),
});
const pay = (amount: number, from = "debit"): MovementDraft => ({ ...base, kind: "cardPayment", amountMinor: amount, accountId: from, toAccountId: "visa", reserveEnvelopeId: "card" });

describe("saldos del libro (escenario de la spec)", () => {
  it("nómina, repartir, gasto con débito, gasto con tarjeta y pago", () => {
    const snapshot = run([income(420000), assign(120000, "available", "week"), spend(50000, "debit"), spend(60000, "visa"), pay(60000)]);
    const b = computeBalances(snapshot);
    expect(b.accounts.debit).toBe(420000 - 50000 - 60000);
    expect(b.debt.visa).toBe(0);
    expect(b.envelopes.week).toBe(120000 - 50000 - 60000);
    // La compra con tarjeta reservó 600 en "Tarjeta" y el pago lo consumió.
    expect(b.envelopes.card).toBe(0);
    expect(b.envelopes.available).toBe(420000 - 120000);
    expect(unbackedDebt(b, accounts)).toBe(0);
  });

  it("la compra con tarjeta es un gasto una sola vez: pagarla no vuelve a restar del sobre", () => {
    const before = computeBalances(run([income(100000), assign(50000, "available", "week"), spend(30000, "visa")]));
    const after = computeBalances(run([income(100000), assign(50000, "available", "week"), spend(30000, "visa"), pay(30000)]));
    expect(after.envelopes.week).toBe(before.envelopes.week);
    expect(after.envelopes.available).toBe(before.envelopes.available);
  });

  it("si el sobre no alcanza: queda sobregirado y aparece deuda sin respaldo; cubrir el sobre la resuelve", () => {
    const overspent = run([income(100000), assign(1000, "available", "week"), spend(3000, "visa")]);
    const b = computeBalances(overspent);
    expect(b.envelopes.week).toBe(-2000);
    expect(b.envelopes.card).toBe(3000);
    expect(unbackedDebt(b, accounts)).toBe(2000);
    const covered = computeBalances(run([income(100000), assign(1000, "available", "week"), spend(3000, "visa"), assign(2000, "available", "week")]));
    expect(covered.envelopes.week).toBe(0);
    expect(unbackedDebt(covered, accounts)).toBe(0);
  });

  it("sacar dinero de la reserva deja la deuda sin respaldo", () => {
    const b = computeBalances(run([income(100000), assign(50000, "available", "week"), spend(30000, "visa"), assign(10000, "card", "savings")]));
    expect(unbackedDebt(b, accounts)).toBe(10000);
  });

  it("depositar efectivo al banco no cambia los sobres", () => {
    const snapshot = run([income(50000, "cash"), { ...base, kind: "accountTransfer", amountMinor: 20000, accountId: "cash", toAccountId: "debit" }]);
    const b = computeBalances(snapshot);
    expect(b.accounts).toEqual({ debit: 20000, cash: 30000 });
    expect(b.envelopes.available).toBe(50000);
  });

  it("cancelar un movimiento deja todo como antes, una sola vez", () => {
    const snapshot = run([income(100000), assign(40000, "available", "week")]);
    const assignment = snapshot.movements[1];
    const reversal: MovementDraft = { ...base, kind: "reversal", amountMinor: assignment.amountMinor, concept: "Cancelación", reversalOf: assignment.id };
    expect(checkMovement(reversal, snapshot)).toBeNull();
    const reversed = { ...snapshot, movements: [...snapshot.movements, m(reversal)] };
    const b = computeBalances(reversed);
    expect(b.envelopes.week).toBe(0);
    expect(b.envelopes.available).toBe(100000);
    expect(b.reversed[assignment.id]).toBeDefined();
    expect(checkMovement(reversal, reversed)?.code).toBe("ALREADY_REVERSED");
  });
});

describe("validaciones", () => {
  const funded = run([income(100000), assign(30000, "available", "week")]);

  it("monto, concepto y fecha", () => {
    expect(checkMovement({ ...income(0) }, funded)?.code).toBe("INVALID_AMOUNT");
    expect(checkMovement({ ...income(10.5) }, funded)?.code).toBe("INVALID_AMOUNT");
    expect(checkMovement({ ...income(100), concept: "  " }, funded)?.code).toBe("INVALID_CONCEPT");
    expect(checkMovement({ ...income(100), date: "2026-13-01x" }, funded)?.code).toBe("INVALID_DATE");
  });
  it("cuentas y sobres válidos", () => {
    expect(checkMovement({ ...income(100), accountId: "visa" }, funded)?.code).toBe("WRONG_ACCOUNT_KIND");
    expect(checkMovement({ ...income(100), envelopeId: "old" }, funded)?.code).toBe("ARCHIVED");
    expect(checkMovement({ ...income(100), envelopeId: "nope" }, funded)?.code).toBe("UNKNOWN_ENVELOPE");
    expect(checkMovement(assign(100, "week", "week"), funded)?.code).toBe("SAME_SOURCE_AND_TARGET");
  });
  it("no se gasta dinero físico que no hay; sí se puede sobregirar un sobre", () => {
    expect(checkMovement(spend(100001, "debit"), funded)?.code).toBe("INSUFFICIENT_FUNDS");
    expect(checkMovement(spend(50000, "debit"), funded)).toBeNull(); // week tiene 30,000: queda sobregirado
  });
  it("no se reparte más de lo que tiene el sobre", () => {
    expect(checkMovement(assign(30001, "week", "savings"), funded)?.code).toBe("INSUFFICIENT_FUNDS");
  });
  it("no se paga más de lo que se debe", () => {
    const owing = run([income(100000), assign(30000, "available", "week"), spend(20000, "visa")]);
    expect(checkMovement(pay(20001), owing)?.code).toBe("OVERPAYMENT");
  });
  it("no se cancela un ingreso que ya se gastó", () => {
    const spent = run([income(10000), assign(10000, "available", "week"), spend(10000, "debit")]);
    const reversal: MovementDraft = { ...base, kind: "reversal", amountMinor: 10000, concept: "Cancelación", reversalOf: spent.movements[0].id };
    expect(checkMovement(reversal, spent)?.code).toBe("INSUFFICIENT_FUNDS");
  });
});

describe("periodos de corte con fechas reales", () => {
  it("el corte del 31 cae el último día del mes", () => {
    expect(cutoffDateIn(2026, 10, 31)).toBe("2026-11-30");
    expect(cutoffDateIn(2027, 1, 31)).toBe("2027-02-28");
    expect(cutoffDateIn(2028, 1, 30)).toBe("2028-02-29");
  });
  it("periodo que contiene una fecha (corte 15, pago a 20 días)", () => {
    expect(statementPeriodFor("2026-10-09", 15, 20)).toEqual({ start: "2026-09-16", cutoff: "2026-10-15", due: "2026-11-04" });
    expect(statementPeriodFor("2026-10-15", 15, 20).cutoff).toBe("2026-10-15");
    expect(statementPeriodFor("2026-10-16", 15, 20)).toEqual({ start: "2026-10-16", cutoff: "2026-11-15", due: "2026-12-05" });
  });
  it("cruza de año", () => expect(statementPeriodFor("2026-12-20", 15, 20)).toEqual({ start: "2026-12-16", cutoff: "2027-01-15", due: "2027-02-04" }));
});
