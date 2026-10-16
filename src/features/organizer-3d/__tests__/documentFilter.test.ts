import { computeBalances } from "@/features/ledger/domain/balances";
import { SEED_ACCOUNTS, SEED_ENVELOPES, seedMovements } from "@/features/ledger/domain/seed";
import type { Movement } from "@/features/ledger/domain/types";
import { documentsFromLedger, signOf, sortByRecent, summarizeActivity, type EnvelopeDocument } from "../domain/document";
import { describeFilter, EMPTY_FILTER, filterDocuments, isEmptyFilter, normalizeText, quickFilters, weekStartOf, type DocumentFilter } from "../domain/documentFilter";
import { parseLocalDate, toLocalIsoDate } from "@/utils/localDate";

const doc = (id: string, date: string, concept = "Súper"): EnvelopeDocument => ({ id, envelopeId: "week", date, concept, kind: "expense", direction: "out", amountMinor: 1000, movementId: id });
const ids = (docs: EnvelopeDocument[]) => docs.map((d) => d.id);
const withDate = (date: DocumentFilter["date"], text = ""): DocumentFilter => ({ date, text });

describe("fechas locales", () => {
  it("lee YYYY-MM-DD como día local, sin correrse por UTC", () => {
    const date = parseLocalDate("2026-10-06");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 6]);
    expect(toLocalIsoDate(date)).toBe("2026-10-06");
  });
  it("rechaza formatos inválidos", () => expect(() => parseLocalDate("6/10/2026")).toThrow());
});

describe("semanas de lunes a domingo", () => {
  it("el lunes de la semana", () => {
    expect(weekStartOf("2026-10-15")).toBe("2026-10-12"); // jueves
    expect(weekStartOf("2026-10-12")).toBe("2026-10-12"); // lunes
    expect(weekStartOf("2026-10-18")).toBe("2026-10-12"); // domingo
  });
  it("cruza mes y año", () => {
    expect(weekStartOf("2026-10-01")).toBe("2026-09-28");
    expect(weekStartOf("2027-01-02")).toBe("2026-12-28");
  });
});

describe("filterDocuments", () => {
  const docs = [doc("a", "2026-09-28"), doc("b", "2026-10-04", "Gasolina"), doc("c", "2026-10-05"), doc("d", "2026-10-12", "Café"), doc("e", "2026-10-02")];

  it("sin filtro devuelve todo, más reciente primero", () => expect(ids(filterDocuments(docs, EMPTY_FILTER))).toEqual(["d", "c", "b", "e", "a"]));
  it("por día de la semana (lunes)", () => expect(ids(filterDocuments(docs, withDate({ type: "weekday", weekday: 1 })))).toEqual(["d", "c", "a"]));
  it("por fecha exacta", () => expect(ids(filterDocuments(docs, withDate({ type: "date", date: "2026-10-04" })))).toEqual(["b"]));
  it("por semana, incluyendo lunes y domingo", () =>
    expect(ids(filterDocuments(docs, withDate({ type: "week", weekStart: "2026-09-28" })))).toEqual(["b", "e", "a"]));
  it("por mes", () => expect(ids(filterDocuments(docs, withDate({ type: "month", month: "2026-10" })))).toEqual(["d", "c", "b", "e"]));
  it("por texto, sin acentos ni mayúsculas", () => {
    expect(ids(filterDocuments(docs, withDate({ type: "all" }, "super")))).toEqual(["c", "e", "a"]);
    expect(ids(filterDocuments(docs, withDate({ type: "all" }, "  CAFÉ ")))).toEqual(["d"]);
  });
  it("combina fecha y texto", () =>
    expect(ids(filterDocuments(docs, withDate({ type: "week", weekStart: "2026-09-28" }, "súper")))).toEqual(["e", "a"]));
  it("detecta el filtro vacío", () => {
    expect(isEmptyFilter(EMPTY_FILTER)).toBe(true);
    expect(isEmptyFilter(withDate({ type: "all" }, "   "))).toBe(true);
    expect(isEmptyFilter(withDate({ type: "weekday", weekday: 5 }))).toBe(false);
  });
  it("normaliza texto", () => expect(normalizeText(" Tortillería ")).toBe("tortilleria"));
});

describe("accesos rápidos (hoy = jueves 15 oct 2026)", () => {
  const today = new Date(2026, 9, 15);
  it("hoy, esta semana, semana pasada y este mes", () => {
    expect(quickFilters.today(today)).toEqual({ type: "date", date: "2026-10-15" });
    expect(quickFilters.thisWeek(today)).toEqual({ type: "week", weekStart: "2026-10-12" });
    expect(quickFilters.lastWeek(today)).toEqual({ type: "week", weekStart: "2026-10-05" });
    expect(quickFilters.thisMonth(today)).toEqual({ type: "month", month: "2026-10" });
  });
});

