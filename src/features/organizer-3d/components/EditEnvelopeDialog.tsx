"use client";

import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Pencil, Plus } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  ENVELOPE_DESCRIPTION_MAX,
  ENVELOPE_ICON_OPTIONS,
  ENVELOPE_NAME_MAX,
  ENVELOPE_PALETTE,
  envelopeFormDefaults,
  envelopeFormSchema,
  envelopeFromForm,
  type EnvelopeForm,
  type EnvelopeStyle,
} from "../domain/envelopeStyle";
import type { EnvelopeItem } from "../domain/envelopeView";
import { ENVELOPE_ICONS } from "./envelopeIcons";

interface EditEnvelopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sobre a editar; `null` = crear uno nuevo. */
  item: EnvelopeItem | null;
  otherNames: readonly string[];
  /** Colores ya usados (al crear se sugiere uno libre). */
  usedColors?: readonly string[];
  /** Vista previa en vivo en la carpeta (solo al editar); `null` = volver al estilo guardado. */
  onPreview: (style: EnvelopeStyle | null) => void;
  onSave: (style: EnvelopeStyle) => void;
}

const BUDGET_OPTIONS: { value: EnvelopeForm["budgetPeriod"]; label: string }[] = [
  { value: "none", label: "Ninguno" },
  { value: "week", label: "Semanal" },
  { value: "month", label: "Mensual" },
];

const ICON_LABELS: Record<EnvelopeItem["icon"], string> = {
  wallet: "Cartera",
  card: "Tarjeta",
  piggy: "Alcancía",
  banknote: "Efectivo",
  calendar: "Calendario",
  chart: "Gráfica",
};

/** Crear o editar un sobre (nombre, descripción, color, icono y presupuesto); al editar, vista previa en la carpeta. */
export function EditEnvelopeDialog({ open, onOpenChange, onPreview, ...props }: EditEnvelopeDialogProps) {
  const close = (next: boolean) => {
    if (!next) onPreview(null);
    onOpenChange(next);
  };
  return (
    <Credenza open={open} onOpenChange={close}>
      <CredenzaContent className="sm:max-w-md lg:right-[3%] lg:left-auto lg:translate-x-0">
        {open && <EditEnvelopeForm {...props} onPreview={onPreview} onCancel={() => close(false)} onSaved={() => onOpenChange(false)} />}
      </CredenzaContent>
    </Credenza>
  );
}

