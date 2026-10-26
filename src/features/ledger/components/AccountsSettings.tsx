"use client";

import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Archive, Banknote, CreditCard, Landmark, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/core/toast";
import { useAppDispatch, useAppSelector } from "@/hooks/useReduxHooks";
import { showDialog } from "@/utils/dialogService";
import { filteredField, sanitizeDigits } from "@/utils/numericInput";
import { ACCOUNT_KIND_LABELS, ACCOUNT_NAME_MAX, checkAccount } from "../domain/accounts";
import type { Account, AccountKind } from "../domain/types";
import { archiveAccount, saveAccount } from "../ledgerSlice";
import { selectAccounts } from "../selector";

const KIND_ORDER: Record<AccountKind, number> = { debit: 0, cash: 1, credit: 2 };
const KIND_ICONS = { debit: Landmark, cash: Banknote, credit: CreditCard } as const;

const dayField = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,2}$/, message)
    .refine((value) => Number(value) >= min && Number(value) <= max, message);

const accountFormSchema = z
  .object({
    kind: z.enum(["debit", "cash", "credit"]),
    name: z.string().trim().min(1, "Ponle un nombre.").max(ACCOUNT_NAME_MAX, `Máximo ${ACCOUNT_NAME_MAX} caracteres.`),
    cutoffDay: z.string(),
    paymentDays: z.string(),
  })
  .superRefine((form, context) => {
    if (form.kind !== "credit") return;
    const cutoff = dayField(1, 31, "Del 1 al 31.").safeParse(form.cutoffDay);
    if (!cutoff.success) context.addIssue({ code: "custom", path: ["cutoffDay"], message: "Del 1 al 31." });
    const days = dayField(1, 60, "De 1 a 60.").safeParse(form.paymentDays);
    if (!days.success) context.addIssue({ code: "custom", path: ["paymentDays"], message: "De 1 a 60." });
  });
type AccountForm = z.infer<typeof accountFormSchema>;

