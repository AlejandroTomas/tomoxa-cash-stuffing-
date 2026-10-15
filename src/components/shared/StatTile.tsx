import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatTileProps {
  /** Sentence case, sin dos puntos: "Ventas del mes". */
  label: string;
  /** Ya formateado (compacto si es grande): "$412.8 mil", "1,284". */
  value: string;
  /** Variación en porcentaje contra `comparedTo` (8.2 = +8.2 %). */
  delta?: number;
  /** El periodo contra el que se compara: "vs. mes anterior". */
  comparedTo?: string;
  /** Si subir es malo (devoluciones, tiempo de espera), pásalo en `false`. */
  upIsGood?: boolean;
  icon?: ReactNode;
}

const percent = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

/**
 * Un número que importa, con su variación. El color de la variación sale de
 * la dirección × si subir es bueno, y siempre va con ícono y signo: nunca el
 * color solo.
 */
export function StatTile({ label, value, delta, comparedTo, upIsGood = true, icon }: StatTileProps) {
  const direction = delta === undefined || delta === 0 ? 0 : delta > 0 ? 1 : -1;
  const isBad = direction !== 0 && (direction > 0) !== upIsGood;
  const DeltaIcon = direction > 0 ? ArrowUpRight : direction < 0 ? ArrowDownRight : Minus;

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{label}</span>
          {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
        </div>
        <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        {delta !== undefined && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className={cn("inline-flex items-center gap-0.5 font-medium", isBad ? "text-destructive" : "text-foreground")}>
              <DeltaIcon className="size-3.5" aria-hidden="true" />
              {percent.format(delta)} %
            </span>
            {comparedTo}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
