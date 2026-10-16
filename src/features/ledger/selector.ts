import { createSelector } from "@reduxjs/toolkit";

import type { RootState } from "@/store";
import { computeBalances, overdrawn, totalCash, unbackedDebt } from "./domain/balances";
import { budgetStatus, type BudgetStatus } from "./domain/budget";
import { cardSummaries } from "./domain/cards";

/** Lectores del libro. Todo lo derivado (saldos) se calcula en `domain/`, memorizado. */
export const selectLedgerLoaded = (state: RootState) => state.ledger.loaded;
export const selectAccounts = (state: RootState) => state.ledger.accounts;
export const selectEnvelopes = (state: RootState) => state.ledger.envelopes;
export const selectMovements = (state: RootState) => state.ledger.movements;
export const selectLedgerSettings = (state: RootState) => state.ledger.settings;

/** Sobres visibles en la carpeta (no archivados), en su orden. */
export const selectActiveEnvelopes = createSelector(selectEnvelopes, (envelopes) =>
  [...envelopes].filter((envelope) => !envelope.archived).sort((a, b) => a.order - b.order),
);

export const selectBalances = createSelector([selectAccounts, selectEnvelopes, selectMovements], (accounts, envelopes, movements) =>
  computeBalances({ accounts, envelopes, movements }),
);

/** Resumen para avisos: dinero real, sobregirado y deuda sin respaldo. */
export const selectLedgerHealth = createSelector([selectBalances, selectAccounts], (balances, accounts) => ({
  cash: totalCash(balances),
  overdrawn: overdrawn(balances),
  unbackedDebt: unbackedDebt(balances, accounts),
}));

/** Tarjetas con deuda, reserva, deuda sin respaldo, próximo corte y estado de cuenta. `today` = "YYYY-MM-DD". */
export const selectCardSummaries = createSelector(
  [selectAccounts, selectBalances, selectMovements, (_state: RootState, today: string) => today],
  (accounts, balances, movements, today) => cardSummaries(accounts, balances, movements, today),
);

/** Presupuesto de cada sobre activo que lo tiene (id → estado del periodo actual). `today` = "YYYY-MM-DD". */
export const selectBudgets = createSelector(
  [selectActiveEnvelopes, selectBalances, selectMovements, selectLedgerSettings, (_state: RootState, today: string) => today],
  (envelopes, balances, movements, settings, today) => {
    const budgets: Record<string, BudgetStatus> = {};
    for (const envelope of envelopes) {
      const status = budgetStatus(envelope, balances.envelopes[envelope.id] ?? 0, movements, balances.reversed, today, settings.weekStartsOn);
      if (status) budgets[envelope.id] = status;
    }
    return budgets;
  },
);
