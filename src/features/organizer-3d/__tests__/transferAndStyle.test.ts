import { envelopeStyleSchema, toneFor } from "../domain/envelopeStyle";
import { parseAmountMinor, transferFormSchema } from "../domain/transfer";


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

describe("formulario mover dinero", () => {
  it("el esquema marca el destino repetido", () => {
    const result = transferFormSchema.safeParse({ from: "card", to: "card", amount: "1" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["to"]);
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
