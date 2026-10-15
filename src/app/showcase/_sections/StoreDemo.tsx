"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, ShieldCheck, VolumeX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppError, ValidationError } from "@/core/errors";
import { useAppDispatch, useAppSelector } from "@/hooks/useReduxHooks";
import { selectLoading } from "@/store/loadingSelectors";
import { createAsyncThunkWithErrorHandling } from "@/store/utils/createAsyncThunkWithErrorHandling";
import { rejectionFieldErrors } from "@/store/utils/thunkResult";
import { delay } from "@/utils/delay";

type Outcome = "ok" | "domain" | "validation" | "unexpected";

// En un feature real esto es un método de `services/`; aquí se simula.
const fakeService = async (outcome: Outcome) => {
  await delay(900);
  if (outcome === "domain") throw new AppError("El pedido ya está cerrado.");
  if (outcome === "validation") {
    throw new ValidationError("Revisa el formulario.", {
      fieldErrors: { email: "Ya está registrado" },
    });
  }
  if (outcome === "unexpected") throw new TypeError("cannot read 'id' of undefined");
  return { id: crypto.randomUUID().slice(0, 8) };
};

const runDemo = createAsyncThunkWithErrorHandling("showcase/runDemo", fakeService);
const runSilent = createAsyncThunkWithErrorHandling(
  "showcase/runSilent",
  fakeService,
  { silent: true },
);

export default function StoreDemo() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectLoading(runDemo));
  const [log, setLog] = useState<string[]>([]);

  const push = (line: string) => setLog((prev) => [line, ...prev].slice(0, 4));

  const run = async (outcome: Outcome, silent = false) => {
    try {
      const result = await dispatch((silent ? runSilent : runDemo)(outcome)).unwrap();
      push(`✔ creado ${result.id}`);
    } catch (error) {
      const fields = rejectionFieldErrors(error);
      push(
        Object.keys(fields).length
          ? `✘ campos: ${JSON.stringify(fields)}`
          : `✘ rechazado${silent ? " (silencioso)" : ""}`,
      );
    }
  };

  const busy = status === "loading";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Store y thunks
          <Badge variant="secondary" className="font-mono tabular-nums">
            {status}
          </Badge>
        </CardTitle>
        <CardDescription>
          Un thunk llama a un service. Si falla, el middleware manda el mensaje
          seguro al panel de alertas, el estado de carga vive en <code>loadingSlice</code> y el
          componente solo decide qué más hacer con <code>unwrap()</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run("ok")} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Éxito
          </Button>
          <Button variant="outline" onClick={() => run("domain")} disabled={busy}>
            <CircleAlert /> Error de dominio
          </Button>
          <Button variant="outline" onClick={() => run("validation")} disabled={busy}>
            <ShieldCheck /> Error de validación
          </Button>
          <Button variant="outline" onClick={() => run("unexpected")} disabled={busy}>
            <CircleAlert /> Error inesperado
          </Button>
          <Button variant="ghost" onClick={() => run("domain", true)}>
            <VolumeX /> Silencioso
          </Button>
        </div>
        <ul className="min-h-20 space-y-1 rounded-lg bg-muted p-3 font-mono text-xs text-muted-foreground">
          {log.length === 0 ? <li>Sin ejecuciones todavía.</li> : log.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
        <p className="text-xs text-muted-foreground">
          El error inesperado muestra el mensaje genérico; el detalle técnico solo
          aparece en la consola en desarrollo.
        </p>
      </CardContent>
    </Card>
  );
}
