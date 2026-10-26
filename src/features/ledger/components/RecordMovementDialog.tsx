"use client";

import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Plus, ReceiptText, Split, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Credenza, CredenzaContent, CredenzaDescription, CredenzaFooter, CredenzaHeader, CredenzaTitle } from "@/components/ui/responsive-dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/core/toast";
import { useAppDispatch, useAppSelector } from "@/hooks/useReduxHooks";
import { cn } from "@/lib/utils";
import { parseLocalDate, toLocalIsoDate } from "@/utils/localDate";
import { filteredField, sanitizeAmountText } from "@/utils/numericInput";
import { ACCOUNT_KIND_LABELS } from "../domain/accounts";
import type { Balances } from "../domain/balances";
import { incomesDueOn } from "../domain/cards";
import { INSTALLMENT_OPTIONS, installmentAmount, installmentCutoffs } from "../domain/installments";
import { UNASSIGNED_ENVELOPE_ID } from "../domain/envelopes";
import { formatMinor, minorToInput, parseAmountMinor } from "../domain/money";
import { draftFromForm, formFieldOf, movementFormSchema, RECORD_KINDS, type MovementForm, type RecordKind } from "../domain/movementForm";
import type { Account, Movement } from "../domain/types";
import { checkMovements } from "../domain/validation";
import { recordMovement, recordSplitExpense } from "../ledgerSlice";
import { selectAccounts, selectActiveEnvelopes, selectBalances, selectCardSummaries, selectEnvelopes, selectLedgerSettings, selectMovements } from "../selector";
import { dueText, formatDay } from "./format";

export interface RecordDefaults {
  kind?: RecordKind;
  envelopeId?: string;
  /** Tarjeta a pagar (con "Pagar tarjeta"). */
  toAccountId?: string;
}

interface RecordMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: RecordDefaults;
  /** Después de guardar (el diálogo ya se cerró). */
  onRecorded?: (movement: Movement) => void;
}

/** Registrar un gasto, ingreso, pago de tarjeta o depósito/retiro. Se guarda en el dispositivo. */
export function RecordMovementDialog({ open, onOpenChange, ...props }: RecordMovementDialogProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent className="sm:max-w-md lg:right-[3%] lg:left-auto lg:translate-x-0">
        {/* Se vuelve a montar al abrir: arranca limpio con los valores por defecto. */}
        {open && <RecordMovementForm {...props} onClose={() => onOpenChange(false)} />}
      </CredenzaContent>
    </Credenza>
  );
}

const KIND_ORDER: Record<Account["kind"], number> = { debit: 0, cash: 1, credit: 2 };

const chip = cn(
  "h-8 rounded-full border border-border px-3 text-xs font-medium text-foreground/80 outline-none transition-colors",
  "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
);

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

