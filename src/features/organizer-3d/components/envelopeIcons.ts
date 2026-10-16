import { Banknote, CalendarDays, ChartNoAxesColumnIncreasing, CreditCard, PiggyBank, Wallet, type LucideIcon } from "lucide-react";
import type { EnvelopeIcon } from "../domain/envelopeView";

/** Icono de cada sobre (mismo trazo que las etiquetas 3D). */
export const ENVELOPE_ICONS: Record<EnvelopeIcon, LucideIcon> = {
  wallet: Wallet,
  card: CreditCard,
  piggy: PiggyBank,
  banknote: Banknote,
  calendar: CalendarDays,
  chart: ChartNoAxesColumnIncreasing,
};
