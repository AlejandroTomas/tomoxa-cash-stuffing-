"use client";

import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Credenza, CredenzaContent, CredenzaDescription, CredenzaFooter, CredenzaHeader, CredenzaTitle } from "@/components/ui/responsive-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/core/toast";
import { useAppDispatch, useAppSelector } from "@/hooks/useReduxHooks";
import { cn } from "@/lib/utils";
import { parseLocalDate, toLocalIsoDate } from "@/utils/localDate";
import { incomesDueOn } from "../domain/cards";
import { UNASSIGNED_ENVELOPE_ID } from "../domain/envelopes";
import { formatMinor, minorToInput, parseAmountMinor } from "../domain/money";
import { draftFromForm, formFieldOf, movementFormSchema, RECORD_KINDS, type MovementForm, type RecordKind } from "../domain/movementForm";
import type { Account, Movement } from "../domain/types";
import { checkMovement } from "../domain/validation";
import { recordMovement } from "../ledgerSlice";
import { selectAccounts, selectActiveEnvelopes, selectBalances, selectCardSummaries, selectEnvelopes, selectLedgerSettings, selectMovements } from "../selector";
import { formatDay } from "./format";

export interface RecordDefaults {
  kind?: RecordKind;
  envelopeId?: string;
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

function AccountSelect({ id, value, onChange, accounts, invalid, balances }: { id: string; value: string; onChange: (value: string) => void; accounts: readonly Account[]; invalid: boolean; balances: Record<string, number> }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid} className="h-11 w-full rounded-xl">
        <SelectValue placeholder="Elige una cuenta" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.name}
            {account.kind !== "credit" && <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">{formatMinor(balances[account.id] ?? 0)}</span>}
          </SelectItem>
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
      toAccountId: credit[0]?.id ?? "",
      envelopeId: defaults?.envelopeId ?? UNASSIGNED_ENVELOPE_ID,
    },
  });
  const [kind, amount, date, accountId, toAccountId, envelopeId] = useWatch({ control, name: ["kind", "amount", "date", "accountId", "toAccountId", "envelopeId"] });

  /** Al cambiar de tipo, las cuentas y el sobre se acomodan a lo que ese tipo admite. */
  const changeKind = (next: RecordKind) => {
    setValue("kind", next);
    const isMoney = (id: string) => money.some((account) => account.id === id);
    if (next !== "expense" && !isMoney(accountId)) setValue("accountId", money[0]?.id ?? "");
    if (next === "cardPayment") setValue("toAccountId", credit[0]?.id ?? "");
    if (next === "accountTransfer") setValue("toAccountId", money.find((account) => account.id !== (isMoney(accountId) ? accountId : money[0]?.id))?.id ?? "");
    if (next === "income" && !defaults?.envelopeId) setValue("envelopeId", UNASSIGNED_ENVELOPE_ID);
  };

  const amountMinor = parseAmountMinor(amount) ?? 0;
  const envelopeBalance = balances.envelopes[envelopeId] ?? 0;
  const overdraft = kind === "expense" && amountMinor > 0 && envelopeBalance - amountMinor < 0 ? amountMinor - Math.max(0, envelopeBalance) : 0;
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
    const issue = checkMovement(result.draft, { accounts, envelopes: allEnvelopes, movements });
    if (issue) {
      setError(formFieldOf(issue), { message: issue.message });
      return;
    }
    setSaving(true);
    try {
      const movement = await dispatch(recordMovement(result.draft)).unwrap();
      toast.success(`Registrado: ${movement.concept}, ${formatMinor(movement.amountMinor)}.`);
      onClose();
      onRecorded?.(movement);
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
                    <span className={cn("ml-auto pl-3 text-xs tabular-nums", balance < 0 ? "text-destructive" : "text-muted-foreground")}>{formatMinor(balance)}</span>
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
          <AccountSelect id={`record-${name}`} value={field.value} onChange={field.onChange} accounts={options} invalid={Boolean(errors[name])} balances={balances.accounts} />
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
            {...register("amount")}
          />
        </div>
        {kind === "cardPayment" && card && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={chip} disabled={!card.debt} onClick={() => setValue("amount", minorToInput(card.debt), { shouldValidate: true })}>
              Toda la deuda
            </button>
            <span className="text-xs text-muted-foreground">
              Corte {formatDay(card.period.cutoff)} · paga antes del {formatDay(card.period.due)}
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
            {accountField("accountId", "Pagaste con", active)}
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
