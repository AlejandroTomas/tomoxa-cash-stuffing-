"use client";

import { useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Banknote, CalendarClock, CreditCard, Download, Eraser, Landmark, Plus, RotateCcw, Trash2, Undo2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/core/toast";
import { useAppDispatch, useAppSelector } from "@/hooks/useReduxHooks";
import { cn } from "@/lib/utils";
import { showDialog } from "@/utils/dialogService";
import { toLocalIsoDate } from "@/utils/localDate";
import { backupFileName } from "../domain/backup";
import { installmentDraft, paymentDueSoon, type CardSummary } from "../domain/cards";
import { splitParts } from "../domain/details";
import type { InstallmentPlan } from "../domain/installments";
import { formatMinor } from "../domain/money";
import type { Movement } from "../domain/types";
import { cancelMovement, exportLedger, importLedger, recordMovement, saveLedgerSettings, startLedger } from "../ledgerSlice";
import { selectAccounts, selectActiveEnvelopes, selectBalances, selectBudgets, selectCardSummaries, selectEnvelopes, selectLedgerHealth, selectLedgerSettings, selectMovements } from "../selector";
import { AccountsSettings } from "./AccountsSettings";
import { ReminderSettings } from "./PaymentReminders";
import { dueText, formatDay, MOVEMENT_LABELS, WEEKDAYS } from "./format";

interface AccountsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Abre el registro con "Pagar tarjeta" y esa tarjeta elegida. */
  onPayCard: (accountId: string) => void;
  /** Cubrir un sobre sobregirado o apartar su presupuesto (mover `amountMinor` hacia él; al apartar, desde Disponible si alcanza). */
  onCover: (envelopeId: string, amountMinor: number, preferAvailable?: boolean) => void;
  /** Cancela un movimiento (el organizador guarda antes lo que esté abierto). Sin él, se cancela directo. */
  onCancelMovement?: (movementId: string) => Promise<boolean>;
  /** Antes de reemplazar todo el libro (importar o restablecer). */
  onBeforeReplace?: () => Promise<void>;
}

const row = "flex items-center gap-3 py-2.5";
const panel = "divide-y divide-border/70 rounded-2xl border border-border/70 bg-card/70 px-4 text-sm";

