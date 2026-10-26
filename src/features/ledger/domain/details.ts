import { parseLocalDate } from "@/utils/localDate";
import { ACCOUNT_KIND_LABELS } from "./accounts";
import { isInstallmentPurchase } from "./balances";
import { installmentAmount, installmentCutoffs } from "./installments";
import { formatMinor } from "./money";
import type { Account, Envelope, Movement } from "./types";

/** Un renglón del detalle de un movimiento ("Pagado con" → "Nu · tarjeta de crédito"). */
export interface MovementDetail {
  label: string;
  value: string;
}

export interface DetailContext {
  accounts: readonly Account[];
  envelopes: readonly Envelope[];
  movements: readonly Movement[];
}

const dayFormat = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });
const day = (iso: string) => dayFormat.format(parseLocalDate(iso)).replace(/\./g, "");

/** "BBVA · débito"; si el nombre ya dice el tipo ("Efectivo"), solo el nombre. */
export function accountLabel(account: Account | undefined): string {
  if (!account) return "Cuenta desconocida";
  const kind = ACCOUNT_KIND_LABELS[account.kind];
  return account.name.toLocaleLowerCase("es") === kind.toLocaleLowerCase("es") ? account.name : `${account.name} · ${kind.toLocaleLowerCase("es")}`;
}

/** Partes de un pago dividido (incluida la propia), en el orden en que se registraron. */
export const splitParts = (movement: Movement, movements: readonly Movement[]) =>
  movement.splitId ? movements.filter((other) => other.splitId === movement.splitId) : [movement];

/** De dónde salió y a dónde fue el dinero, en palabras, para tickets y listas. */
export function movementDetails(movement: Movement, { accounts, envelopes, movements }: DetailContext): MovementDetail[] {
  const account = (id?: string) => accountLabel(accounts.find((candidate) => candidate.id === id));
  const envelope = (id?: string) => envelopes.find((candidate) => candidate.id === id)?.name ?? "Sobre desconocido";
  const details: MovementDetail[] = [];
  const add = (label: string, value: string) => details.push({ label, value });

  switch (movement.kind) {
    case "income":
      add("Entró a", account(movement.accountId));
      add("Sobre", envelope(movement.envelopeId));
      break;
    case "expense": {
      const parts = splitParts(movement, movements);
      if (parts.length > 1) {
        add("Pago dividido", parts.map((part) => `${accounts.find((candidate) => candidate.id === part.accountId)?.name ?? "?"} ${formatMinor(part.amountMinor)}`).join(" + "));
      } else {
        add("Pagado con", account(movement.accountId));
      }
      add("Sale del sobre", envelope(movement.envelopeId));
      if (isInstallmentPurchase(movement)) {
        const months = movement.installments ?? 1;
        const card = accounts.find((candidate) => candidate.id === movement.accountId)?.card;
        add("Meses sin intereses", `${months} × ${formatMinor(installmentAmount(movement.amountMinor, months, 1))}`);
        if (card) add("Primera mensualidad", `corte del ${day(installmentCutoffs(movement.date, card.cutoffDay, 1)[0])}`);
      } else if (parts.length === 1 && movement.reserveEnvelopeId) {
        add("Apartado para pagarla en", envelope(movement.reserveEnvelopeId));
      }
      break;
    }
    case "assignment": {
      add("De", envelope(movement.envelopeId));
      add("A", envelope(movement.toEnvelopeId));
      const purchase = movement.installmentOf ? movements.find((candidate) => candidate.id === movement.installmentOf) : undefined;
      if (purchase) add("Mensualidad", `${movement.installmentNumber} de ${purchase.installments} · ${purchase.concept}`);
      break;
    }
    case "accountTransfer":
      add("Sale de", account(movement.accountId));
      add("Entra a", account(movement.toAccountId));
      break;
    case "cardPayment":
      add("Pagado desde", account(movement.accountId));
      add("Tarjeta", accounts.find((candidate) => candidate.id === movement.toAccountId)?.name ?? "Tarjeta desconocida");
      if (movement.reserveEnvelopeId) add("Usa lo apartado en", envelope(movement.reserveEnvelopeId));
      break;
    case "reversal": {
      const original = movements.find((candidate) => candidate.id === movement.reversalOf);
      add("Cancela", original ? `${original.concept} (${day(original.date)})` : "Movimiento desconocido");
      break;
    }
  }
  return details;
}
