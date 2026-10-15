import { Banknote, CalendarDays, CreditCard, PiggyBank, Shield, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnvelopeIcon, EnvelopeItem } from "../mocks/envelopes.mock";

export const ENVELOPE_ICONS: Record<EnvelopeIcon, LucideIcon> = {
  wallet: Wallet,
  card: CreditCard,
  piggy: PiggyBank,
  banknote: Banknote,
  calendar: CalendarDays,
  shield: Shield,
};

/**
 * Miniatura del sobre con su color. El color es dato del sobre (como una
 * serie de gráfica), por eso va en `style` y es igual en ambos temas.
 */
export function EnvelopeGlyph({ item, className }: { item: EnvelopeItem; className?: string }) {
  const Icon = ENVELOPE_ICONS[item.icon];
  return (
    <span
      aria-hidden="true"
      className={cn("relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border", className)}
      style={{
        backgroundColor: `color-mix(in oklch, ${item.color} 22%, transparent)`,
        borderColor: `color-mix(in oklch, ${item.color} 55%, transparent)`,
        color: item.color,
      }}
    >
      <span className="absolute inset-x-1.5 top-1 h-0.5 rounded-full opacity-70" style={{ backgroundColor: item.color }} />
      <Icon className="size-4.5" strokeWidth={2.2} />
    </span>
  );
}
