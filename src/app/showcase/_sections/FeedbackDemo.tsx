"use client";

import { AlertTriangle, CheckCircle2, CircleAlert, Info, Layers, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProgressToastHeader } from "@/components/feedback/notch/ProgressToastHeader";
import { alertService } from "@/core/alert";
import { AppError, toSafeMessage } from "@/core/errors";
import { showToast, toast } from "@/core/toast";
import { delay } from "@/utils/delay";

export default function FeedbackDemo() {
  const simulateUpload = async () => {
    for (let progress = 0; progress <= 100; progress += 20) {
      showToast({
        id: "demo-upload",
        header: <ProgressToastHeader label="Subiendo" progress={progress} />,
        title: "Subiendo",
        description: `Archivo ${progress / 20 + 1} de 6`,
        duration: progress === 100 ? 3000 : null,
        status: progress === 100 ? "success" : "info",
      });
      await delay(500);
    }
  };

  const simulateBatch = () => {
    // Un lote donde varias filas fallan igual: se agrupa en ×N.
    alertService.reportErrors("Importación de productos", [
      new AppError("La fila no tiene precio de venta."),
      new AppError("La fila no tiene precio de venta."),
      new AppError("La fila no tiene precio de venta."),
      new AppError("El código de barras ya existe."),
    ]);
    alertService.success("Importación de productos", "Se guardaron 96 de 100 filas.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Toasts y alertas notch</CardTitle>
        <CardDescription>
          <strong>Toast</strong> (<code>@/core/toast</code>): aviso breve que se va solo.{" "}
          <strong>Alerta</strong> (<code>@/core/alert</code>): lo que el usuario debe leer
          y cerrar; los errores de thunks llegan aquí solos y los repetidos se agrupan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Toasts</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast.success("Los cambios se guardaron.")}>
              <CheckCircle2 /> Éxito
            </Button>
            <Button variant="outline" onClick={() => toast.info("Hay una versión nueva disponible.")}>
              <Info /> Información
            </Button>
            <Button variant="outline" onClick={() => toast.warning("Tu sesión vence en 5 minutos.")}>
              <AlertTriangle /> Advertencia
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                showToast({
                  title: "Pedido archivado",
                  description: "Lo puedes recuperar durante 30 días.",
                  action: { label: "Deshacer", onClick: () => toast.success("Pedido restaurado.") },
                })
              }
            >
              <Layers /> Con acción
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void toast
                  .promise(delay(1500).then(() => "F-1024"), {
                    loading: "Generando factura…",
                    success: (folio) => `Factura ${folio} generada.`,
                    error: (error) => toSafeMessage(error),
                  })
                  .catch(() => undefined)
              }
            >
              <Loader2 /> Promesa
            </Button>
            <Button variant="outline" onClick={() => void simulateUpload()}>
              <Upload /> Progreso
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Alertas</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => alertService.error("Pedidos", "El pedido ya está cerrado.")}
            >
              <CircleAlert /> Una alerta
            </Button>
            <Button variant="outline" onClick={simulateBatch}>
              <Layers /> Lote con errores repetidos
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                alertService.reportError("Sincronización", new Error("socket hang up at 10.0.0.3"))
              }
            >
              <CircleAlert /> Error técnico (se oculta)
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
