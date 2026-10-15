"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reportError } from "@/core/logger";

/**
 * Errores inesperados al renderizar una ruta. Al usuario solo se le muestra un
 * mensaje genérico; el detalle va a `reportError` (y a sus sinks). `digest` es
 * el identificador que Next pone para cruzarlo con los logs del servidor.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportError(error, { context: "app.error-boundary", details: { digest: error.digest } });
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Algo salió mal</h1>
        <p className="text-sm text-muted-foreground">
          Ocurrió un error inesperado al mostrar esta página. Intenta de nuevo; si sigue pasando,
          comparte este código con soporte.
        </p>
        {error.digest && <p className="font-mono text-xs text-muted-foreground">{error.digest}</p>}
        <div className="flex justify-center gap-2">
          <Button onClick={() => unstable_retry()}>
            <RotateCcw /> Reintentar
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Ir al inicio</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
