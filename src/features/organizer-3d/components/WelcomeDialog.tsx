"use client";

import { useRef, useState, type ReactNode } from "react";
import { Sparkles, Upload, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/core/toast";
import { importLedger, startLedger } from "@/features/ledger/ledgerSlice";
import { selectLedgerNeedsStart } from "@/features/ledger/selector";
import { useAppDispatch, useAppSelector } from "@/hooks/useReduxHooks";
import { cn } from "@/lib/utils";
import { AhorroxaMark } from "./AhorroxaMark";

/**
 * Primera vez en este dispositivo: ¿empezar de cero, explorar con el ejemplo o
 * cargar un respaldo? No se cierra sin elegir (no hay libro todavía). Después se
 * puede cambiar en Cuentas → Ajustes.
 */
export function WelcomeDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectLedgerNeedsStart);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (task: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await task();
      toast.success(done);
    } catch {
      // El middleware ya mostró el error.
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    await run(async () => dispatch(importLedger(await file.text())).unwrap(), "Respaldo cargado. Tus sobres están listos.");
  };

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="gap-5 rounded-[1.75rem] p-6 sm:max-w-md"
      >
        <DialogHeader className="items-center text-center sm:text-center">
          <AhorroxaMark className="mb-1 size-16" />
          <DialogTitle className="text-2xl tracking-tight">Bienvenido a Ahorroxa</DialogTitle>
          <DialogDescription>Reparte tu dinero en sobres y mira a dónde va cada peso. ¿Cómo quieres empezar?</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Choice
            icon={<Wallet />}
            title="Empezar de cero"
            text="Solo Disponible en $0 para registrar tu primer ingreso. Después creas tus propios sobres."
            disabled={busy}
            primary
            onClick={() => void run(() => dispatch(startLedger("empty")).unwrap(), "Listo. Registra tu primer ingreso en Disponible.")}
          />
          <Choice
            icon={<Sparkles />}
            title="Explorar con un ejemplo"
            text="Unos meses de movimientos inventados para ver cómo funciona. Puedes empezar de cero después en Cuentas → Ajustes."
            disabled={busy}
            onClick={() => void run(() => dispatch(startLedger("sample")).unwrap(), "Estos son datos de ejemplo. Juega con ellos sin miedo.")}
          />
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="mx-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <Upload className="size-4" aria-hidden="true" /> ¿Tienes un respaldo? Cárgalo
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => void onFile(event.target.files?.[0])} />
      </DialogContent>
    </Dialog>
  );
}

function Choice({ icon, title, text, primary, disabled, onClick }: { icon: ReactNode; title: string; text: string; primary?: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-start gap-4 rounded-2xl border p-4 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-60 [&_svg]:size-5",
        primary ? "border-primary/40 bg-primary/10 hover:bg-primary/15" : "border-border bg-card hover:bg-muted",
      )}
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", primary ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}