/** Cuentas (dónde está el dinero), deuda de la tarjeta, avisos y ajustes. */
export function AccountsSheet({ open, onOpenChange, onPayCard, onCover, onCancelMovement, onBeforeReplace }: AccountsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Landmark className="size-5" aria-hidden="true" /> Cuentas
          </SheetTitle>
          <SheetDescription>Dónde está tu dinero y cuánto debes.</SheetDescription>
        </SheetHeader>
        {open && (
          <Tabs defaultValue="summary" className="px-4 pb-6">
            <TabsList className="w-full">
              <TabsTrigger value="summary">Resumen</TabsTrigger>
              <TabsTrigger value="movements">Movimientos</TabsTrigger>
              <TabsTrigger value="settings">Ajustes</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="mt-2">
              <Summary onPayCard={onPayCard} onCover={onCover} />
            </TabsContent>
            <TabsContent value="movements" className="mt-2">
              <RecentMovements onCancelMovement={onCancelMovement} />
            </TabsContent>
            <TabsContent value="settings" className="mt-2 flex flex-col gap-6">
              <AccountsSettings />
              <ReminderSettings />
              <IncomeSettings />
              <BackupSection onBeforeReplace={onBeforeReplace} />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

function useToday() {
  const [today] = useState(() => toLocalIsoDate(new Date()));
  return today;
}

function Summary({ onPayCard, onCover }: Pick<AccountsSheetProps, "onPayCard" | "onCover">) {
  const accounts = useAppSelector(selectAccounts);
  const balances = useAppSelector(selectBalances);
  const today = useToday();
  const health = useAppSelector((state) => selectLedgerHealth(state, today));
  const envelopes = useAppSelector(selectActiveEnvelopes);
  const cards = useAppSelector((state) => selectCardSummaries(state, today));
  const money = accounts.filter((account) => !account.archived && account.kind !== "credit").sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "debit" ? -1 : 1));
  const overdrawn = envelopes.filter((envelope) => (balances.envelopes[envelope.id] ?? 0) < 0);
  const due = cards.filter((card) => paymentDueSoon(card.statement));
  const installmentsDue = cards.flatMap((card) => card.plans).filter((plan) => plan.nextDue);
  const budgets = useAppSelector((state) => selectBudgets(state, today));
  const budgeted = envelopes.filter((envelope) => budgets[envelope.id]);

  return (
    <div className="flex flex-col gap-5">
      {(due.length > 0 || installmentsDue.length > 0 || health.unbackedDebt > 0 || overdrawn.length > 0) && (
        <div role="status" className="flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p>
            {due.map((card) => (
              <span key={card.account.id}>
                Paga {formatMinor(card.statement.amount)} de {card.account.name} {dueText(card.statement.due, card.statement.daysLeft)}.{" "}
              </span>
            ))}
            {installmentsDue.map((plan) => (
              <span key={plan.purchase.id}>
                Aparta la mensualidad {plan.next?.number} de {plan.months} de {plan.purchase.concept} ({formatMinor(plan.next?.amountMinor ?? 0)}, {plan.account.name}).{" "}
              </span>
            ))}
            {health.unbackedDebt > 0 && <>Tienes {formatMinor(health.unbackedDebt)} de deuda sin dinero apartado. </>}
            {overdrawn.length > 0 && <>{overdrawn.length === 1 ? "Un sobre está sobregirado" : `${overdrawn.length} sobres están sobregirados`}: cúbrelos con dinero de otro sobre.</>}
          </p>
        </div>
      )}

      <section aria-labelledby="accounts-money" className="space-y-2">
        <h3 id="accounts-money" className="text-sm font-medium text-muted-foreground">
          Dinero
        </h3>
        <dl className={panel}>
          {money.map((account) => (
            <div key={account.id} className={row}>
              {account.kind === "cash" ? <Banknote className="size-4.5 text-muted-foreground" aria-hidden="true" /> : <Landmark className="size-4.5 text-muted-foreground" aria-hidden="true" />}
              <dt className="flex-1 text-foreground/80">{account.name}</dt>
              <dd className="font-medium text-foreground tabular-nums">{formatMinor(balances.accounts[account.id] ?? 0)}</dd>
            </div>
          ))}
          <div className={row}>
            <dt className="flex-1 font-medium text-foreground">Total</dt>
            <dd className="font-semibold text-foreground tabular-nums">{formatMinor(health.cash)}</dd>
          </div>
        </dl>
      </section>

      {cards.map((card) => (
        <CardPanel key={card.account.id} card={card} onPay={onPayCard} />
      ))}

      {budgeted.length > 0 && (
        <section aria-labelledby="accounts-budgets" className="space-y-2">
          <h3 id="accounts-budgets" className="text-sm font-medium text-muted-foreground">
            Presupuestos
          </h3>
          <ul className={panel}>
            {budgeted.map((envelope) => {
              const budget = budgets[envelope.id];
              const over = budget.remainingMinor < 0;
              return (
                <li key={envelope.id} className="flex items-center gap-3 py-2.5">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: envelope.color }} />
                  <span className="flex-1">
                    <span className="text-foreground/80">{envelope.name}</span>
                    <span className={cn("block text-xs tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
                      {formatMinor(budget.spentMinor)} de {formatMinor(budget.amountMinor)} {budget.period === "week" ? "esta semana" : "este mes"}
                      {over && ` · te pasaste por ${formatMinor(-budget.remainingMinor)}`}
                    </span>
                  </span>
                  {budget.toFundMinor > 0 && (
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => onCover(envelope.id, budget.toFundMinor, true)}>
                      Apartar {formatMinor(budget.toFundMinor)}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {overdrawn.length > 0 && (
        <section aria-labelledby="accounts-overdrawn" className="space-y-2">
          <h3 id="accounts-overdrawn" className="text-sm font-medium text-muted-foreground">
            Sobres sobregirados
          </h3>
          <ul className={panel}>
            {overdrawn.map((envelope) => {
              const balance = balances.envelopes[envelope.id] ?? 0;
              return (
                <li key={envelope.id} className={row}>
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: envelope.color }} />
                  <span className="flex-1 text-foreground/80">{envelope.name}</span>
                  <span className="font-medium text-destructive tabular-nums">{formatMinor(balance)}</span>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => onCover(envelope.id, -balance)}>
                    Cubrir
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function CardPanel({ card, onPay }: { card: CardSummary; onPay: (accountId: string) => void }) {
  const { statement } = card;
  const plans = card.plans.filter((plan) => plan.next);
  const urgent = paymentDueSoon(statement);
  return (
    <section aria-labelledby={`card-${card.account.id}`} className="space-y-2">
      <h3 id={`card-${card.account.id}`} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <CreditCard className="size-4" aria-hidden="true" /> {card.account.name}
      </h3>
      <dl className={panel}>
        <div className="flex items-start gap-3 py-2.5">
          <dt className="flex-1 text-foreground/80">
            Pago para no generar intereses
            <span className={cn("block text-xs", urgent ? "font-medium text-warning" : "text-muted-foreground")}>
              {statement.amount > 0 ? `Corte del ${formatDay(statement.cutoff)}, ${dueText(statement.due, statement.daysLeft)}` : `Corte del ${formatDay(statement.cutoff)}: al corriente`}
            </span>
          </dt>
          <dd className="font-semibold text-foreground tabular-nums">{formatMinor(statement.amount)}</dd>
        </div>
        <div className={row}>
          <dt className="flex-1 text-foreground/80">Deuda total</dt>
          <dd className="font-medium text-foreground tabular-nums">{formatMinor(card.debt)}</dd>
        </div>
        <div className={row}>
          <dt className="flex-1 text-foreground/80">Apartado para pagarla</dt>
          <dd className={cn("font-medium tabular-nums", card.reserve < 0 ? "text-destructive" : "text-foreground")}>{formatMinor(card.reserve)}</dd>
        </div>
        <div className={row}>
          <dt className="flex-1 text-foreground/80">Sin respaldo</dt>
          <dd className="flex items-center gap-2 font-medium tabular-nums">
            {card.unbacked > 0 ? (
              <>
                <Badge variant="destructive">Revisa</Badge>
                <span className="text-destructive">{formatMinor(card.unbacked)}</span>
              </>
            ) : (
              <span className="text-foreground">{formatMinor(0)}</span>
            )}
          </dd>
        </div>
        <div className={row}>
          <dt className="flex-1 text-foreground/80">Próximo corte</dt>
          <dd className="text-foreground tabular-nums">{formatDay(card.nextCutoff)}</dd>
        </div>
      </dl>
      {plans.length > 0 && <InstallmentList plans={plans} />}
      <Button className="w-full rounded-xl" disabled={!card.debt} onClick={() => onPay(card.account.id)}>
        <CreditCard /> Pagar {card.account.name}
      </Button>
    </section>
  );
}

/** Compras a meses de una tarjeta: avance y botón para apartar la mensualidad que toca. */
function InstallmentList({ plans }: { plans: readonly InstallmentPlan[] }) {
  const dispatch = useAppDispatch();
  const today = useToday();
  const [saving, setSaving] = useState<string | null>(null);

  const setAside = async (plan: InstallmentPlan) => {
    const draft = installmentDraft(plan, today);
    if (!draft) return;
    setSaving(plan.purchase.id);
    try {
      await dispatch(recordMovement(draft)).unwrap();
      toast.success(`Apartada la mensualidad ${plan.next?.number} de ${plan.months}: ${plan.purchase.concept}.`);
    } catch {
      // El middleware ya mostró el error (p. ej., no alcanza en el sobre).
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CalendarClock className="size-3.5" aria-hidden="true" /> Meses sin intereses
      </p>
      <ul className={panel}>
        {plans.map((plan) => (
          <li key={plan.purchase.id} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-foreground/80">{plan.purchase.concept}</span>
              <span className={cn("block text-xs tabular-nums", plan.nextDue ? "font-medium text-warning" : "text-muted-foreground")}>
                {plan.setAside.length} de {plan.months} apartadas · falta {formatMinor(plan.remainingMinor)}
                {plan.next && ` · la ${plan.next.number}.ª se cobra el ${formatDay(plan.next.cutoff)}`}
              </span>
            </span>
            {plan.next && (
              <Button size="sm" variant={plan.nextDue ? "default" : "outline"} className="shrink-0 rounded-full" disabled={saving !== null} onClick={() => void setAside(plan)}>
                Apartar {formatMinor(plan.next.amountMinor)}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const incomeFormSchema = z.object({
  incomes: z.array(
    z.object({
      id: z.string(),
      label: z.string().trim().min(1, "Ponle un nombre.").max(40, "Máximo 40 caracteres."),
      weekday: z.string(),
      accountId: z.string().min(1, "Elige una cuenta."),
    }),
  ),
});
type IncomeForm = z.infer<typeof incomeFormSchema>;

function IncomeSettings() {
  const dispatch = useAppDispatch();
  const settings = useAppSelector(selectLedgerSettings);
  const accounts = useAppSelector(selectAccounts);
  const money = useMemo(() => accounts.filter((account) => !account.archived && account.kind !== "credit"), [accounts]);
  const [saving, setSaving] = useState(false);
  const toForm = (incomes: typeof settings.recurringIncome): IncomeForm => ({ incomes: incomes.map((income) => ({ ...income, weekday: String(income.weekday) })) });
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<IncomeForm>({ resolver: zodResolver(incomeFormSchema), defaultValues: toForm(settings.recurringIncome) });
  const { fields, append, remove } = useFieldArray({ control, name: "incomes" });

  const onSubmit = async (form: IncomeForm) => {
    setSaving(true);
    try {
      const saved = await dispatch(
        saveLedgerSettings({ ...settings, recurringIncome: form.incomes.map((income) => ({ ...income, weekday: Number(income.weekday) })) }),
      ).unwrap();
      reset(toForm(saved.recurringIncome));
      toast.success("Ingresos guardados.");
    } catch {
      // El middleware ya mostró el error.
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">Ingresos recurrentes</h3>
        <p className="text-xs text-muted-foreground">Se proponen al registrar un ingreso ese día; no se registran solos.</p>
      </div>
      <ul className="space-y-3">
        {fields.map((field, index) => {
          const error = errors.incomes?.[index];
          return (
            <li key={field.id} className="space-y-2 rounded-2xl border border-border/70 bg-card/70 p-3">
              <div className="flex items-center gap-2">
                <Label htmlFor={`income-${index}-label`} className="sr-only">
                  Nombre
                </Label>
                <Input id={`income-${index}-label`} placeholder="Nómina" aria-invalid={Boolean(error?.label)} className="rounded-xl" {...register(`incomes.${index}.label`)} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ingreso ${index + 1}`} onClick={() => remove(index)} className="shrink-0 rounded-full">
                  <Trash2 />
                </Button>
              </div>
              {error?.label && <p className="text-xs text-destructive">{error.label.message}</p>}
              <div className="grid grid-cols-2 gap-2">
                <Controller
                  control={control}
                  name={`incomes.${index}.weekday`}
                  render={({ field: select }) => (
                    <Select value={select.value} onValueChange={select.onChange}>
                      <SelectTrigger aria-label="Día" className="w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((day, value) => (
                          <SelectItem key={day} value={String(value)}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Controller
                  control={control}
                  name={`incomes.${index}.accountId`}
                  render={({ field: select }) => (
                    <Select value={select.value} onValueChange={select.onChange}>
                      <SelectTrigger aria-label="Cuenta" aria-invalid={Boolean(error?.accountId)} className="w-full rounded-xl">
                        <SelectValue placeholder="Cuenta" />
                      </SelectTrigger>
                      <SelectContent>
                        {money.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => append({ id: crypto.randomUUID(), label: "", weekday: "5", accountId: money[0]?.id ?? "" })}>
          <Plus /> Agregar
        </Button>
        <Button type="submit" size="sm" variant="outline" className="ml-auto rounded-full" disabled={!isDirty || saving}>
          Guardar
        </Button>
      </div>
    </form>
  );
}

const RECENT_LIMIT = 40;

/** Últimos movimientos vigentes (sin cancelados ni cancelaciones), con su botón para cancelar. */
function RecentMovements({ onCancelMovement }: Pick<AccountsSheetProps, "onCancelMovement">) {
  const dispatch = useAppDispatch();
  const movements = useAppSelector(selectMovements);
  const balances = useAppSelector(selectBalances);
  const accounts = useAppSelector(selectAccounts);
  const envelopes = useAppSelector(selectEnvelopes);
  const today = useToday();
  const recent = useMemo(
    () =>
      movements
        .filter((movement) => movement.kind !== "reversal" && !balances.reversed[movement.id])
        // Un pago dividido se muestra una vez (con su primera parte).
        .filter((movement) => !movement.splitId || splitParts(movement, movements)[0].id === movement.id)
        .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
        .slice(0, RECENT_LIMIT),
    [movements, balances.reversed],
  );
  const nameOf = (id?: string) => accounts.find((account) => account.id === id)?.name ?? envelopes.find((envelope) => envelope.id === id)?.name ?? "";
  const route = (movement: Movement) => {
    switch (movement.kind) {
      case "income":
        return `${nameOf(movement.accountId)} → ${nameOf(movement.envelopeId)}`;
      case "expense": {
        const paidWith = splitParts(movement, movements).map((part) => nameOf(part.accountId)).join(" + ");
        return `${nameOf(movement.envelopeId)} · ${paidWith}${movement.installments ? ` · ${movement.installments} MSI` : ""}`;
      }
      default:
        return `${nameOf(movement.accountId ?? movement.envelopeId)} → ${nameOf(movement.toAccountId ?? movement.toEnvelopeId)}`;
    }
  };

  const amountOf = (movement: Movement) => splitParts(movement, movements).reduce((sum, part) => sum + part.amountMinor, 0);

  const confirmCancel = (movement: Movement) =>
    showDialog({
      type: "question",
      title: "¿Cancelar este movimiento?",
      message: `${movement.concept} (${formatMinor(amountOf(movement))})${movement.splitId ? ", con todas sus formas de pago" : ""}. Se registra una cancelación con fecha de hoy y los saldos vuelven a como estaban; el original queda en el historial.`,
      confirmText: "Cancelar movimiento",
      cancelText: "No",
      onConfirm: () => {
        const done = onCancelMovement
          ? onCancelMovement(movement.id)
          : dispatch(cancelMovement({ movementId: movement.id, date: today }))
              .unwrap()
              .then(() => true)
              .catch(() => false);
        void done.then((ok) => ok && toast.success(`Cancelado: ${movement.concept}.`));
      },
    });

  if (!recent.length) return <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay movimientos.</p>;
  return (
    <ul aria-label="Movimientos recientes" className={panel}>
      {recent.map((movement) => (
        <li key={movement.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{movement.concept}</p>
            <p className="truncate text-xs text-muted-foreground">
              {MOVEMENT_LABELS[movement.kind]} · {formatDay(movement.date)} · {route(movement)}
            </p>
          </div>
          <span className="shrink-0 font-medium text-foreground tabular-nums">{formatMinor(amountOf(movement))}</span>
          <Button variant="ghost" size="icon-sm" aria-label={`Cancelar ${movement.concept}`} onClick={() => confirmCancel(movement)} className="shrink-0 rounded-full text-muted-foreground hover:text-destructive">
            <Undo2 />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Descargar el libro, reemplazarlo con un respaldo, empezar de cero o volver a los datos de ejemplo. */
function BackupSection({ onBeforeReplace }: Pick<AccountsSheetProps, "onBeforeReplace">) {
  const dispatch = useAppDispatch();
  const fileRef = useRef<HTMLInputElement>(null);
  const today = useToday();

  const download = async () => {
    try {
      const backup = await dispatch(exportLedger()).unwrap();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = backupFileName(today);
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Respaldo descargado: ${backup.movements.length} movimientos.`);
    } catch {
      // El middleware ya mostró el error.
    }
  };

  const replaceWith = (title: string, message: string, confirmText: string, task: () => Promise<unknown>, done: string) =>
    showDialog({
      type: "warning",
      title,
      message,
      confirmText,
      cancelText: "Cancelar",
      onConfirm: () => {
        void (async () => {
          await onBeforeReplace?.();
          try {
            await task();
            toast.success(done);
          } catch {
            // El middleware ya mostró el error.
          }
        })();
      },
    });

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const text = await file.text();
    replaceWith(
      "¿Reemplazar todo con este respaldo?",
      `Se cambiarán tus sobres, cuentas y movimientos por los de "${file.name}". Si quieres conservar lo actual, descarga antes un respaldo.`,
      "Reemplazar",
      () => dispatch(importLedger(text)).unwrap(),
      "Respaldo importado.",
    );
  };

  return (
    <section aria-labelledby="backup-title" className="space-y-3">
      <div>
        <h3 id="backup-title" className="text-sm font-medium text-muted-foreground">
          Respaldo
        </h3>
        <p className="text-xs text-muted-foreground">Tus datos solo viven en este dispositivo. Descarga un respaldo para no perderlos o pasarlos a otro.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => void download()}>
          <Download /> Descargar
        </Button>
        <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()}>
          <Upload /> Importar
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => void onFile(event.target.files?.[0])} />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() =>
            replaceWith(
              "¿Empezar de cero?",
              "Se borran tus sobres, movimientos e ingresos recurrentes de este dispositivo. Solo queda Disponible en $0; las cuentas quedan en $0. No se puede deshacer (salvo con un respaldo).",
              "Empezar de cero",
              () => dispatch(startLedger("empty")).unwrap(),
              "Empezaste de cero. Registra tu primer ingreso en Disponible.",
            )
          }
        >
          <Eraser /> Empezar de cero
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() =>
            replaceWith(
              "¿Restablecer los datos de ejemplo?",
              "Se borran tus sobres, cuentas y movimientos de este dispositivo y vuelven los de ejemplo. No se puede deshacer (salvo con un respaldo).",
              "Restablecer",
              () => dispatch(startLedger("sample")).unwrap(),
              "Volviste a los datos de ejemplo.",
            )
          }
        >
          <RotateCcw /> Restablecer ejemplo
        </Button>
      </div>
    </section>
  );
}
