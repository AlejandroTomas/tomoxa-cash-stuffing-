import type { Account, LedgerSnapshot, Movement } from "./types";

/** Compra a meses sin intereses (2 o más mensualidades). */
export const isInstallmentPurchase = (movement: Movement) => movement.kind === "expense" && (movement.installments ?? 1) > 1;

/** Cambio que un movimiento produce en un saldo. */
export interface Effect {
  target: "account" | "envelope" | "debt";
  id: string;
  delta: number;
}

/**
 * Efectos de un movimiento (sin `reversal`, que es el inverso de su original).
 * Las cuentas de crédito no tienen "saldo": llevan deuda (`debt`).
 */
export function effectsOf(movement: Movement, accountsById: ReadonlyMap<string, Account>): Effect[] {
  const a = movement.amountMinor;
  const e = (target: Effect["target"], id: string | undefined, delta: number): Effect[] => (id ? [{ target, id, delta }] : []);
  switch (movement.kind) {
    case "income":
      return [...e("account", movement.accountId, a), ...e("envelope", movement.envelopeId, a)];
    case "expense": {
      const account = movement.accountId ? accountsById.get(movement.accountId) : undefined;
      if (account?.kind === "credit" && isInstallmentPurchase(movement)) {
        // A meses: solo la deuda. El sobre paga cada mensualidad cuando se aparta.
        return e("debt", account.id, a);
      }
      if (account?.kind === "credit") {
        // Gasto del sobre + deuda; el monto queda reservado para pagar la tarjeta.
        return [...e("debt", account.id, a), ...e("envelope", movement.envelopeId, -a), ...e("envelope", movement.reserveEnvelopeId, a)];
      }
      return [...e("account", movement.accountId, -a), ...e("envelope", movement.envelopeId, -a)];
    }
    case "assignment":
      return [...e("envelope", movement.envelopeId, -a), ...e("envelope", movement.toEnvelopeId, a)];
    case "accountTransfer":
      return [...e("account", movement.accountId, -a), ...e("account", movement.toAccountId, a)];
    case "cardPayment":
      // No es un gasto: baja el dinero real, baja la deuda y consume la reserva.
      return [...e("account", movement.accountId, -a), ...e("debt", movement.toAccountId, -a), ...e("envelope", movement.reserveEnvelopeId, -a)];
    case "reversal":
      return [];
  }
}

export interface Balances {
  /** Saldo de cada sobre (puede ser negativo: sobregirado). */
  envelopes: Record<string, number>;
  /** Saldo de cada cuenta de débito o efectivo. */
  accounts: Record<string, number>;
  /** Deuda de cada tarjeta de crédito. */
  debt: Record<string, number>;
  /** Movimientos cancelados (id del original → id de su cancelación). */
  reversed: Record<string, string>;
}

/** Saldos a partir de los movimientos. Nada se guarda: siempre se recalcula. */
export function computeBalances({ accounts, envelopes, movements }: LedgerSnapshot): Balances {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const byId = new Map(movements.map((movement) => [movement.id, movement]));
  const balances: Balances = { envelopes: {}, accounts: {}, debt: {}, reversed: {} };
  for (const envelope of envelopes) balances.envelopes[envelope.id] = 0;
  for (const account of accounts) {
    if (account.kind === "credit") balances.debt[account.id] = 0;
    else balances.accounts[account.id] = 0;
  }
  const apply = (effects: Effect[], sign: 1 | -1) => {
    for (const { target, id, delta } of effects) {
      const bucket = target === "account" ? balances.accounts : target === "envelope" ? balances.envelopes : balances.debt;
      bucket[id] = (bucket[id] ?? 0) + sign * delta;
    }
  };
  for (const movement of movements) {
    if (movement.kind !== "reversal") {
      apply(effectsOf(movement, accountsById), 1);
      continue;
    }
    const original = movement.reversalOf ? byId.get(movement.reversalOf) : undefined;
    if (!original || original.kind === "reversal" || balances.reversed[original.id]) continue;
    balances.reversed[original.id] = movement.id;
    apply(effectsOf(original, accountsById), -1);
  }
  return balances;
}

/** Dinero real disponible: suma de cuentas de débito y efectivo. */
export const totalCash = (balances: Balances) => Object.values(balances.accounts).reduce((sum, value) => sum + value, 0);

/** Lo que falta en sobres sobregirados (suma de saldos negativos, en positivo). */
export const overdrawn = (balances: Balances) => Object.values(balances.envelopes).reduce((sum, value) => sum + Math.max(0, -value), 0);

/**
 * Deuda sin respaldo: lo que se debe en tarjetas y no está cubierto por dinero
 * real apartado. La reserva de las tarjetas solo cuenta si no la están
 * "pidiendo prestada" sobres sobregirados. `deferred` (por tarjeta) es la parte
 * de compras a meses que todavía no toca apartar: no cuenta como deuda sin respaldo.
 */
export function unbackedDebt(balances: Balances, accounts: readonly Account[], deferred: Readonly<Record<string, number>> = {}): number {
  let debt = 0;
  let reserve = 0;
  for (const account of accounts) {
    if (account.kind !== "credit") continue;
    debt += Math.max(0, (balances.debt[account.id] ?? 0) - (deferred[account.id] ?? 0));
    if (account.card) reserve += Math.max(0, balances.envelopes[account.card.reserveEnvelopeId] ?? 0);
  }
  const backing = Math.max(0, reserve - overdrawn(balances));
  return Math.max(0, debt - backing);
}
