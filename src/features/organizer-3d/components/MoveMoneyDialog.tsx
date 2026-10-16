"use client";

import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownUp, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Credenza,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/responsive-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { checkTransfer, transferFormSchema, type Balances, type Transfer, type TransferForm } from "../domain/transfer";
import type { EnvelopeId, EnvelopeItem } from "../mocks/envelopes.mock";
import { formatAmount } from "./EnvelopeDetailCard";
import { ENVELOPE_ICONS } from "./envelopeIcons";

interface MoveMoneyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  envelopes: readonly EnvelopeItem[];
  balances: Balances;
  defaultFrom: EnvelopeId;
  /** Se llama con la transferencia ya validada, después de cerrar el diálogo (para ver la animación). */
  onConfirm: (transfer: Transfer) => void;
}

const minorToInput = (minor: number) => (minor / 100).toFixed(2).replace(/\.00$/, "");

/** Mover dinero entre sobres. Demostración: valida contra los saldos de ejemplo y no se guarda. */
export function MoveMoneyDialog({ open, onOpenChange, ...props }: MoveMoneyDialogProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent className="sm:max-w-md lg:right-[3%] lg:left-auto lg:translate-x-0">
        {/* Se vuelve a montar al abrir: el formulario arranca limpio con el sobre actual. */}
        {open && <MoveMoneyForm {...props} onClose={() => onOpenChange(false)} />}
      </CredenzaContent>
    </Credenza>
  );
}

function EnvelopeSelect({ id, value, onChange, envelopes, balances, invalid }: { id: string; value: string; onChange: (value: string) => void; envelopes: readonly EnvelopeItem[]; balances: Balances; invalid: boolean }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid} className="h-11 w-full rounded-xl">
        <SelectValue placeholder="Elige un sobre" />
      </SelectTrigger>
      <SelectContent>
        {envelopes.map((item) => {
          const Icon = ENVELOPE_ICONS[item.icon];
          return (
            <SelectItem key={item.id} value={item.id}>
              <Icon className="size-4" style={{ color: item.color }} aria-hidden="true" />
              {item.name}
              <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">{formatAmount(balances[item.id] / 100)}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function MoveMoneyForm({ envelopes, balances, defaultFrom, onConfirm, onClose }: Omit<MoveMoneyDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const firstOther = envelopes.find((item) => item.id !== defaultFrom)?.id ?? defaultFrom;
  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<TransferForm>({ resolver: zodResolver(transferFormSchema), defaultValues: { from: defaultFrom, to: firstOther, amount: "" } });
  const from = useWatch({ control, name: "from" }) as EnvelopeId;
  const to = useWatch({ control, name: "to" });
  const available = balances[from] ?? 0;

  const onSubmit = (form: TransferForm) => {
    const check = checkTransfer(form, balances);
    if (!check.ok) {
      setError(check.field, { message: check.message });
      return;
    }
    onClose();
    onConfirm(check.transfer);
  };

  const swap = () => {
    setValue("from", to);
    setValue("to", from);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <CredenzaHeader>
        <CredenzaTitle className="flex items-center gap-2">
          <ArrowLeftRight className="size-5" aria-hidden="true" /> Mover dinero
        </CredenzaTitle>
        <CredenzaDescription>Demostración: los montos son de ejemplo y nada se guarda.</CredenzaDescription>
      </CredenzaHeader>

      <div className="flex flex-col gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="move-from">Desde</Label>
          <Controller
            control={control}
            name="from"
            render={({ field }) => <EnvelopeSelect id="move-from" value={field.value} onChange={field.onChange} envelopes={envelopes} balances={balances} invalid={Boolean(errors.from)} />}
          />
          {errors.from && <p className="text-xs text-destructive">{errors.from.message}</p>}
        </div>
        <div className="flex justify-center">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Intercambiar origen y destino" onClick={swap} className="rounded-full">
            <ArrowDownUp />
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="move-to">Hacia</Label>
          <Controller
            control={control}
            name="to"
            render={({ field }) => <EnvelopeSelect id="move-to" value={field.value} onChange={field.onChange} envelopes={envelopes} balances={balances} invalid={Boolean(errors.to)} />}
          />
          {errors.to && <p className="text-xs text-destructive">{errors.to.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="move-amount">Monto</Label>
          <span className="text-xs text-muted-foreground tabular-nums">Hay {formatAmount(available / 100)}</span>
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
            $
          </span>
          <Input
            id="move-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? "move-amount-error" : undefined}
            className="h-12 rounded-xl pl-7 text-lg tabular-nums"
            {...register("amount")}
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { label: "25 %", share: 0.25 },
            { label: "50 %", share: 0.5 },
            { label: "Todo", share: 1 },
          ].map(({ label, share }) => (
            <button
              key={label}
              type="button"
              disabled={!available}
              onClick={() => setValue("amount", minorToInput(Math.floor(available * share)), { shouldValidate: true })}
              className={cn(
                "h-8 rounded-full border border-border px-3 text-xs font-medium text-foreground/80 outline-none transition-colors",
                "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {errors.amount && (
          <p id="move-amount-error" className="text-xs text-destructive">
            {errors.amount.message}
          </p>
        )}
      </div>

      <CredenzaFooter className="gap-2 px-0">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit">
          <ArrowLeftRight /> Mover
        </Button>
      </CredenzaFooter>
    </form>
  );
}
