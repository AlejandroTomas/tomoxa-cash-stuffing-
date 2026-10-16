# ledger — libro de movimientos (en el dispositivo)

Cuentas (dónde está el dinero), sobres (para qué está apartado) y movimientos
inmutables. Los saldos **nunca se guardan**: se calculan con `computeBalances`.
Todo vive en IndexedDB (Dexie, base `aurora-ledger`: nombre interno que no se
renombra para no perder datos); no hay servidor. Los sobres no se borran: se archivan.

## Modelo de dinero

Montos enteros en centavos, siempre positivos. Un movimiento no se edita ni se
borra: se cancela con su inverso (`reversal`).

| Tipo | Cuentas | Sobres |
|---|---|---|
| `income` | + débito o efectivo | + sobre (por defecto Disponible) |
| `expense` con débito/efectivo | − cuenta | − sobre del gasto |
| `expense` con crédito | + deuda de la tarjeta | − sobre del gasto · + sobre de reserva (monto completo) |
| `assignment` (mover) | — | − origen · + destino |
| `accountTransfer` (depósito/retiro) | − cuenta A · + cuenta B | — |
| `cardPayment` | − débito/efectivo · − deuda | − sobre de reserva |

Apartar en el sobre Tarjeta no mueve dinero físico: si la reserva está en efectivo
y la tarjeta se paga desde débito, hace falta un depósito (`accountTransfer`).
Ajustes por defecto: nómina el viernes a débito, efectivo el lunes, una tarjeta con
corte el 15 y pago 20 días después (fechas reales: el corte 31 cae el 30 en meses
cortos), semana de lunes a domingo, MXN.

**Estado de cuenta** (`cardStatement`): lo que hay que pagar para no generar
intereses es lo comprado hasta el último corte menos lo pagado hasta hoy (los
cancelados no cuentan). La fecha límite es la de ese corte, no la del periodo en
curso. Se avisa en la nav cuando faltan `PAYMENT_REMINDER_DAYS` (5) días o menos.

**Presupuesto** (`budget`): un sobre puede tener un monto por semana o por mes
(`envelope.budget`, opcional). `budgetStatus` suma los gastos del sobre en el
periodo actual (la semana empieza según `weekStartsOn`; con tarjeta también
cuentan, sin cancelados). Falta apartar = presupuesto − gastado − saldo: el dinero
que sobró de periodos anteriores cuenta. Es solo un plan: no bloquea gastos.

```
domain/        types · balances (saldos, deuda sin respaldo) · validation (reglas) ·
               envelopes (crear/editar/archivar) · budget (presupuesto por periodo) · statement (cortes) · seed (datos de ejemplo) ·
               cards (resumen por tarjeta, ajustes, ingresos del día) · money (montos ↔ texto) ·
               movementForm (formulario de registro → movimiento) · backup (respaldo JSON validado)
errors/        LedgerRuleError (ValidationError con code y campo)
repositories/  ledgerDatabase (Dexie, versionada) · ledger.repository (privado)
services/      ledger.service: load (siembra la 1.ª vez), record, cancel, saveEnvelope, archiveEnvelope,
               saveSettings, saveCardSettings, exportBackup, importBackup, resetToSample
actions/       thunks "ledger/…" (privados; se importan desde ledgerSlice)
ledgerSlice.ts · selector.ts   estado y saldos memorizados (selectLedgerHealth, selectCardSummaries, selectBudgets)
components/    RecordMovementDialog (gasto, ingreso, pago de tarjeta, depósito/retiro) ·
               AccountsSheet (cuentas, deuda, presupuestos, sobregirados, movimientos con "cancelar", ajustes y respaldo)
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