describe("describeFilter (la frase en caligrafía)", () => {
  it("cada tipo de filtro", () => {
    expect(describeFilter(EMPTY_FILTER)).toBe("Todos los movimientos");
    expect(describeFilter(withDate({ type: "weekday", weekday: 1 }))).toBe("Los lunes");
    expect(describeFilter(withDate({ type: "weekday", weekday: 6 }))).toBe("Los sábados");
    expect(describeFilter(withDate({ type: "date", date: "2026-10-06" }))).toBe("El 6 de octubre");
    expect(describeFilter(withDate({ type: "week", weekStart: "2026-10-05" }))).toBe("Semana del 5 al 11 de oct");
    expect(describeFilter(withDate({ type: "month", month: "2026-10" }))).toBe("Octubre de 2026");
  });
  it("semanas que cruzan mes o año", () => {
    expect(describeFilter(withDate({ type: "week", weekStart: "2026-09-28" }))).toBe("Semana del 28 de sep al 4 de oct");
    expect(describeFilter(withDate({ type: "week", weekStart: "2026-12-28" }))).toBe("Semana del 28 de dic de 2026 al 3 de ene de 2027");
  });
  it("con texto", () => {
    expect(describeFilter(withDate({ type: "all" }, "súper"))).toBe("Buscando “súper”");
    expect(describeFilter(withDate({ type: "weekday", weekday: 5 }, "nómina"))).toBe("Los viernes · “nómina”");
  });
});

describe("documentos de cada sobre, desde el libro", () => {
  const movements = seedMovements();
  const reversed = computeBalances({ accounts: SEED_ACCOUNTS, envelopes: SEED_ENVELOPES, movements }).reversed;
  const docsOf = (id: string, list: readonly Movement[] = movements, rev = reversed) => documentsFromLedger(id, list, rev);

  it("cada sobre tiene movimientos, más recientes primero, y su actividad se deriva de ellos", () => {
    for (const { id } of SEED_ENVELOPES) {
      const docs = docsOf(id);
      expect(docs.length).toBeGreaterThan(0);
      expect(docs).toEqual(sortByRecent(docs));
      expect(summarizeActivity(docs)).toEqual({ movements: docs.length, lastMovement: docs[0].date });
    }
  });

  it("un reparto sale de un sobre y entra al otro", () => {
    const moved = movements.find((m) => m.kind === "assignment" && m.toEnvelopeId === "week")!;
    expect(docsOf("available").find((d) => d.movementId === moved.id)).toMatchObject({ direction: "out", kind: "assignment" });
    expect(docsOf("week").find((d) => d.movementId === moved.id)).toMatchObject({ direction: "in", kind: "assignment" });
  });

  it("la compra con tarjeta es gasto en su sobre y reserva en Tarjeta; el pago sale de Tarjeta", () => {
    const purchase = movements.find((m) => m.concept === "Súper con tarjeta")!;
    expect(docsOf("week").find((d) => d.movementId === purchase.id)).toMatchObject({ kind: "expense", direction: "out" });
    expect(docsOf("card").find((d) => d.movementId === purchase.id)).toMatchObject({ kind: "assignment", direction: "in", concept: "Reserva: Súper con tarjeta" });
    const payment = movements.find((m) => m.kind === "cardPayment")!;
    expect(docsOf("card").find((d) => d.movementId === payment.id)).toMatchObject({ kind: "payment", direction: "out" });
    expect(signOf({ direction: "in" })).toBe("+ ");
  });

  it("lo cancelado no aparece", () => {
    const moved = movements.find((m) => m.kind === "assignment" && m.toEnvelopeId === "savings")!;
    const reversal: Movement = { id: "rev", kind: "reversal", date: "2026-10-15", createdAt: "2026-10-15T00:00:00Z", concept: "Cancelación", amountMinor: moved.amountMinor, reversalOf: moved.id };
    const list = [...movements, reversal];
    const rev = computeBalances({ accounts: SEED_ACCOUNTS, envelopes: SEED_ENVELOPES, movements: list }).reversed;
    expect(docsOf("savings", list, rev).some((d) => d.movementId === moved.id || d.movementId === "rev")).toBe(false);
  });

  it("sin documentos no hay último movimiento", () => expect(summarizeActivity([])).toEqual({ movements: 0, lastMovement: null }));
});
