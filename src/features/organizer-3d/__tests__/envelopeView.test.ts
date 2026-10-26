import { computeBalances } from "@/features/ledger/domain/balances";
import { startingData } from "@/features/ledger/domain/seed";
import { cardFaces, visibleEnvelopes } from "../domain/envelopeView";

describe("sobres visibles en el organizador", () => {
  it("al empezar de cero muestra Disponible y la tarjeta (en el tarjetero de la carpeta)", () => {
    const data = startingData("empty");
    expect(visibleEnvelopes(data.envelopes).map((envelope) => envelope.id)).toEqual(["available", "card"]);
  });

  it("al elegir el ejemplo muestra sus seis sobres", () => {
    expect(visibleEnvelopes(startingData("sample").envelopes)).toHaveLength(6);
  });

  it("las reservas de tarjeta llevan la cara de su tarjeta (nombre y deuda)", () => {
    const data = startingData("sample");
    const faces = cardFaces(data.accounts, computeBalances(data).debt);
    expect(faces.get("card")).toEqual({ name: "Tarjeta de crédito", debt: computeBalances(data).debt.visa / 100 });
    expect(faces.has("available")).toBe(false);
  });
});
