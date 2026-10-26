import { formatMinor, minorToInput, parseAmountMinor } from "../domain/money";
import { defaultConcept, draftFromForm, formFieldOf, type MovementForm } from "../domain/movementForm";
import { SEED_ACCOUNTS, SEED_ENVELOPES, seedMovements } from "../domain/seed";
import { checkMovement } from "../domain/validation";

const form = (patch: Partial<MovementForm>): MovementForm => ({
  kind: "expense",
  amount: "120",
  concept: "Súper",
  date: "2026-10-15",
  accountId: "debit",
  toAccountId: "",
  envelopeId: "week",
  installments: "1",
  splits: [],
  ...patch,
});
const snapshot = { accounts: SEED_ACCOUNTS, envelopes: SEED_ENVELOPES, movements: seedMovements() };

describe("montos", () => {
  it("formatea y lee", () => {
    expect(formatMinor(180000)).toBe("$ 1,800.00");
    expect(formatMinor(-10050)).toBe("−$ 100.50");
    expect(parseAmountMinor("1,234.5")).toBe(123450);
    expect(parseAmountMinor("0")).toBeNull();
    expect(parseAmountMinor("1.234")).toBeNull();
    expect(minorToInput(123450)).toBe("1234.50");
    expect(minorToInput(80000)).toBe("800");
  });
});

describe("draftFromForm", () => {
  it("gasto con tarjeta lleva el sobre de reserva y pasa las reglas", () => {
    const result = draftFromForm(form({ accountId: "visa" }), SEED_ACCOUNTS);
    expect(result).toEqual({ drafts: [{ kind: "expense", date: "2026-10-15", concept: "Súper", amountMinor: 12000, accountId: "visa", envelopeId: "week", reserveEnvelopeId: "card" }] });
    if ("drafts" in result) expect(checkMovement(result.drafts[0], snapshot)).toBeNull();
  });

  it("ingreso a Disponible", () => {
    const result = draftFromForm(form({ kind: "income", concept: "Nómina", accountId: "debit", envelopeId: "available" }), SEED_ACCOUNTS);
    expect("drafts" in result && result.drafts[0].kind).toBe("income");
    if ("drafts" in result) expect(checkMovement(result.drafts[0], snapshot)).toBeNull();
  });

  it("pago de tarjeta y depósito/retiro ponen un concepto si se deja vacío", () => {
    const payment = draftFromForm(form({ kind: "cardPayment", concept: "", amount: "100", accountId: "debit", toAccountId: "visa" }), SEED_ACCOUNTS);
    expect(payment).toMatchObject({ drafts: [{ concept: "Pago de Tarjeta de crédito", reserveEnvelopeId: "card", toAccountId: "visa" }] });
    if ("drafts" in payment) expect(checkMovement(payment.drafts[0], snapshot)).toBeNull();
    expect(defaultConcept({ kind: "accountTransfer", accountId: "debit", toAccountId: "cash" }, SEED_ACCOUNTS)).toBe("Retiro de efectivo");
    expect(defaultConcept({ kind: "accountTransfer", accountId: "cash", toAccountId: "debit" }, SEED_ACCOUNTS)).toBe("Depósito a débito");
  });

  it("a meses solo con tarjeta", () => {
    expect(draftFromForm(form({ accountId: "visa", installments: "18" }), SEED_ACCOUNTS)).toMatchObject({ drafts: [{ installments: 18 }] });
    const cash = draftFromForm(form({ accountId: "cash", installments: "18" }), SEED_ACCOUNTS);
    expect("drafts" in cash && cash.drafts[0].installments).toBeUndefined();
  });

  it("pago dividido: una parte por cuenta y deben sumar el total", () => {
    const split = (splits: MovementForm["splits"]) => draftFromForm(form({ amount: "500", splits }), SEED_ACCOUNTS);
    expect(
      split([
        { accountId: "cash", amount: "200" },
        { accountId: "visa", amount: "300" },
      ]),
    ).toMatchObject({ drafts: [{ accountId: "cash", amountMinor: 20000 }, { accountId: "visa", amountMinor: 30000, reserveEnvelopeId: "card" }] });
    expect(
      split([
        { accountId: "cash", amount: "200" },
        { accountId: "visa", amount: "200" },
      ]),
    ).toMatchObject({ field: "root" });
    expect(
      split([
        { accountId: "cash", amount: "200" },
        { accountId: "cash", amount: "300" },
      ]),
    ).toMatchObject({ field: "splits.1.accountId" });
    expect(
      split([
        { accountId: "cash", amount: "x" },
        { accountId: "visa", amount: "300" },
      ]),
    ).toMatchObject({ field: "splits.0.amount" });
  });

  it("monto inválido o gasto sin concepto", () => {
    expect(draftFromForm(form({ amount: "abc" }), SEED_ACCOUNTS)).toMatchObject({ field: "amount" });
    expect(draftFromForm(form({ concept: " " }), SEED_ACCOUNTS)).toMatchObject({ field: "concept" });
  });

  it("los problemas del libro caen en su campo", () => {
    expect(formFieldOf({ code: "INSUFFICIENT_FUNDS", field: "amountMinor", message: "" })).toBe("amount");
    expect(formFieldOf({ code: "UNKNOWN_ACCOUNT", field: "toAccountId", message: "" })).toBe("toAccountId");
    expect(formFieldOf({ code: "ALREADY_REVERSED", field: "form", message: "" })).toBe("root");
  });
});
