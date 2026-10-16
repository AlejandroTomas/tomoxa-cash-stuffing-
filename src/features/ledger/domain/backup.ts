import { z } from "zod";
import { checkSettings } from "./cards";
import type { Account, Envelope, LedgerSettings, Movement } from "./types";
import { checkMovement } from "./validation";

export const BACKUP_APP = "aurora-ledger";
export const BACKUP_VERSION = 1;

/** Archivo de respaldo: todo el libro en JSON. */
export interface LedgerBackup {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  accounts: Account[];
  envelopes: Envelope[];
  movements: Movement[];
  settings: LedgerSettings;
}

export interface BackupContents {
  accounts: Account[];
  envelopes: Envelope[];
  movements: Movement[];
  settings: LedgerSettings;
}

const id = z.string().min(1).max(100);
const optionalId = id.optional();

const accountSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  kind: z.enum(["debit", "cash", "credit"]),
  archived: z.boolean(),
  card: z.object({ cutoffDay: z.number().int(), paymentDays: z.number().int(), reserveEnvelopeId: id }).optional(),
});

const envelopeSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  description: z.string().max(200),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  icon: z.enum(["wallet", "card", "piggy", "banknote", "calendar", "chart"]),
  order: z.number().int(),
  archived: z.boolean(),
});

const movementSchema = z.object({
  id,
  kind: z.enum(["income", "expense", "assignment", "accountTransfer", "cardPayment", "reversal"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.string().min(1),
  amountMinor: z.number().int(),
  concept: z.string().max(120),
  accountId: optionalId,
  toAccountId: optionalId,
  envelopeId: optionalId,
  toEnvelopeId: optionalId,
  reserveEnvelopeId: optionalId,
  reversalOf: optionalId,
});

const settingsSchema = z.object({
  recurringIncome: z.array(z.object({ id, label: z.string(), weekday: z.number().int(), accountId: id })),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  currency: z.literal("MXN"),
});

const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  accounts: z.array(accountSchema).min(1),
  envelopes: z.array(envelopeSchema).min(1),
  movements: z.array(movementSchema),
  settings: settingsSchema,
});

export function createBackup(contents: BackupContents, exportedAt: string): LedgerBackup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt, ...contents };
}

/** Nombre del archivo: "aurora-respaldo-2026-10-16.json". */
export const backupFileName = (date: string) => `aurora-respaldo-${date}.json`;

const duplicated = (items: readonly { id: string }[]) => items.length !== new Set(items.map((item) => item.id)).size;

/**
 * Lee y valida un respaldo. Además del formato, vuelve a aplicar cada
 * movimiento en orden con las reglas del libro: si alguno no pasa, el archivo
 * se rechaza completo (nunca se importa a medias).
 */
export function parseBackup(text: string): { contents: BackupContents } | { message: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { message: "El archivo no es un respaldo válido (no es JSON)." };
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const app = typeof raw === "object" && raw !== null && "app" in raw ? (raw as { app: unknown }).app : null;
    return { message: app === BACKUP_APP ? "El respaldo está dañado o es de una versión que no se reconoce." : "Ese archivo no es un respaldo de Aurora." };
  }
  const { accounts, envelopes, movements, settings } = parsed.data;
  if (duplicated(accounts) || duplicated(envelopes) || duplicated(movements)) return { message: "El respaldo tiene registros repetidos." };
  for (const account of accounts) {
    if (account.kind === "credit" && !envelopes.some((envelope) => envelope.id === account.card?.reserveEnvelopeId)) {
      return { message: `La tarjeta ${account.name} no tiene su sobre de reserva.` };
    }
  }
  if (checkSettings(settings, accounts)) return { message: "Los ajustes del respaldo no son válidos." };

  // Las reglas se aplican con los sobres y cuentas activos (como cuando se registró), en orden de registro.
  const ordered = [...movements].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const active = { accounts: accounts.map((account) => ({ ...account, archived: false })), envelopes: envelopes.map((envelope) => ({ ...envelope, archived: false })) };
  const applied: Movement[] = [];
  for (const movement of ordered) {
    const { id: _id, createdAt: _createdAt, ...draft } = movement;
    const issue = checkMovement(draft, { ...active, movements: applied });
    if (issue) return { message: `El movimiento "${movement.concept}" del ${movement.date} no cuadra: ${issue.message}` };
    applied.push(movement);
  }
  return { contents: { accounts, envelopes, movements: ordered, settings } };
}
