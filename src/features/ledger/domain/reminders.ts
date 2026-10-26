import { parseLocalDate } from "@/utils/localDate";
import { paymentDueSoon, type CardSummary } from "./cards";
import { formatMinor } from "./money";

/** Un aviso para el usuario (pago de tarjeta o mensualidad por apartar). `key` lo identifica: se avisa una vez por día. */
export interface PaymentReminder {
  key: string;
  title: string;
  body: string;
}

const dayFormat = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });
const day = (iso: string) => dayFormat.format(parseLocalDate(iso)).replace(/\./g, "");

function dueWords(due: string, daysLeft: number): string {
  if (daysLeft < 0) return `venció el ${day(due)}`;
  if (daysLeft === 0) return "vence hoy";
  if (daysLeft === 1) return "vence mañana";
  return `vence el ${day(due)}`;
}

/** Lo que hay que recordar hoy: pagos de tarjeta cercanos y mensualidades a meses por apartar. */
export function paymentReminders(cards: readonly CardSummary[], today: string): PaymentReminder[] {
  const reminders: PaymentReminder[] = [];
  for (const card of cards) {
    const { statement } = card;
    if (paymentDueSoon(statement)) {
      reminders.push({
        key: `pay:${card.account.id}:${statement.due}:${today}`,
        title: `Pago de ${card.account.name}: ${dueWords(statement.due, statement.daysLeft)}`,
        body: `Paga ${formatMinor(statement.amount)} del corte del ${day(statement.cutoff)} para no generar intereses.`,
      });
    }
    for (const plan of card.plans) {
      if (!plan.nextDue || !plan.next) continue;
      reminders.push({
        key: `msi:${plan.purchase.id}:${plan.next.number}:${today}`,
        title: `Aparta la mensualidad ${plan.next.number} de ${plan.months}: ${plan.purchase.concept}`,
        body: `${formatMinor(plan.next.amountMinor)} en ${card.account.name}; se cobra en el corte del ${day(plan.next.cutoff)} y se paga antes del ${day(plan.next.due)}.`,
      });
    }
  }
  return reminders;
}