/** Cuentas agrupadas por tipo: débito y efectivo con su saldo, tarjetas con lo que se debe. */
function AccountSelect({ id, value, onChange, accounts, invalid, balances, label }: { id: string; value: string; onChange: (value: string) => void; accounts: readonly Account[]; invalid: boolean; balances: Balances; label?: string }) {
  const groups = (["debit", "cash", "credit"] as const).map((kind) => ({ kind, items: accounts.filter((account) => account.kind === kind) })).filter((group) => group.items.length);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid} aria-label={label} className="h-11 w-full rounded-xl">
        <SelectValue placeholder="Elige una cuenta" />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.kind}>
            {groups.length > 1 && <SelectLabel>{group.kind === "credit" ? "Tarjetas de crédito" : ACCOUNT_KIND_LABELS[group.kind]}</SelectLabel>}
            {group.items.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
                {/* El saldo se ve en la lista; en el campo cerrado solo el nombre (si no, se corta). */}
                <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums in-data-[slot=select-value]:hidden">
                  {account.kind === "credit" ? `debes ${formatMinor(balances.debt[account.id] ?? 0)}` : formatMinor(balances.accounts[account.id] ?? 0)}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function RecordMovementForm({ defaults, onRecorded, onClose }: Omit<RecordMovementDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const accounts = useAppSelector(selectAccounts);
  const allEnvelopes = useAppSelector(selectEnvelopes);
  const envelopes = useAppSelector(selectActiveEnvelopes);
  const movements = useAppSelector(selectMovements);
  const balances = useAppSelector(selectBalances);
  const settings = useAppSelector(selectLedgerSettings);
  const [today] = useState(() => toLocalIsoDate(new Date()));
  const cards = useAppSelector((state) => selectCardSummaries(state, today));
  const [saving, setSaving] = useState(false);

  // Débito primero, luego efectivo y al final las tarjetas.
  const active = useMemo(() => accounts.filter((account) => !account.archived).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]), [accounts]);
  const money = useMemo(() => active.filter((account) => account.kind !== "credit"), [active]);
  const credit = useMemo(() => active.filter((account) => account.kind === "credit"), [active]);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<MovementForm>({
    resolver: zodResolver(movementFormSchema),
    defaultValues: {
      kind: defaults?.kind ?? "expense",
      amount: "",
      concept: "",
      date: today,
      accountId: money[0]?.id ?? "",
      toAccountId: defaults?.toAccountId ?? credit[0]?.id ?? "",
      envelopeId: defaults?.envelopeId ?? UNASSIGNED_ENVELOPE_ID,
      installments: "1",
      splits: [],
    },
  });
  const [kind, amount, date, accountId, toAccountId, envelopeId, installments, splits] = useWatch({
    control,
    name: ["kind", "amount", "date", "accountId", "toAccountId", "envelopeId", "installments", "splits"],
  });
  const splitFields = useFieldArray({ control, name: "splits" });
  const isSplit = kind === "expense" && splits.length > 1;

  /** Al cambiar de tipo, las cuentas y el sobre se acomodan a lo que ese tipo admite. */
  const changeKind = (next: RecordKind) => {
    setValue("kind", next);
    if (next !== "expense") {
      splitFields.replace([]);
      setValue("installments", "1");
    }
    const isMoney = (id: string) => money.some((account) => account.id === id);
    if (next !== "expense" && !isMoney(accountId)) setValue("accountId", money[0]?.id ?? "");
    if (next === "cardPayment" && !credit.some((account) => account.id === toAccountId)) setValue("toAccountId", credit[0]?.id ?? "");
    if (next === "accountTransfer") setValue("toAccountId", money.find((account) => account.id !== (isMoney(accountId) ? accountId : money[0]?.id))?.id ?? "");
    if (next === "income" && !defaults?.envelopeId) setValue("envelopeId", UNASSIGNED_ENVELOPE_ID);
  };

  const amountMinor = parseAmountMinor(amount) ?? 0;
  const payingCard = kind === "expense" && !isSplit ? cards.find((summary) => summary.account.id === accountId) : undefined;
  const months = payingCard ? Number(installments) : 1;
  const envelopeBalance = balances.envelopes[envelopeId] ?? 0;
  const overdraft = kind === "expense" && months === 1 && amountMinor > 0 && envelopeBalance - amountMinor < 0 ? amountMinor - Math.max(0, envelopeBalance) : 0;
  const splitSum = splits.reduce((sum, split) => sum + (parseAmountMinor(split.amount) ?? 0), 0);

  /** Dividir: la cuenta elegida con todo el monto y una segunda forma de pago para repartir. */
  const startSplit = () => {
    const other = active.find((account) => account.id !== accountId);
    setValue("installments", "1");
    splitFields.replace([
      { accountId, amount },
      { accountId: other?.id ?? "", amount: "" },
    ]);
  };
  const addSplit = () => {
    const remaining = amountMinor - splitSum;
    splitFields.append({ accountId: active.find((account) => !splits.some((split) => split.accountId === account.id))?.id ?? "", amount: remaining > 0 ? minorToInput(remaining) : "" });
  };
  const card = cards.find((summary) => summary.account.id === toAccountId);
  const weekday = useMemo(() => {
    try {
      return parseLocalDate(date).getDay();
    } catch {
      return -1;
    }
  }, [date]);
  const dueIncomes = kind === "income" ? incomesDueOn(settings, weekday) : [];

  const onSubmit = async (form: MovementForm) => {
    const result = draftFromForm(form, accounts);
    if ("field" in result) {
      setError(result.field, { message: result.message });
      return;
    }
    const { drafts } = result;
    const problem = checkMovements(drafts, { accounts, envelopes: allEnvelopes, movements });
    if (problem) {
      const field = formFieldOf(problem.issue);
      const splitField = drafts.length > 1 && (field === "amount" || field === "accountId") ? (`splits.${problem.index}.${field}` as const) : field;
      setError(splitField, { message: problem.issue.message });
      return;
    }
    setSaving(true);
    try {
      const saved = drafts.length > 1 ? await dispatch(recordSplitExpense(drafts)).unwrap() : [await dispatch(recordMovement(drafts[0])).unwrap()];
      const [first] = saved;
      const total = saved.reduce((sum, movement) => sum + movement.amountMinor, 0);
      const plan = first.installments ? `, ${first.installments} mensualidades de ${formatMinor(installmentAmount(first.amountMinor, first.installments, 1))}` : "";
      const parts = saved.length > 1 ? ` en ${saved.length} formas de pago` : "";
      toast.success(`Registrado: ${first.concept}, ${formatMinor(total)}${parts}${plan}.`);
      onClose();
      onRecorded?.(first);
    } catch {
      // El error del thunk ya se mostró (middleware de errores).
      setSaving(false);
    }
  };

  const envelopeField = (label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor="record-envelope">{label}</Label>
      <Controller
        control={control}
        name="envelopeId"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id="record-envelope" aria-invalid={Boolean(errors.envelopeId)} className="h-11 w-full rounded-xl">
              <SelectValue placeholder="Elige un sobre" />
            </SelectTrigger>
            <SelectContent>
              {envelopes.map((envelope) => {
                const balance = balances.envelopes[envelope.id] ?? 0;
                return (
                  <SelectItem key={envelope.id} value={envelope.id}>
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: envelope.color }} />
                    {envelope.name}
                    <span className={cn("ml-auto pl-3 text-xs tabular-nums in-data-[slot=select-value]:hidden", balance < 0 ? "text-destructive" : "text-muted-foreground")}>{formatMinor(balance)}</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      />
      <FieldError id="record-envelope-error" message={errors.envelopeId?.message} />
    </div>
  );

  const accountField = (name: "accountId" | "toAccountId", label: string, options: readonly Account[]) => (
    <div className="space-y-1.5">
      <Label htmlFor={`record-${name}`}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <AccountSelect id={`record-${name}`} value={field.value} onChange={field.onChange} accounts={options} invalid={Boolean(errors[name])} balances={balances} />
        )}
      />
      <FieldError id={`record-${name}-error`} message={errors[name]?.message} />
    </div>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <CredenzaHeader>
        <CredenzaTitle className="flex items-center gap-2">
          <ReceiptText className="size-5" aria-hidden="true" /> Registrar movimiento
        </CredenzaTitle>
        <CredenzaDescription>Se guarda en este dispositivo.</CredenzaDescription>
      </CredenzaHeader>

      <Tabs value={kind} onValueChange={(value) => changeKind(value as RecordKind)}>
        <TabsList aria-label="Tipo de movimiento" className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl sm:grid-cols-4">
          {RECORD_KINDS.map((option) => (
            <TabsTrigger key={option.kind} value={option.kind} className="rounded-lg px-2 py-1.5 text-xs">
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {dueIncomes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Toca hoy:</span>
          {dueIncomes.map((income) => (
            <button
              key={income.id}
              type="button"
              className={chip}
              onClick={() => {
                setValue("concept", income.label);
                setValue("accountId", income.accountId);
              }}
            >
              {income.label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="record-amount">Monto</Label>
          {kind === "cardPayment" && card && <span className="text-xs text-muted-foreground tabular-nums">Debes {formatMinor(card.debt)}</span>}
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
            $
          </span>
          <Input
            id="record-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? "record-amount-error" : overdraft ? "record-overdraft" : undefined}
            className="h-12 rounded-xl pl-7 text-lg tabular-nums"
            {...filteredField(register("amount"), sanitizeAmountText)}
          />
        </div>
        {kind === "cardPayment" && card && (
          <div className="flex flex-wrap items-center gap-1.5">
            {card.statement.amount > 0 && card.statement.amount < card.debt && (
              <button type="button" className={chip} onClick={() => setValue("amount", minorToInput(card.statement.amount), { shouldValidate: true })}>
                Pago del corte · {formatMinor(card.statement.amount)}
              </button>
            )}
            <button type="button" className={chip} disabled={!card.debt} onClick={() => setValue("amount", minorToInput(card.debt), { shouldValidate: true })}>
              Toda la deuda
            </button>
            <span className="text-xs text-muted-foreground">
              {card.statement.amount > 0 ? `Corte del ${formatDay(card.statement.cutoff)}, ${dueText(card.statement.due, card.statement.daysLeft)}` : `Corte del ${formatDay(card.statement.cutoff)} pagado`}
            </span>
          </div>
        )}
        <FieldError id="record-amount-error" message={errors.amount?.message} />
        {overdraft > 0 && !errors.amount && (
          <p id="record-overdraft" className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
            El sobre quedará sobregirado por {formatMinor(overdraft)}.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="record-concept">Concepto{kind === "cardPayment" || kind === "accountTransfer" ? " (opcional)" : ""}</Label>
        <Input
          id="record-concept"
          autoComplete="off"
          placeholder={kind === "income" ? "Nómina" : kind === "expense" ? "Súper" : ""}
          aria-invalid={Boolean(errors.concept)}
          className="h-11 rounded-xl"
          {...register("concept")}
        />
        <FieldError id="record-concept-error" message={errors.concept?.message} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {kind === "expense" && (
          <>
            {envelopeField("Sale del sobre")}
            {!isSplit && accountField("accountId", "Pagaste con", active)}
          </>
        )}
        {kind === "income" && (
          <>
            {accountField("accountId", "Entra a", money)}
            {envelopeField("Va al sobre")}
          </>
        )}
        {kind === "cardPayment" && (
          <>
            {accountField("accountId", "Pagas desde", money)}
            {accountField("toAccountId", "Tarjeta", credit)}
          </>
        )}
        {kind === "accountTransfer" && (
          <>
            {accountField("accountId", "Sale de", money)}
            {accountField("toAccountId", "Entra a", money)}
          </>
        )}
      </div>

      {kind === "expense" && isSplit && (
        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-1.5 text-sm font-medium">Formas de pago</legend>
          {splitFields.fields.map((item, index) => (
            <div key={item.id} className="space-y-1">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Controller
                    control={control}
                    name={`splits.${index}.accountId`}
                    render={({ field }) => (
                      <AccountSelect id={`record-split-${index}`} label={`Forma de pago ${index + 1}`} value={field.value} onChange={field.onChange} accounts={active} invalid={Boolean(errors.splits?.[index]?.accountId)} balances={balances} />
                    )}
                  />
                </div>
                <div className="relative w-32 shrink-0">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
                    $
                  </span>
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    aria-label={`Monto de la forma de pago ${index + 1}`}
                    aria-invalid={Boolean(errors.splits?.[index]?.amount)}
                    className="h-11 rounded-xl pl-6 tabular-nums"
                    {...filteredField(register(`splits.${index}.amount`), sanitizeAmountText)}
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Quitar forma de pago ${index + 1}`} className="mt-1 shrink-0 rounded-full" onClick={() => (splits.length > 2 ? splitFields.remove(index) : splitFields.replace([]))}>
                  <X />
                </Button>
              </div>
              <FieldError id={`record-split-${index}-error`} message={errors.splits?.[index]?.accountId?.message ?? errors.splits?.[index]?.amount?.message} />
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className={chip} disabled={splits.length >= active.length} onClick={addSplit}>
              <Plus className="mr-1 inline size-3.5" aria-hidden="true" />
              Otra forma de pago
            </button>
            <span className={cn("text-xs tabular-nums", splitSum === amountMinor ? "text-muted-foreground" : "font-medium text-destructive")}>
              Suman {formatMinor(splitSum)} de {formatMinor(amountMinor)}
            </span>
          </div>
        </fieldset>
      )}

      {kind === "expense" && !isSplit && active.length > 1 && (
        <button type="button" className={cn(chip, "self-start")} onClick={startSplit}>
          <Split className="mr-1 inline size-3.5" aria-hidden="true" />
          Pagar con varias formas (efectivo + tarjeta…)
        </button>
      )}

      {payingCard && (
        <div className="space-y-1.5">
          <Label htmlFor="record-installments">¿Cómo lo pagas?</Label>
          <Controller
            control={control}
            name="installments"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="record-installments" className="h-11 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">De contado</SelectItem>
                  {INSTALLMENT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} meses sin intereses
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {months > 1 && (
            <p className="text-xs text-muted-foreground">
              {amountMinor > 0 && <span className="tabular-nums">{months} mensualidades de {formatMinor(installmentAmount(amountMinor, months, 1))}. </span>}
              La primera se cobra en el corte del {formatDay(installmentCutoffs(date || today, payingCard.account.card.cutoffDay, 1)[0])}. El sobre no se descuenta hoy: cada mes apartas la mensualidad (te lo recordamos en Cuentas).
            </p>
          )}
          <FieldError id="record-installments-error" message={errors.installments?.message} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="record-date">Fecha</Label>
        <Input id="record-date" type="date" max={today} aria-invalid={Boolean(errors.date)} className="h-11 rounded-xl" {...register("date")} />
        <FieldError id="record-date-error" message={errors.date?.message} />
      </div>

      <FieldError id="record-root-error" message={errors.root?.message} />

      <CredenzaFooter className="gap-2 px-0">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          <ReceiptText /> Registrar
        </Button>
      </CredenzaFooter>
    </form>
  );
}
