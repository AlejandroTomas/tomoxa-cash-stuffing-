import { computeBalances } from "@/features/ledger/domain/balances";
import { seedMovements, startingData } from "@/features/ledger/domain/seed";
import { visibleEnvelopes } from "../domain/envelopeView";

describe("sobres visibles en el organizador", () => {
  it("al empezar de cero solo muestra Disponible y permite registrar ingresos", () => {
    const data = startingData("empty");
    expect(visibleEnvelopes(data.envelopes, data.accounts, data.movements, computeBalances(data).envelopes).map((envelope) => envelope.id)).toEqual(["available"]);
  });

  it("al elegir el ejemplo muestra sus seis sobres", () => {
    const data = startingData("sample");
    expect(visibleEnvelopes(data.envelopes, data.accounts, data.movements, computeBalances(data).envelopes)).toHaveLength(6);
  });

  it("muestra Tarjeta cuando ya se usa la reserva", () => {
    const data = startingData("empty");
    const movements = [seedMovements().find((movement) => movement.accountId === "visa")!];
    expect(visibleEnvelopes(data.envelopes, data.accounts, movements, {}).map((envelope) => envelope.id)).toEqual(["available", "card"]);
  });

  it("una tarjeta nueva no muestra su reserva hasta usarla", () => {
    const data = startingData("sample");
    const accounts = [...data.accounts, { id: "nu", name: "Nu", kind: "credit" as const, archived: false, card: { cutoffDay: 5, paymentDays: 20, reserveEnvelopeId: "nu-reserve" } }];
    const envelopes = [...data.envelopes, { id: "nu-reserve", name: "Nu", description: "", color: "#ee8586", icon: "card" as const, order: 9, archived: false }];
    const ids = (movements: typeof data.movements) => visibleEnvelopes(envelopes, accounts, movements, {}).map((envelope) => envelope.id);
    expect(ids(data.movements)).not.toContain("nu-reserve");
    const purchase = { ...data.movements[0], id: "x", kind: "expense" as const, accountId: "nu", reserveEnvelopeId: "nu-reserve" };
    expect(ids([...data.movements, purchase])).toContain("nu-reserve");
  });
});
