"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, FileSpreadsheet, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toSafeMessage } from "@/core/errors";
import { reportError } from "@/core/logger";
import { cn } from "@/lib/utils";
import { allRequiredMapped, autoMapColumns, validateAndMapRows } from "./importValidation";
import StepMapColumns from "./steps/StepMapColumns";
import StepPreviewConfirm from "./steps/StepPreviewConfirm";
import StepSelectAction from "./steps/StepSelectAction";
import StepUploadFile from "./steps/StepUploadFile";
import type { ColumnMapping, ExcelRow, ImportActionConfig } from "./types";

type StepId = "action" | "upload" | "map" | "confirm";
const STEP_LABELS: Record<StepId, string> = {
  action: "Tipo de datos",
  upload: "Subir archivo",
  map: "Mapear columnas",
  confirm: "Confirmar",
};

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Qué se puede importar. Con una sola acción se omite el paso de elegir tipo. */
  actions: ImportActionConfig[];
  /**
   * Guarda las filas válidas, ya convertidas y validadas. Llama a un service
   * (o despacha un thunk); si lanza, el modal muestra el mensaje seguro y no se cierra.
   */
  onImport: (action: ImportActionConfig, rows: Array<Record<string, unknown>>) => Promise<void>;
  title?: string;
}

/**
 * Importación de Excel en pasos: tipo → archivo → mapeo de columnas → validación.
 * No conoce el dominio: los campos, tipos y validaciones vienen en `actions`.
 */
export default function ExcelImportModal({
  isOpen,
  onClose,
  actions,
  onImport,
  title = "Importar desde Excel",
}: ExcelImportModalProps) {
  const single = actions.length === 1;
  const steps = useMemo<StepId[]>(
    () => (single ? ["upload", "map", "confirm"] : ["action", "upload", "map", "confirm"]),
    [single],
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [selectedAction, setSelectedAction] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<ExcelRow[]>([]);
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [skipInvalidRows, setSkipInvalidRows] = useState(true);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const step = steps[stepIndex];
  // Con una sola acción no hay nada que elegir: se deriva, no se guarda en estado
  // (así sigue siendo correcto aunque `actions` cambie con el modal montado).
  const currentAction = single ? actions[0] : actions.find((action) => action.value === selectedAction);

  const clearFile = () => {
    setFile(null);
    setExcelData([]);
    setExcelColumns([]);
    setMapping({});
  };

  const handleClose = () => {
    if (isProcessing) return;
    setStepIndex(0);
    setSelectedAction("");
    clearFile();
    setSkipInvalidRows(true);
    setError("");
    onClose();
  };

  const handleNext = () => {
    setError("");
    if (step === "action" && !currentAction) return setError("Selecciona un tipo de datos para continuar.");
    if (step === "upload" && !file) return setError("Sube un archivo para continuar.");
    if (step === "map" && currentAction && !allRequiredMapped(mapping, currentAction.fields)) {
      return setError("Asigna una columna a cada campo obligatorio antes de continuar.");
    }
    setStepIndex((index) => index + 1);
  };

  const handleImport = async () => {
    if (!currentAction) return;
    setError("");
    const result = validateAndMapRows(excelData, mapping, currentAction.fields);
    if (result.invalidRowIndexes.size > 0 && !skipInvalidRows) {
      return setError("Hay filas con errores. Corrígelas en el archivo o activa la opción de omitirlas.");
    }
    if (result.validRows.length === 0) return setError("No hay filas válidas para importar.");

    setIsProcessing(true);
    try {
      await onImport(currentAction, result.validRows);
      setIsProcessing(false);
      handleClose();
    } catch (importError) {
      reportError(importError, { context: `ExcelImportModal.import.${currentAction.value}` });
      setError(toSafeMessage(importError, "No se pudieron importar los datos."));
      setIsProcessing(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[95vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileSpreadsheet className="size-5" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">{title}</Dialog.Title>
                {single && currentAction && <p className="text-sm text-muted-foreground">{currentAction.label}</p>}
              </div>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Cerrar" disabled={isProcessing}>
                <X />
              </Button>
            </Dialog.Close>
          </div>

          <ol className="flex items-center justify-center gap-2 border-b border-border px-6 py-4">
            {steps.map((id, index) => (
              <li key={id} className="flex items-center" aria-current={index === stepIndex ? "step" : undefined}>
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border-2 text-sm font-medium tabular-nums",
                      index < stepIndex
                        ? "border-primary bg-primary text-primary-foreground"
                        : index === stepIndex
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={cn(
                      "hidden text-xs sm:block",
                      index === stepIndex ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {STEP_LABELS[id]}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={cn("mx-2 h-px w-8 sm:w-16", index < stepIndex ? "bg-primary" : "bg-border")} />
                )}
              </li>
            ))}
          </ol>

          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {step === "action" && (
              <StepSelectAction
                actions={actions}
                selectedAction={selectedAction}
                onSelect={(value) => {
                  setSelectedAction(value);
                  clearFile();
                  setError("");
                }}
              />
            )}
            {step === "upload" && currentAction && (
              <StepUploadFile
                action={currentAction}
                file={file}
                rowCount={excelData.length}
                setError={setError}
                onClear={clearFile}
                onLoaded={(loaded, columns, rows) => {
                  setFile(loaded);
                  setExcelColumns(columns);
                  setExcelData(rows);
                  setMapping(autoMapColumns(columns, currentAction.fields));
                }}
              />
            )}
            {step === "map" && currentAction && (
              <StepMapColumns
                action={currentAction}
                excelColumns={excelColumns}
                excelData={excelData}
                mapping={mapping}
                setMapping={setMapping}
              />
            )}
            {step === "confirm" && currentAction && (
              <StepPreviewConfirm
                action={currentAction}
                excelData={excelData}
                mapping={mapping}
                skipInvalidRows={skipInvalidRows}
                setSkipInvalidRows={setSkipInvalidRows}
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={handleClose} disabled={isProcessing}>
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={stepIndex === 0 || isProcessing}
                onClick={() => {
                  setError("");
                  setStepIndex((index) => index - 1);
                }}
              >
                <ArrowLeft /> Atrás
              </Button>
              {step === "confirm" ? (
                <Button onClick={() => void handleImport()} disabled={isProcessing}>
                  {isProcessing && <Loader2 className="animate-spin" />}
                  {isProcessing ? "Importando…" : "Importar datos"}
                </Button>
              ) : (
                <Button onClick={handleNext}>
                  Siguiente <ArrowRight />
                </Button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
