import { computeBalances, moneyBreakdown } from "../domain/balances";
import { UNASSIGNED_ENVELOPE_ID } from "../domain/envelopes";
import { startingData } from "../domain/seed";
import type { Envelope, Movement } from "../domain/types";

const pantry: Envelope = { id: "pantry", name: "Despensa", description: "", color: "#e88", icon: "wallet", order: 5, archived: false };
let n = 0;
const movement = (fields: Partial<Movement> & Pick<Movement, "kind" | "amountMinor">): Movement => ({ id: `m${++n}`, createdAt: `2026-10-27T00:00:0${n}.000Z`, date: "2026-10-27", concept: "x", ...fields });

describe("desglose de Disponible", () => {
  it("tu dinero = apartado en sobres + sin repartir (ingresar, apartar, gastar y comprar con tarjeta)", () => {
    const data = startingData("empty");
    const envelopes = [...data.envelopes, pantry];
    const movements = [
      movement({ kind: "income", amountMinor: 425000, accountId: "cash", envelopeId: "available" }),
      movement({ kind: "income", amountMinor: 749630, accountId: "debit", envelopeId: "available" }),
      movement({ kind: "assignment", amountMinor: 100000, envelopeId: "available", toEnvelopeId: "pantry" }),
      movement({ kind: "expense", amountMinor: 29500, accountId: "cash", envelopeId: "pantry" }),
      movement({ kind: "expense", amountMinor: 392958, accountId: "visa", envelopeId: "available", reserveEnvelopeId: "card" }),
    ];
    const breakdown = moneyBreakdown(data.accounts, computeBalances({ ...data, envelopes, movements }), UNASSIGNED_ENVELOPE_ID);
    // La tarjeta de crédito no es dinero tuyo: no aparece entre las cuentas.
    expect(breakdown.accounts).toEqual([
      { id: "debit", name: "Débito", amountMinor: 749630 },
      { id: "cash", name: "Efectivo", amountMinor: 395500 },
    ]);
    expect(breakdown.totalMinor).toBe(1145130);
    // Despensa 705 + reserva de la tarjeta 3,929.58.
    expect(breakdown.assignedMinor).toBe(70500 + 392958);
    expect(breakdown.unassignedMinor).toBe(425000 + 749630 - 100000 - 392958);
    expect(breakdown.assignedMinor + breakdown.unassignedMinor).toBe(breakdown.totalMinor);
  });

  it("cuadra también con todo el ejemplo (cancelaciones, pagos de tarjeta, sobregiros)", () => {
    const data = startingData("sample");
    const breakdown = moneyBreakdown(data.accounts, computeBalances(data), UNASSIGNED_ENVELOPE_ID);
    expect(breakdown.assignedMinor + breakdown.unassignedMinor).toBe(breakdown.totalMinor);
  });

  it("una cuenta archivada en $0 no se muestra", () => {
    const data = startingData("empty");
    const accounts = data.accounts.map((account) => (account.id === "cash" ? { ...account, archived: true } : account));
    const breakdown = moneyBreakdown(accounts, computeBalances({ ...data, accounts }), UNASSIGNED_ENVELOPE_ID);
    expect(breakdown.accounts.map((account) => account.id)).toEqual(["debit"]);
  });
});
