"use client";

import { useId, useState, type DragEvent } from "react";
import { Download, FileSpreadsheet, Loader2, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reportError } from "@/core/logger";
import { cn } from "@/lib/utils";
import { ACCEPTED_EXTENSIONS, downloadTemplate, readSpreadsheet } from "../spreadsheet";
import type { ExcelRow, ImportActionConfig } from "../types";

interface Props {
  action: ImportActionConfig;
  file: File | null;
  rowCount: number;
  onLoaded: (file: File, columns: string[], rows: ExcelRow[]) => void;
  onClear: () => void;
  setError: (error: string) => void;
}

export default function StepUploadFile({ action, file, rowCount, onLoaded, onClear, setError }: Props) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleFile = async (uploaded: File) => {
    setError("");
    if (!ACCEPTED_EXTENSIONS.test(uploaded.name)) {
      setError("Sube un archivo de Excel válido (.xlsx, .xls o .csv).");
      return;
    }
    setIsLoading(true);
    try {
      const { columns, rows } = await readSpreadsheet(uploaded);
      if (rows.length === 0) {
        setError("El archivo no tiene filas con datos.");
        return;
      }
      onLoaded(uploaded, columns, rows);
    } catch (error) {
      reportError(error, { context: "ExcelImportModal.read" });
      setError("No se pudo leer el archivo. Verifica que sea un Excel válido.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) void handleFile(dropped);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          La primera fila del archivo debe tener los encabezados de las columnas.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => downloadTemplate(action)}>
          <Download /> Descargar plantilla
        </Button>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border bg-card",
        )}
      >
        <UploadCloud className="size-10 text-muted-foreground" />
        <p className="font-medium text-foreground">Arrastra tu archivo aquí</p>
        <p className="text-xs text-muted-foreground">.xlsx, .xls o .csv</p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          id={inputId}
          className="hidden"
          disabled={isLoading}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) void handleFile(selected);
            event.target.value = ""; // permite volver a elegir el mismo archivo
          }}
        />
        <Button type="button" disabled={isLoading} onClick={() => document.getElementById(inputId)?.click()}>
          {isLoading && <Loader2 className="animate-spin" />}
          Seleccionar archivo
        </Button>
      </div>

      {file && !isLoading && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="size-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{rowCount} filas encontradas</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClear} aria-label="Quitar archivo">
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}