/** Cuentas de débito, efectivo y tarjetas: agregar, renombrar, ajustar corte y archivar. */
export function AccountsSettings() {
  const accounts = useAppSelector(selectAccounts);
  const active = useMemo(() => accounts.filter((account) => !account.archived).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]), [accounts]);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section aria-labelledby="accounts-settings" className="space-y-3">
      <div>
        <h3 id="accounts-settings" className="text-sm font-medium text-muted-foreground">
          Cuentas y tarjetas
        </h3>
        <p className="text-xs text-muted-foreground">Cada tarjeta de crédito tiene su propio sobre donde se aparta lo que gastas con ella.</p>
      </div>
      <ul className="space-y-2">
        {active.map((account) => {
          const Icon = KIND_ICONS[account.kind];
          return (
            <li key={account.id} className="rounded-2xl border border-border/70 bg-card/70 px-4 py-2.5 text-sm">
              {editing === account.id ? (
                <AccountEditor account={account} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex items-center gap-3">
                  <Icon className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{account.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {account.card ? `Corte el día ${account.card.cutoffDay}, ${account.card.paymentDays} días para pagar` : ACCOUNT_KIND_LABELS[account.kind]}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${account.name}`} className="shrink-0 rounded-full" disabled={editing !== null} onClick={() => setEditing(account.id)}>
                    <Pencil />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
        {editing === "new" && (
          <li className="rounded-2xl border border-primary/30 bg-card/80 px-4 py-3 text-sm">
            <AccountEditor onDone={() => setEditing(null)} />
          </li>
        )}
      </ul>
      {editing !== "new" && (
        <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={editing !== null} onClick={() => setEditing("new")}>
          <Plus /> Agregar cuenta o tarjeta
        </Button>
      )}
    </section>
  );
}

/** Formulario de una cuenta. Sin `account`, crea una nueva (se elige el tipo); al editar, el tipo no cambia. */
function AccountEditor({ account, onDone }: { account?: Account; onDone: () => void }) {
  const dispatch = useAppDispatch();
  const accounts = useAppSelector(selectAccounts);
  const [saving, setSaving] = useState(false);
  const prefix = account?.id ?? "new";
  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<AccountForm>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      kind: account?.kind ?? "debit",
      name: account?.name ?? "",
      cutoffDay: String(account?.card?.cutoffDay ?? 15),
      paymentDays: String(account?.card?.paymentDays ?? 20),
    },
  });
  const kind = useWatch({ control, name: "kind" });

  const onSubmit = async (form: AccountForm) => {
    const input = { id: account?.id, name: form.name, kind: form.kind, cutoffDay: Number(form.cutoffDay), paymentDays: Number(form.paymentDays) };
    const issue = checkAccount(input, accounts);
    if (issue) {
      setError(issue.field === "form" ? "root" : issue.field, { message: issue.message });
      return;
    }
    setSaving(true);
    try {
      const saved = await dispatch(saveAccount(input)).unwrap();
      toast.success(account ? `Guardado: ${saved.account.name}.` : saved.envelope ? `Agregada ${saved.account.name}, con su sobre ${saved.envelope.name}.` : `Agregada: ${saved.account.name}.`);
      onDone();
    } catch {
      // El middleware ya mostró el error.
      setSaving(false);
    }
  };

  const confirmArchive = () => {
    if (!account) return;
    showDialog({
      type: "question",
      title: `¿Archivar ${account.name}?`,
      message:
        account.kind === "credit"
          ? "Deja de aparecer para registrar y su sobre de reserva se archiva con ella. Sus movimientos se conservan. Solo se archivan tarjetas sin deuda y con la reserva vacía."
          : "Deja de aparecer para registrar; sus movimientos se conservan. Solo se archivan cuentas en $0.",
      confirmText: "Archivar",
      cancelText: "No",
      onConfirm: () => {
        void dispatch(archiveAccount(account.id))
          .unwrap()
          .then(() => {
            toast.success(`Archivada: ${account.name}.`);
            onDone();
          })
          .catch(() => undefined);
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
      {!account && (
        <Tabs value={kind} onValueChange={(value) => setValue("kind", value as AccountKind)}>
          <TabsList aria-label="Tipo de cuenta" className="grid w-full grid-cols-3">
            {(["debit", "cash", "credit"] as const).map((option) => (
              <TabsTrigger key={option} value={option} className="text-xs">
                {option === "credit" ? "Crédito" : ACCOUNT_KIND_LABELS[option]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`account-${prefix}-name`}>Nombre</Label>
        <Input
          id={`account-${prefix}-name`}
          autoComplete="off"
          maxLength={ACCOUNT_NAME_MAX + 4}
          placeholder={kind === "credit" ? "Nu, BBVA Azul…" : kind === "debit" ? "Nómina BBVA, Santander…" : "Cartera"}
          aria-invalid={Boolean(errors.name)}
          className="rounded-xl"
          {...register("name")}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      {kind === "credit" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`account-${prefix}-cutoff`}>Día de corte</Label>
            <Input
              id={`account-${prefix}-cutoff`}
              inputMode="numeric"
              maxLength={2}
              aria-invalid={Boolean(errors.cutoffDay)}
              className="rounded-xl tabular-nums"
              {...filteredField(register("cutoffDay"), (text) => sanitizeDigits(text, 2))}
            />
            {errors.cutoffDay && <p className="text-xs text-destructive">{errors.cutoffDay.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`account-${prefix}-days`}>Días para pagar</Label>
            <Input
              id={`account-${prefix}-days`}
              inputMode="numeric"
              maxLength={2}
              aria-invalid={Boolean(errors.paymentDays)}
              className="rounded-xl tabular-nums"
              {...filteredField(register("paymentDays"), (text) => sanitizeDigits(text, 2))}
            />
            {errors.paymentDays && <p className="text-xs text-destructive">{errors.paymentDays.message}</p>}
          </div>
        </div>
      )}
      {errors.root && <p className="text-xs text-destructive">{errors.root.message}</p>}
      <div className="flex items-center gap-2">
        {account && (
          <Button type="button" size="sm" variant="ghost" className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={confirmArchive}>
            <Archive /> Archivar
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" className="ml-auto rounded-full" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" className="rounded-full" disabled={saving}>
          {account ? "Guardar" : "Agregar"}
        </Button>
      </div>
    </form>
  );
}
