# Fase 2: libro de movimientos (datos reales, solo en el dispositivo)

**Estado:** hecha (2026-10-16), las 6 fases. Borrar al aprobar: las reglas que valen quedan en `src/features/ledger/README.md`.
**Base:** `FASE_02_FINANZAS.md` del starter original (ya no está en el repo).

## Decisiones tomadas

1. **Guardado solo en el dispositivo** (IndexedDB con Dexie, ya en la plantilla). Sin cuentas
   ni servidor. La sincronización podría agregarse después con `core/sync` (outbox).
2. **Reglas configurables**: los valores del documento son los valores por defecto.
3. **Sobres**: crear, editar y **archivar** (no se borran, para no perder historial). La
   carpeta 3D se adapta a cuántos sobres activos haya.

## 1. Conceptos

Se separa **dónde está el dinero** de **para qué está apartado**:

| Concepto | Qué es | Ejemplos |
|---|---|---|
| **Cuenta** | Dónde está físicamente el dinero (o la deuda) | Débito, Efectivo, Tarjeta de crédito |
| **Sobre** | Para qué está apartado | Disponible, Tarjeta, Ahorro, Semana, Fondo |
| **Movimiento** | Registro inmutable de algo que pasó | Ingreso, gasto, mover entre sobres, pago de tarjeta |

Los saldos **nunca se guardan**: se calculan sumando movimientos. Un movimiento no se
edita ni se borra: se **cancela** con un movimiento inverso que lo referencia.

## 2. Modelo de dinero (revisar)

Tipos de movimiento (montos enteros en centavos, siempre positivos):

| Tipo | Cuentas | Sobres |
|---|---|---|
| `income` (ingreso) | + cuenta (débito o efectivo) | + sobre (por defecto Disponible) |
| `expense` con débito/efectivo | − cuenta | − sobre del gasto |
| `expense` con crédito | + deuda de la tarjeta | − sobre del gasto · + sobre Tarjeta (el monto completo) |
| `assignment` (mover entre sobres) | — | − origen · + destino |
| `accountTransfer` (depositar/retirar) | − cuenta A · + cuenta B | — |
| `cardPayment` (pagar tarjeta) | − cuenta (débito/efectivo) · − deuda | − sobre Tarjeta |
| `reversal` (cancelar) | lo inverso del original | lo inverso del original |

**Por qué así (estilo "presupuesto con sobres"):**

- Una compra a crédito **es un gasto** del sobre que la pagó (Semana baja) y **crea deuda**.
  El monto se **reserva** completo en el sobre Tarjeta: no se pierde de vista que ya está
  comprometido.
- **Pagar la tarjeta no es un gasto** (no lo duplica): baja la deuda, baja el dinero real y
  consume la reserva del sobre Tarjeta.
- Si el sobre no tenía suficiente, queda **sobregirado** (negativo, se marca) y esa parte es
  **deuda sin respaldo**: la reserva de la tarjeta está "prestada" al sobre sobregirado.
  Cubrir el sobre (mover dinero a él) la resuelve con un solo movimiento. (Ajuste respecto
  a la primera versión, que reservaba solo lo que alcanzaba: el faltante aparecía dos veces.)
- Deuda sin respaldo = deuda − máx(0, reserva de tarjetas − total sobregirado).
- Apartar dinero en el sobre Tarjeta **no mueve dinero físico**: si la reserva está en
  efectivo y la tarjeta se paga desde débito, hace falta un `accountTransfer` (depósito).

**Invariante** (se prueba en cada paso de los tests): `Σ sobres = Σ cuentas de débito y efectivo`.

## 3. Reglas configurables (ajustes)

- Ingresos recurrentes: por defecto **nómina el viernes a débito** y **efectivo el lunes**.
  Sirven para recordar y proponer el registro (no se registran solos).
- Tarjetas de crédito: por defecto **una**, con **corte el día 15** y pago 20 días después.
  Los periodos usan **fechas reales**: el corte "31" en un mes de 30 días cae el 30; no se
  asume que un mes tenga 4 semanas.
- Semana de lunes a domingo; moneda MXN.

## 4. Arquitectura (capas de la plantilla)

Nuevo feature **`features/ledger`** (el organizador 3D lo consume):

```
domain/        tipos, aplicar movimientos → saldos, deuda sin respaldo, periodos de corte (puro)
errors/        SaldoInsuficiente, SobreArchivado, MovimientoYaCancelado… (extienden core/errors)
repositories/  Dexie: cuentas, sobres, movimientos, ajustes (privado del feature)
services/      reglas: validar, crear movimientos, cancelar, sembrar datos iniciales
actions/       thunks con createAsyncThunkWithErrorHandling ("ledger/…")
ledgerSlice.ts + selector.ts   estado y selectores memorizados (saldos derivados)
```

`organizer-3d` deja `useDemoLedger` y usa los selectores y thunks de `ledger`. La escena
no cambia de rol: recibe datos de solo lectura y nunca modifica montos.

## 5. Fases de implementación

1. **Dominio puro + tests**: tipos, cálculo de saldos, deuda sin respaldo, invariante,
   cancelaciones, periodos de corte, validaciones.
2. **Persistencia**: base Dexie versionada, repositorios, siembra inicial a partir del
   mock actual; tests con `fake-indexeddb`.
3. **Servicios + Redux**: thunks, slice, selectores; tests de servicios.
4. **Conectar el organizador**: saldos y documentos reales; "Mover dinero" = `assignment`;
   editar/crear/archivar sobres persistente; la carpeta 3D con N sobres.
5. **Registrar movimientos**: formularios de ingreso, gasto (con cuenta), pago de tarjeta,
   depósito/retiro; vista de cuentas con deuda y alerta de deuda sin respaldo; ajustes.
   ✅ Hecho: `RecordMovementDialog` (botón "Registrar" de la tarjeta del sobre) y
   `AccountsSheet` (botón "Cuentas" de la nav, con aviso). Sobregirado en rojo con
   indicador en la ficha; "Cubrir" abre Mover dinero con el monto que falta.
6. **Respaldo y corrección**: exportar/importar JSON, cancelar un movimiento.
   ✅ Hecho: en Cuentas → Ajustes → Respaldo (descargar, importar, restablecer ejemplo).
   Cancelar desde el documento abierto del sobre o desde Cuentas → Movimientos.

## Fuera de alcance

Servidor, cuentas de usuario, conexión bancaria, varias monedas, presupuestos por mes
estilo "rollover" (se puede agregar sobre este modelo).

## Criterios de aceptación

- [x] Los saldos de sobres y cuentas salen solo de los movimientos y cumplen el invariante.
- [x] Una compra a crédito no se cuenta dos veces al pagar la tarjeta.
- [x] Deuda sin respaldo correcta cuando un sobre no alcanza; el sobre sobregirado se marca.
- [x] Cancelar un movimiento deja los saldos como antes y no se puede cancelar dos veces.
- [x] Los datos sobreviven a recargar la página; la primera vez se siembran los de ejemplo.
- [x] Sobres archivados no aparecen en la carpeta pero su historial se conserva.
- [x] Periodos de corte con fechas reales (meses de 28–31 días, cambio de año).
- [x] `pnpm verify` y `pnpm build` pasan.
