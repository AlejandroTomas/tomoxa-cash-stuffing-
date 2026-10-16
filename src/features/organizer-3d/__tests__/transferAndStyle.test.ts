import { envelopeStyleSchema, toneFor } from "../domain/envelopeStyle";
import { applyTransfer, checkTransfer, parseAmountMinor, transferDocuments, transferFormSchema, type Balances } from "../domain/transfer";

const balances: Balances = { available: 245000, card: 180000, savings: 320000, cash: 95000, week: 120000, fund: 500000 };

describe("parseAmountMinor", () => {
  it("acepta formatos comunes", () => {
    expect(parseAmountMinor("250")).toBe(25000);
    expect(parseAmountMinor("99.9")).toBe(9990);
    expect(parseAmountMinor("$ 1,234.50")).toBe(123450);
    expect(parseAmountMinor("0.01")).toBe(1);
  });
  it("rechaza lo inválido", () => {
    for (const text of ["", "abc", "1.234", "-5", "0", "0.00", "12.3.4"]) expect(parseAmountMinor(text)).toBeNull();
  });
});

describe("checkTransfer", () => {
  it("mueve si alcanza", () =>
    expect(checkTransfer({ from: "available", to: "savings", amount: "500" }, balances)).toEqual({
      ok: true,
      transfer: { from: "available", to: "savings", amountMinor: 50000 },
    }));
  it("permite mover todo, pero no más", () => {
    expect(checkTransfer({ from: "cash", to: "week", amount: "950" }, balances).ok).toBe(true);
    expect(checkTransfer({ from: "cash", to: "week", amount: "950.01" }, balances)).toMatchObject({ ok: false, field: "amount" });
  });
  it("rechaza mismo sobre, sobre inexistente y monto inválido", () => {
    expect(checkTransfer({ from: "card", to: "card", amount: "1" }, balances)).toMatchObject({ ok: false, field: "to" });
    expect(checkTransfer({ from: "nope", to: "card", amount: "1" }, balances)).toMatchObject({ ok: false, field: "from" });
    expect(checkTransfer({ from: "card", to: "fund", amount: "uno" }, balances)).toMatchObject({ ok: false, field: "amount" });
  });
  it("el esquema del formulario marca el destino repetido", () => {
    const result = transferFormSchema.safeParse({ from: "card", to: "card", amount: "1" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["to"]);
  });
});

describe("applyTransfer y sus movimientos", () => {
  const transfer = { from: "available" as const, to: "savings" as const, amountMinor: 50000 };
  it("resta en el origen, suma en el destino y conserva el total", () => {
    const after = applyTransfer(balances, transfer);
    expect(after.available).toBe(195000);
    expect(after.savings).toBe(370000);
    const total = (b: Balances) => Object.values(b).reduce((sum, v) => sum + v, 0);
    expect(total(after)).toBe(total(balances));
    expect(balances.available).toBe(245000); // sin mutar
  });
  it("deja un movimiento en cada sobre", () => {
    const names = { available: "Disponible", card: "Tarjeta", savings: "Ahorro", cash: "Efectivo", week: "Semana", fund: "Fondo" };
    expect(transferDocuments(transfer, "2026-10-15", names, "t1")).toEqual([
      { id: "t1-out", envelopeId: "available", date: "2026-10-15", kind: "assignment", concept: "Movido a Ahorro", amountMinor: 50000 },
      { id: "t1-in", envelopeId: "savings", date: "2026-10-15", kind: "assignment", concept: "Recibido de Disponible", amountMinor: 50000 },
    ]);
  });
});

describe("editar sobre", () => {
  const schema = envelopeStyleSchema(["Tarjeta", "Ahorro"]);
  it("acepta un estilo válido y recorta espacios", () =>
    expect(schema.parse({ name: "  Viajes ", description: " Vuelos y hotel ", color: "#7f9fe6", icon: "wallet" })).toEqual({
      name: "Viajes",
      description: "Vuelos y hotel",
      color: "#7f9fe6",
      icon: "wallet",
    }));
  it("rechaza nombre vacío, largo o repetido (sin importar mayúsculas)", () => {
    expect(schema.safeParse({ name: " ", description: "", color: "#7f9fe6", icon: "wallet" }).success).toBe(false);
    expect(schema.safeParse({ name: "x".repeat(17), description: "", color: "#7f9fe6", icon: "wallet" }).success).toBe(false);
    expect(schema.safeParse({ name: "ahorro", description: "", color: "#7f9fe6", icon: "wallet" }).success).toBe(false);
  });
  it("solo colores e iconos de la paleta", () => {
    expect(schema.safeParse({ name: "Viajes", description: "", color: "#000000", icon: "wallet" }).success).toBe(false);
    expect(schema.safeParse({ name: "Viajes", description: "", color: "#7f9fe6", icon: "rocket" }).success).toBe(false);
  });
  it("la descripción puede quedar vacía, pero no pasar de 60 caracteres", () => {
    expect(schema.safeParse({ name: "Viajes", description: "   ", color: "#7f9fe6", icon: "wallet" }).success).toBe(true);
    expect(schema.safeParse({ name: "Viajes", description: "x".repeat(61), color: "#7f9fe6", icon: "wallet" }).success).toBe(false);
  });
  it("tono claro del papel", () => {
    expect(toneFor("#000000", 0.5)).toBe("#808080");
    expect(toneFor("#ffffff")).toBe("#ffffff");
    expect(toneFor("nope")).toBe("#ffffff");
  });
});
