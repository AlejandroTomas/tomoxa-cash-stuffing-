import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { validateAndMapRows } from "../importValidation";
import type { ColumnMapping, ExcelRow, ImportActionConfig } from "../types";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

interface Props {
  action: ImportActionConfig;
  excelData: ExcelRow[];
  mapping: ColumnMapping;
  skipInvalidRows: boolean;
  setSkipInvalidRows: (value: boolean) => void;
}

export default function StepPreviewConfirm({
  action,
  excelData,
  mapping,
  skipInvalidRows,
  setSkipInvalidRows,
}: Props) {
  const [showErrors, setShowErrors] = useState(false);

  const result = useMemo(
    () => validateAndMapRows(excelData, mapping, action.fields),
    [excelData, mapping, action.fields],
  );

  const totalRows = excelData.length;
  const errorRows = result.invalidRowIndexes.size;
  const validRows = totalRows - errorRows;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total de filas</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">{totalRows}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Filas válidas</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">{validRows}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Filas con errores</p>
          <p className="text-2xl font-bold text-destructive tabular-nums">{errorRows}</p>
        </div>
      </div>

      {errorRows > 0 ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              <p className="text-sm font-medium">
                Se encontraron {result.errors.length} errores en {errorRows}{" "}
                filas
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowErrors((v) => !v)}
            >
              {showErrors ? "Ocultar" : "Ver detalle"}
            </Button>
          </div>

          {showErrors ? (
            <div className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs text-destructive">
              {result.errors.map((err, idx) => (
                <p key={idx}>
                  Fila {err.rowIndex + 2}: {err.message}
                </p>
              ))}
            </div>
          ) : null}

          <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={skipInvalidRows}
              onCheckedChange={(checked) => setSkipInvalidRows(checked === true)}
            />
            Omitir las filas con error e importar solo las válidas
          </label>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-foreground">
          <CheckCircle2 className="size-4" />
          <p className="text-sm font-medium">
            Todos los datos son válidos y están listos para importar.
          </p>
        </div>
      )}
    </div>
  );
}
