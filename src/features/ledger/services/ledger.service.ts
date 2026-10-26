import { createBackup, parseBackup, type LedgerBackup } from "../domain/backup";
import { computeBalances } from "../domain/balances";
import { CARD_RESERVE_COLORS, checkAccount, checkArchiveAccount, reserveEnvelopeName, type AccountInput } from "../domain/accounts";
import { checkSettings } from "../domain/cards";
import { checkArchive, checkEnvelope } from "../domain/envelopes";
import { DEFAULT_SETTINGS, startingData, type StartMode } from "../domain/seed";
import type { Account, Envelope, LedgerSettings, Movement } from "../domain/types";
import { checkMovement, type MovementDraft } from "../domain/validation";
import { LedgerRuleError } from "../errors/ledger-errors";
import { ledgerRepository, type LedgerData, type LedgerRepository } from "../repositories/ledger.repository";

interface ServiceDeps {
  repository: LedgerRepository;
  now: () => Date;
  newId: () => string;
}

/**
 * services/: las reglas del libro. Siempre valida contra lo guardado (no contra
 * lo que crea la pantalla), registra y devuelve lo nuevo. No sabe de React.
 */
export function createLedgerService({ repository, now, newId }: ServiceDeps) {
  /** Valida en orden (cada uno ya con los anteriores aplicados) y guarda todos juntos. */
  async function addValidated(drafts: readonly MovementDraft[]): Promise<Movement[]> {
    const data = await repository.loadAll();
    const at = now().toISOString();
    const added: Movement[] = [];
    for (const draft of drafts) {
      const complete: MovementDraft = { ...draft, concept: draft.concept.trim() };
      if (draft.kind === "expense" || draft.kind === "cardPayment") {
        const cardId = draft.kind === "expense" ? draft.accountId : draft.toAccountId;
        const card = data.accounts.find((account) => account.id === cardId && account.kind === "credit");
        if (card?.card) complete.reserveEnvelopeId = card.card.reserveEnvelopeId;
      }
      const issue = checkMovement(complete, { ...data, movements: [...data.movements, ...added] });
      if (issue) throw new LedgerRuleError(issue);
      added.push({ ...complete, id: newId(), createdAt: at });
    }
    if (added.length === 1) await repository.addMovement(added[0]);
    else await repository.addMovements(added);
    return added;
  }

  return {
    /** Abre el libro guardado; `null` si nunca se empezó (la interfaz pregunta cómo empezar). */
    async open(): Promise<LedgerData | null> {
      if (!(await repository.isStarted())) return null;
      return this.load();
    },

    /** Lee lo guardado. */
    async load(): Promise<LedgerData> {
      const data = await repository.loadAll();
      return { ...data, settings: data.settings ?? DEFAULT_SETTINGS };
    },

    /** Empieza (o vuelve a empezar) de cero o con los datos de ejemplo. Reemplaza lo que hubiera. */
    async start(mode: StartMode): Promise<LedgerData> {
      await repository.replaceAll(startingData(mode), now().toISOString());
      return this.load();
    },

    /** Todo el libro como respaldo (para descargar). */
    async exportBackup(): Promise<LedgerBackup> {
      const data = await repository.loadAll();
      return createBackup({ accounts: data.accounts, envelopes: data.envelopes, movements: data.movements, settings: data.settings ?? DEFAULT_SETTINGS }, now().toISOString());
    },

    /** Reemplaza el libro con un respaldo, solo si es válido completo. */
    async importBackup(text: string): Promise<LedgerData> {
      const result = parseBackup(text);
      if ("message" in result) throw new LedgerRuleError({ code: "INVALID_BACKUP", field: "form", message: result.message });
      await repository.replaceAll(result.contents, now().toISOString());
      return this.load();
    },

    /** Registra un movimiento si cumple las reglas. Con tarjeta, completa su sobre de reserva. */
    async record(draft: MovementDraft): Promise<Movement> {
      const [movement] = await addValidated([draft]);
      return movement;
    },

    /**
     * Un gasto pagado con varias formas (efectivo + tarjeta…): una parte por
     * cuenta, mismo sobre, fecha y concepto. Se guardan todas o ninguna y se
     * cancelan juntas.
     */
    async recordSplit(parts: MovementDraft[]): Promise<Movement[]> {
      if (parts.length < 2 || parts.some((part) => part.kind !== "expense" || part.installments !== undefined)) {
        throw new LedgerRuleError({ code: "INVALID_SPLIT", field: "form", message: "Un pago dividido son dos o más formas de pago de un mismo gasto, sin meses." });
      }
      const [first] = parts;
      if (parts.some((part) => part.envelopeId !== first.envelopeId || part.date !== first.date || part.concept.trim() !== first.concept.trim())) {
        throw new LedgerRuleError({ code: "INVALID_SPLIT", field: "form", message: "Las partes de un pago dividido comparten sobre, fecha y concepto." });
      }
      if (new Set(parts.map((part) => part.accountId)).size !== parts.length) {
        throw new LedgerRuleError({ code: "INVALID_SPLIT", field: "form", message: "Usa cada cuenta una sola vez en el pago dividido." });
      }
      const splitId = newId();
      return addValidated(parts.map((part) => ({ ...part, splitId })));
    },

    /** Cancela un movimiento registrando su inverso (el original no se toca). Un pago dividido se cancela completo. */
    async cancel(movementId: string, date: string): Promise<Movement[]> {
      const data = await repository.loadAll();
      const original = data.movements.find((movement) => movement.id === movementId);
      const reversed = new Set(data.movements.filter((movement) => movement.kind === "reversal").map((movement) => movement.reversalOf));
      const group = original?.splitId ? data.movements.filter((movement) => movement.splitId === original.splitId && !reversed.has(movement.id)) : [original];
      if (!group.length) throw new LedgerRuleError({ code: "ALREADY_REVERSED", field: "form", message: "Ese movimiento ya está cancelado." });
      return addValidated(
        group.map((movement) => ({ kind: "reversal", date, concept: `Cancelación: ${movement?.concept ?? "movimiento"}`, amountMinor: movement?.amountMinor ?? 0, reversalOf: movement?.id ?? movementId })),
      );
    },

    /** Crea o edita un sobre (nombre único entre los activos, color, icono y presupuesto válidos). */
    async saveEnvelope(envelope: Envelope): Promise<Envelope> {
      const data = await repository.loadAll();
      // Sin presupuesto, el campo se quita (no queda `budget: undefined` guardado).
      const { budget, ...rest } = envelope;
      const clean: Envelope = { ...rest, name: envelope.name.trim(), description: envelope.description.trim(), ...(budget ? { budget } : {}) };
      const issue = checkEnvelope(clean, data.envelopes);
      if (issue) throw new LedgerRuleError(issue);
      const isNew = !data.envelopes.some((existing) => existing.id === clean.id);
      const saved = isNew ? { ...clean, order: Math.max(-1, ...data.envelopes.map((e) => e.order)) + 1, archived: false } : clean;
      await repository.putEnvelope(saved);
      return saved;
    },

    /** Archiva un sobre vacío (su historial se conserva). */
    async archiveEnvelope(envelopeId: string): Promise<Envelope> {
      const data = await repository.loadAll();
      const envelope = data.envelopes.find((existing) => existing.id === envelopeId);
      if (!envelope) throw new LedgerRuleError({ code: "UNKNOWN_ENVELOPE", field: "form", message: "Ese sobre no existe." });
      const issue = checkArchive(envelope, computeBalances(data), data.accounts);
      if (issue) throw new LedgerRuleError(issue);
      const archived = { ...envelope, archived: true };
      await repository.putEnvelope(archived);
      return archived;
    },

    /** Ingresos recurrentes y preferencias (validados). */
    async saveSettings(settings: LedgerSettings): Promise<LedgerSettings> {
      const data = await repository.loadAll();
      const clean = { ...settings, recurringIncome: settings.recurringIncome.map((income) => ({ ...income, label: income.label.trim() })) };
      const issue = checkSettings(clean, data.accounts);
      if (issue) throw new LedgerRuleError({ code: "INVALID_SETTINGS", ...issue });
      await repository.saveSettings(clean);
      return clean;
    },

    /**
     * Crea o edita una cuenta (débito, efectivo o tarjeta). Una tarjeta nueva
     * crea su sobre de reserva; al renombrarla, la reserva se renombra si se
     * llamaba como ella. El tipo de una cuenta no cambia.
     */
    async saveAccount(input: AccountInput): Promise<{ account: Account; envelope: Envelope | null }> {
      const data = await repository.loadAll();
      const existing = input.id ? data.accounts.find((account) => account.id === input.id) : undefined;
      if (input.id && !existing) throw new LedgerRuleError({ code: "UNKNOWN_ACCOUNT", field: "form", message: "Esa cuenta no existe." });
      const kind = existing?.kind ?? input.kind;
      const issue = checkAccount({ ...input, kind }, data.accounts);
      if (issue) throw new LedgerRuleError(issue);
      const name = input.name.trim();
      const card = { cutoffDay: input.cutoffDay ?? 0, paymentDays: input.paymentDays ?? 0 };

      if (existing) {
        const saved: Account = { ...existing, name, ...(existing.card ? { card: { ...existing.card, ...card } } : {}) };
        const reserve = existing.card ? data.envelopes.find((envelope) => envelope.id === existing.card?.reserveEnvelopeId) : undefined;
        const others = data.envelopes.filter((envelope) => envelope.id !== reserve?.id);
        const renamed = reserve && name !== existing.name && reserve.name === reserveEnvelopeName(existing.name, others) ? reserveEnvelopeName(name, others) : null;
        const envelope = reserve && renamed ? { ...reserve, name: renamed } : null;
        await repository.putAccountWithEnvelope(saved, envelope);
        return { account: saved, envelope };
      }

      const id = newId();
      if (kind !== "credit") {
        const account: Account = { id, name, kind, archived: false };
        await repository.putAccountWithEnvelope(account, null);
        return { account, envelope: null };
      }
      const reserveName = reserveEnvelopeName(name, data.envelopes);
      if (!reserveName) throw new LedgerRuleError({ code: "NAME_TAKEN", field: "name", message: "Ya hay un sobre con ese nombre: usa otro nombre para la tarjeta." });
      const cardCount = data.accounts.filter((account) => account.kind === "credit").length;
      const envelope: Envelope = {
        id: newId(),
        name: reserveName,
        description: `Apartado para pagar ${name}`,
        color: CARD_RESERVE_COLORS[cardCount % CARD_RESERVE_COLORS.length],
        icon: "card",
        order: Math.max(-1, ...data.envelopes.map((existingEnvelope) => existingEnvelope.order)) + 1,
        archived: false,
      };
      const envelopeIssue = checkEnvelope(envelope, data.envelopes);
      if (envelopeIssue?.code === "TOO_MANY") throw new LedgerRuleError({ ...envelopeIssue, message: `${envelopeIssue.message} Cada tarjeta usa un sobre para su reserva.` });
      if (envelopeIssue) throw new LedgerRuleError(envelopeIssue);
      const account: Account = { id, name, kind, archived: false, card: { ...card, reserveEnvelopeId: envelope.id } };
      await repository.putAccountWithEnvelope(account, envelope);
      return { account, envelope };
    },

    /** Archiva una cuenta vacía (una tarjeta, con su sobre de reserva). Su historial se conserva. */
    async archiveAccount(accountId: string): Promise<{ account: Account; envelope: Envelope | null }> {
      const data = await repository.loadAll();
      const account = data.accounts.find((candidate) => candidate.id === accountId);
      if (!account) throw new LedgerRuleError({ code: "UNKNOWN_ACCOUNT", field: "form", message: "Esa cuenta no existe." });
      const issue = checkArchiveAccount(account, data.accounts, computeBalances(data), data.settings ?? DEFAULT_SETTINGS);
      if (issue) throw new LedgerRuleError(issue);
      const reserve = account.card ? data.envelopes.find((envelope) => envelope.id === account.card?.reserveEnvelopeId) : undefined;
      const archived: Account = { ...account, archived: true };
      const envelope = reserve ? { ...reserve, archived: true } : null;
      await repository.putAccountWithEnvelope(archived, envelope);
      return { account: archived, envelope };
    },
  };
}

export type LedgerService = ReturnType<typeof createLedgerService>;

export const ledgerService = createLedgerService({
  repository: ledgerRepository,
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
});
