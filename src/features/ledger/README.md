# ledger — libro de movimientos (en el dispositivo)

Cuentas (dónde está el dinero), sobres (para qué está apartado) y movimientos
inmutables. Los saldos **nunca se guardan**: se calculan con `computeBalances`.
Todo vive en IndexedDB (Dexie, base `aurora-ledger`); no hay servidor. Spec y
decisiones: `.ia/tasks/fase-2-libro-de-movimientos.md`.

```
domain/        types · balances (saldos, deuda sin respaldo) · validation (reglas) ·
               envelopes (crear/editar/archivar) · statement (cortes) · seed (datos de ejemplo) ·
               cards (resumen por tarjeta, ajustes, ingresos del día) · money (montos ↔ texto) ·
               movementForm (formulario de registro → movimiento) · backup (respaldo JSON validado)
errors/        LedgerRuleError (ValidationError con code y campo)
repositories/  ledgerDatabase (Dexie, versionada) · ledger.repository (privado)
services/      ledger.service: load (siembra la 1.ª vez), record, cancel, saveEnvelope, archiveEnvelope,
               saveSettings, saveCardSettings, exportBackup, importBackup, resetToSample
actions/       thunks "ledger/…" (privados; se importan desde ledgerSlice)
ledgerSlice.ts · selector.ts   estado y saldos memorizados (selectLedgerHealth, selectCardSummaries)
components/    RecordMovementDialog (gasto, ingreso, pago de tarjeta, depósito/retiro) ·
               AccountsSheet (cuentas, deuda, sobregirados, movimientos con "cancelar", ajustes y respaldo)
```

## Reglas que conviene recordar

- Compra con tarjeta: gasto del sobre + deuda; el monto se reserva completo en el
  sobre de la tarjeta. Pagar la tarjeta **no** es un gasto (consume la reserva).
- Un gasto puede dejar un sobre en negativo (sobregirado); las cuentas de débito y
  efectivo nunca, y la deuda nunca baja de cero.
- Invariante (probado en cada paso): `Σ sobres = Σ débito + efectivo`.
- Corregir = cancelar (`reversal`); un movimiento se cancela una sola vez.
- `Disponible` y la reserva de una tarjeta no se archivan; solo se archivan sobres vacíos.
- Importar un respaldo reemplaza todo, y solo si el archivo completo es válido: cada
  movimiento se vuelve a aplicar en orden con `checkMovement`. Nunca se importa a medias.

## Cambiar el esquema

Agrega un `this.version(n + 1)` en `ledgerDatabase.ts` (con `upgrade` si hay que
migrar datos). Nunca edites una versión ya publicada: los datos del usuario viven ahí.
