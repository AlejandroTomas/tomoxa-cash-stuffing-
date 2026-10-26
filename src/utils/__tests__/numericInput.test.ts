import { sanitizeAmountText, sanitizeDigits } from "../numericInput";

describe("sanitizeAmountText", () => {
  it("quita letras y símbolos", () => {
    expect(sanitizeAmountText("12a3b")).toBe("123");
    expect(sanitizeAmountText("$ -250")).toBe("250");
    expect(sanitizeAmountText("abc")).toBe("");
  });

  it("deja las comas de miles y un solo punto con dos decimales", () => {
    expect(sanitizeAmountText("1,234.50")).toBe("1,234.50");
    expect(sanitizeAmountText("12.345")).toBe("12.34");
    expect(sanitizeAmountText("1.2.3")).toBe("1.23");
    expect(sanitizeAmountText("99.")).toBe("99.");
  });
});

describe("sanitizeDigits", () => {
  it("deja solo dígitos y respeta el largo", () => {
    expect(sanitizeDigits("1a5")).toBe("15");
    expect(sanitizeDigits("-3.5", 2)).toBe("35");
    expect(sanitizeDigits("123", 2)).toBe("12");
  });
});