function EditEnvelopeForm({
  item,
  otherNames,
  usedColors = [],
  onPreview,
  onSave,
  onCancel,
  onSaved,
}: Omit<EditEnvelopeDialogProps, "open" | "onOpenChange"> & { onCancel: () => void; onSaved: () => void }) {
  const schema = useMemo(() => envelopeFormSchema(otherNames), [otherNames]);
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<EnvelopeForm>({
    resolver: zodResolver(schema),
    defaultValues: envelopeFormDefaults(
      item ?? { name: "", description: "", color: ENVELOPE_PALETTE.find((swatch) => !usedColors.includes(swatch)) ?? ENVELOPE_PALETTE[0], icon: "wallet" },
    ),
  });
  const [name, description, color, icon, budgetPeriod] = useWatch({ control, name: ["name", "description", "color", "icon", "budgetPeriod"] });
  const previewName = name.trim() || item?.name || "Nuevo sobre";

  // La carpeta muestra los cambios mientras se edita.
  useEffect(() => {
    if (!item) return;
    onPreview({ name: previewName, description: description.trim(), color, icon });
  }, [item, previewName, description, color, icon, onPreview]);

  const Icon = ENVELOPE_ICONS[icon];

  return (
    <form
      noValidate
      onSubmit={handleSubmit((form) => {
        onSave(envelopeFromForm(form));
        // Cerrar sin revertir: la carpeta ya tiene el estilo guardado.
        onSaved();
      })}
      className="flex flex-col gap-5"
    >
      <CredenzaHeader>
        <CredenzaTitle className="flex items-center gap-2">
          {item ? <Pencil className="size-5" aria-hidden="true" /> : <Plus className="size-5" aria-hidden="true" />} {item ? "Editar sobre" : "Nuevo sobre"}
        </CredenzaTitle>
        <CredenzaDescription>{item ? "Los cambios se ven en la carpeta mientras editas." : "Aparecerá en la carpeta, al final de la pila."}</CredenzaDescription>
      </CredenzaHeader>

      {/* Vista previa en HTML (la carpeta queda detrás del diálogo). */}
      <div
        aria-hidden="true"
        className="flex items-center gap-3 rounded-2xl border-2 px-4 py-3"
        style={{ backgroundColor: `color-mix(in oklch, ${color} 35%, var(--card))`, borderColor: `color-mix(in oklch, ${color} 60%, transparent)` }}
      >
        <Icon className="size-7 shrink-0" strokeWidth={1.7} style={{ color: `color-mix(in oklch, ${color} 70%, var(--foreground))` }} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-lg font-medium text-foreground">{previewName}</span>
          {description.trim() && <span className="truncate text-xs text-muted-foreground">{description.trim()}</span>}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="envelope-name">Nombre</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {name.trim().length}/{ENVELOPE_NAME_MAX}
          </span>
        </div>
        <Input
          id="envelope-name"
          maxLength={ENVELOPE_NAME_MAX + 4}
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "envelope-name-error" : undefined}
          className="h-11 rounded-xl"
          {...register("name")}
        />
        {errors.name && (
          <p id="envelope-name-error" className="text-xs text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="envelope-description">Descripción</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {description.trim().length}/{ENVELOPE_DESCRIPTION_MAX}
          </span>
        </div>
        <Input
          id="envelope-description"
          maxLength={ENVELOPE_DESCRIPTION_MAX + 10}
          autoComplete="off"
          placeholder="¿Para qué es este sobre?"
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? "envelope-description-error" : undefined}
          className="h-11 rounded-xl"
          {...register("description")}
        />
        {errors.description && (
          <p id="envelope-description-error" className="text-xs text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Color</legend>
        <div role="radiogroup" aria-label="Color del sobre" className="flex flex-wrap gap-2.5">
          {ENVELOPE_PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              role="radio"
              aria-checked={color === swatch}
              aria-label={`Color ${swatch}`}
              onClick={() => setValue("color", swatch, { shouldValidate: true })}
              className="grid size-9 place-items-center rounded-full border-2 border-transparent outline-none transition-transform hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/60 aria-checked:border-foreground/70"
              style={{ backgroundColor: swatch }}
            >
              {color === swatch && <Check className="size-4 text-primary-foreground" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Icono</legend>
        <div role="radiogroup" aria-label="Icono del sobre" className="grid grid-cols-6 gap-2">
          {ENVELOPE_ICON_OPTIONS.map((option) => {
            const OptionIcon = ENVELOPE_ICONS[option];
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={icon === option}
                aria-label={ICON_LABELS[option]}
                onClick={() => setValue("icon", option, { shouldValidate: true })}
                className={cn(
                  "grid aspect-square place-items-center rounded-xl border border-border text-foreground/70 outline-none transition-colors",
                  "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-checked:border-primary aria-checked:bg-primary/10 aria-checked:text-foreground",
                )}
              >
                <OptionIcon className="size-5" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Presupuesto</legend>
        <div role="radiogroup" aria-label="Presupuesto del sobre" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {BUDGET_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={budgetPeriod === option.value}
              onClick={() => setValue("budgetPeriod", option.value, { shouldValidate: true })}
              className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-checked:bg-card aria-checked:text-foreground aria-checked:shadow-sm"
            >
              {option.label}
            </button>
          ))}
        </div>
        {budgetPeriod !== "none" && (
          <>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
                $
              </span>
              <Input
                id="envelope-budget"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                aria-label={budgetPeriod === "week" ? "Cuánto gastar por semana" : "Cuánto gastar por mes"}
                aria-invalid={Boolean(errors.budgetAmount)}
                aria-describedby={errors.budgetAmount ? "envelope-budget-error" : "envelope-budget-hint"}
                className="h-11 rounded-xl pl-7 tabular-nums"
                {...register("budgetAmount")}
              />
            </div>
            {errors.budgetAmount ? (
              <p id="envelope-budget-error" className="text-xs text-destructive">
                {errors.budgetAmount.message}
              </p>
            ) : (
              <p id="envelope-budget-hint" className="text-xs text-muted-foreground">
                Cuánto piensas gastar de este sobre {budgetPeriod === "week" ? "cada semana" : "cada mes"}.
              </p>
            )}
          </>
        )}
      </fieldset>

      <CredenzaFooter className="gap-2 px-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">
          <Check /> Guardar
        </Button>
      </CredenzaFooter>
    </form>
  );
}
