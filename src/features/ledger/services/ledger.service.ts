import { computeBalances } from "../domain/balances";
import { checkCardSettings, checkSettings } from "../domain/cards";
import { checkArchive, checkEnvelope } from "../domain/envelopes";
import { DEFAULT_SETTINGS, SEED_ACCOUNTS, SEED_ENVELOPES, seedMovements } from "../domain/seed";
import type { Account, CardSettings, Envelope, LedgerSettings, Movement } from "../domain/types";
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
  return {
    /** Abre el libro; la primera vez siembra los datos de ejemplo. */
    async load(): Promise<LedgerData> {
      if (!(await repository.isSeeded())) {
        await repository.seed({ accounts: SEED_ACCOUNTS, envelopes: SEED_ENVELOPES, movements: seedMovements(), settings: DEFAULT_SETTINGS }, now().toISOString());
      }
      const data = await repository.loadAll();
      return { ...data, settings: data.settings ?? DEFAULT_SETTINGS };
    },

    /** Registra un movimiento si cumple las reglas. Con tarjeta, completa su sobre de reserva. */
    async record(draft: MovementDraft): Promise<Movement> {
      const data = await repository.loadAll();
      const complete: MovementDraft = { ...draft, concept: draft.concept.trim() };
      if (draft.kind === "expense" || draft.kind === "cardPayment") {
        const cardId = draft.kind === "expense" ? draft.accountId : draft.toAccountId;
        const card = data.accounts.find((account) => account.id === cardId && account.kind === "credit");
        if (card?.card) complete.reserveEnvelopeId = card.card.reserveEnvelopeId;
      }
      const issue = checkMovement(complete, data);
      if (issue) throw new LedgerRuleError(issue);
      const movement: Movement = { ...complete, id: newId(), createdAt: now().toISOString() };
      await repository.addMovement(movement);
      return movement;
    },

    /** Cancela un movimiento registrando su inverso (el original no se toca). */
    async cancel(movementId: string, date: string): Promise<Movement> {
      const data = await repository.loadAll();
      const original = data.movements.find((movement) => movement.id === movementId);
      return this.record({ kind: "reversal", date, concept: `Cancelación: ${original?.concept ?? "movimiento"}`, amountMinor: original?.amountMinor ?? 0, reversalOf: movementId });
    },

    /** Crea o edita un sobre (nombre único entre los activos, color e icono válidos). */
    async saveEnvelope(envelope: Envelope): Promise<Envelope> {
      const data = await repository.loadAll();
      const clean: Envelope = { ...envelope, name: envelope.name.trim(), description: envelope.description.trim() };
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

    /** Día de corte y días para pagar de una tarjeta. */
    async saveCardSettings(accountId: string, card: Pick<CardSettings, "cutoffDay" | "paymentDays">): Promise<Account> {
      const data = await repository.loadAll();
      const account = data.accounts.find((candidate) => candidate.id === accountId);
      if (!account?.card) throw new LedgerRuleError({ code: "UNKNOWN_ACCOUNT", field: "form", message: "Esa tarjeta no existe." });
      const issue = checkCardSettings(card);
      if (issue) throw new LedgerRuleError({ code: "INVALID_SETTINGS", ...issue });
      const saved: Account = { ...account, card: { ...account.card, cutoffDay: card.cutoffDay, paymentDays: card.paymentDays } };
      await repository.putAccount(saved);
      return saved;
    },
  };
}

export type LedgerService = ReturnType<typeof createLedgerService>;

export const ledgerService = createLedgerService({
  repository: ledgerRepository,
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
});
