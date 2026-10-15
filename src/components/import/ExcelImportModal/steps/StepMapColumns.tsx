import type { ColumnMapping, ExcelRow, ImportActionConfig } from "../types";
import ColumnCombobox from "../ColumnCombobox";
import { Label } from "@/components/ui/label";

interface Props {
  action: ImportActionConfig;
  excelColumns: string[];
  excelData: ExcelRow[];
  mapping: ColumnMapping;
  setMapping: (mapping: ColumnMapping) => void;
}

export default function StepMapColumns({
  action,
  excelColumns,
  excelData,
  mapping,
  setMapping,
}: Props) {
  const usedColumns = Object.values(mapping).filter(Boolean);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Indica de qué columna de tu Excel viene cada campo. Ya propusimos las que
        coinciden por nombre. Los campos marcados con <span className="text-destructive">*</span> son obligatorios.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {action.fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label>
              {field.label}
              {field.required && field.defaultValue === undefined ? <span className="text-destructive"> *</span> : null}
            </Label>
            <ColumnCombobox
              options={excelColumns}
              value={mapping[field.key] ?? ""}
              usedOptions={usedColumns}
              onChange={(value) =>
                setMapping({ ...mapping, [field.key]: value })
              }
            />
            {field.helpText ? (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            ) : null}
          </div>
        ))}
      </div>

      {excelData.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="bg-muted px-4 py-2 text-sm font-medium text-foreground">
            Vista previa (primeras 3 filas)
          </div>
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/70">
                <tr>
                  {excelColumns.map((col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap px-3 py-2 text-left font-medium"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {excelData.slice(0, 3).map((row, idx) => (
                  <tr key={idx} className="border-t border-border">
                    {excelColumns.map((col) => (
                      <td key={col} className="whitespace-nowrap px-3 py-2">
                        {String(row[col] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
