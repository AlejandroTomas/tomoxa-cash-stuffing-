import type { ImportActionConfig } from "../types";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Props {
  actions: ImportActionConfig[];
  selectedAction: string;
  onSelect: (value: string) => void;
}

export default function StepSelectAction({
  actions,
  selectedAction,
  onSelect,
}: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Selecciona qué tipo de datos vas a importar.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((action) => {
          const isSelected = action.value === selectedAction;
          return (
            <button
              key={action.value}
              type="button"
              onClick={() => onSelect(action.value)}
              className={cn(
                "flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl text-primary [&_svg]:size-6">{action.icon}</span>
                {isSelected ? <Check className="size-5 text-primary" /> : null}
              </div>
              <div>
                <p className="font-semibold text-foreground">{action.label}</p>
                {action.description && (
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {action.fields.length} campos
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
