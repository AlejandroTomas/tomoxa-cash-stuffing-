import { computeBalances } from "@/features/ledger/domain/balances";
import { seedMovements, startingData } from "@/features/ledger/domain/seed";
import { visibleEnvelopes } from "../domain/envelopeView";

describe("sobres visibles en el organizador", () => {
  it("al empezar de cero solo muestra Disponible y permite registrar ingresos", () => {
    const data = startingData("empty");
    expect(visibleEnvelopes(data.envelopes, data.envelopes, data.movements, computeBalances(data).envelopes).map((envelope) => envelope.id)).toEqual(["available"]);
  });

  it("al elegir el ejemplo muestra sus seis sobres", () => {
    const data = startingData("sample");
    expect(visibleEnvelopes(data.envelopes, data.envelopes, data.movements, computeBalances(data).envelopes)).toHaveLength(6);
  });

  it("muestra Tarjeta cuando ya se usa la reserva", () => {
    const data = startingData("empty");
    const movements = [seedMovements().find((movement) => movement.accountId === "visa")!];
    expect(visibleEnvelopes(data.envelopes, data.envelopes, movements, {}).map((envelope) => envelope.id)).toEqual(["available", "card"]);
  });
});
