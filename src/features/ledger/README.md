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
| `expense` a meses (`installments`) | + deuda de la tarjeta (completa) | — (el sobre paga cada mensualidad al apartarla) |
| `assignment` con `installmentOf` | — | − sobre de la compra · + reserva de la tarjeta (una mensualidad) |
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

**Cuentas** (`accounts`): varias de débito, efectivo y tarjetas. Cada tarjeta nueva
crea su propio sobre de reserva (con el nombre de la tarjeta); se archiva junto con
ella y solo si no hay deuda ni reserva. La reserva de una tarjeta sin usar no se
muestra en la carpeta, pero cuenta para el límite de 8 sobres.

**Pago dividido** (`splitId`): un gasto pagado con varias formas son varios `expense`
(uno por cuenta) con el mismo `splitId`; se guardan juntos y se cancelan juntos.

**Meses sin intereses** (`installments`): la compra sube la deuda completa pero no
toca el sobre. Cada corte cobra una mensualidad (la 1.ª en el corte del periodo de
la compra); el estado de cuenta solo suma las cortadas. Cada mes el usuario aparta
la mensualidad (`assignment` del sobre a la reserva con `installmentOf`). Lo que
todavía no toca apartar no cuenta como deuda sin respaldo. Avisos: `reminders`
(pagos y mensualidades) → `core/notify` (notificación al abrir la app o mientras
está abierta; para avisar con la app cerrada haría falta Web Push con servidor).

**Presupuesto** (`budget`): un sobre puede tener un monto por semana o por mes
(`envelope.budget`, opcional). `budgetStatus` suma los gastos del sobre en el
periodo actual (la semana empieza según `weekStartsOn`; con tarjeta también
cuentan, sin cancelados). Falta apartar = presupuesto − gastado − saldo: el dinero
que sobró de periodos anteriores cuenta. Es solo un plan: no bloquea gastos.

```
domain/        types · balances (saldos, deuda sin respaldo) · validation (reglas) ·
               envelopes (crear/editar/archivar) · budget (presupuesto por periodo) · statement (cortes) · seed (datos de ejemplo) ·
               cards (resumen por tarjeta, ajustes, ingresos del día) · money (montos ↔ texto) ·
               accounts (crear/editar/archivar cuentas) · installments (meses sin intereses) ·
               details (de dónde salió y a dónde fue) · reminders (avisos de pago) ·
               movementForm (formulario de registro → movimiento) · backup (respaldo JSON validado)
errors/        LedgerRuleError (ValidationError con code y campo)
repositories/  ledgerDatabase (Dexie, versionada) · ledger.repository (privado)
services/      ledger.service: open (detecta la 1.ª vez), start (de cero o con ejemplo), load,
               record, recordSplit, cancel (un pago dividido completo), saveEnvelope, archiveEnvelope,
               saveSettings, saveAccount, archiveAccount,
               exportBackup, importBackup
actions/       thunks "ledger/…" (privados; se importan desde ledgerSlice)
ledgerSlice.ts · selector.ts   estado y saldos memorizados (selectLedgerHealth, selectCardSummaries, selectBudgets)
components/    RecordMovementDialog (gasto —dividido o a meses—, ingreso, pago de tarjeta, depósito/retiro) ·
               AccountsSettings (cuentas y tarjetas) · PaymentReminders (avisos) ·
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
- La primera vez se elige entre comenzar de cero o explorar el ejemplo. De cero se
  guardan solo los destinos internos `Disponible` y `Tarjeta`, sin movimientos,
  presupuestos ni ingresos recurrentes. El organizador muestra solo `Disponible`;
  la reserva de tarjeta aparece cuando se usa y se pueden crear sobres propios.
- Cuentas → Ajustes permite reiniciar el libro de cero o volver al ejemplo. Ambas
  opciones reemplazan el libro completo de este dispositivo.

## Cambiar el esquema

Agrega un `this.version(n + 1)` en `ledgerDatabase.ts` (con `upgrade` si hay que
migrar datos). Nunca edites una versión ya publicada: los datos del usuario viven ahí.
