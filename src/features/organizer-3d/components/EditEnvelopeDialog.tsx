"use client";

import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Pencil } from "lucide-react";
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
import { ENVELOPE_ICON_OPTIONS, ENVELOPE_NAME_MAX, ENVELOPE_PALETTE, envelopeStyleSchema, type EnvelopeStyle } from "../domain/envelopeStyle";
import type { EnvelopeItem } from "../mocks/envelopes.mock";
import { ENVELOPE_ICONS } from "./envelopeIcons";

interface EditEnvelopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: EnvelopeItem;
  otherNames: readonly string[];
  /** Vista previa en vivo en la carpeta; `null` = volver al estilo guardado. */
  onPreview: (style: EnvelopeStyle | null) => void;
  onSave: (style: EnvelopeStyle) => void;
}

const ICON_LABELS: Record<EnvelopeItem["icon"], string> = {
  wallet: "Cartera",
  card: "Tarjeta",
  piggy: "Alcancía",
  banknote: "Efectivo",
  calendar: "Calendario",
  chart: "Gráfica",
};

/** Editar nombre, color e icono del sobre, con vista previa en la carpeta. Demostración: no se guarda. */
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
  onPreview,
  onSave,
  onCancel,
  onSaved,
}: Omit<EditEnvelopeDialogProps, "open" | "onOpenChange"> & { onCancel: () => void; onSaved: () => void }) {
  const schema = useMemo(() => envelopeStyleSchema(otherNames), [otherNames]);
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<EnvelopeStyle>({ resolver: zodResolver(schema), defaultValues: { name: item.name, color: item.color, icon: item.icon } });
  const [name, color, icon] = useWatch({ control, name: ["name", "color", "icon"] });
  const previewName = name.trim() || item.name;

  // La carpeta muestra los cambios mientras se edita.
  useEffect(() => {
    onPreview({ name: previewName, color, icon });
  }, [previewName, color, icon, onPreview]);

  const Icon = ENVELOPE_ICONS[icon];

  return (
    <form
      noValidate
      onSubmit={handleSubmit((style) => {
        onSave(style);
        // Cerrar sin revertir: la carpeta ya tiene el estilo guardado.
        onSaved();
      })}
      className="flex flex-col gap-5"
    >
      <CredenzaHeader>
        <CredenzaTitle className="flex items-center gap-2">
          <Pencil className="size-5" aria-hidden="true" /> Editar sobre
        </CredenzaTitle>
        <CredenzaDescription>Los cambios se ven en la carpeta. Demostración: no se guardan al recargar.</CredenzaDescription>
      </CredenzaHeader>

      {/* Vista previa en HTML (la carpeta queda detrás del diálogo). */}
      <div
        aria-hidden="true"
        className="flex items-center gap-3 rounded-2xl border-2 px-4 py-3"
        style={{ backgroundColor: `color-mix(in oklch, ${color} 35%, var(--card))`, borderColor: `color-mix(in oklch, ${color} 60%, transparent)` }}
      >
        <Icon className="size-7" strokeWidth={1.7} style={{ color: `color-mix(in oklch, ${color} 70%, var(--foreground))` }} />
        <span className="truncate text-lg font-medium text-foreground">{previewName}</span>
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
