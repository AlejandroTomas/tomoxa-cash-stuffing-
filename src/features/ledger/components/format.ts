import { parseLocalDate } from "@/utils/localDate";

const dayFormat = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

/** "2026-11-04" → "4 nov". */
export const formatDay = (iso: string) => dayFormat.format(parseLocalDate(iso)).replace(/\./g, "");

/** 0 = domingo … 6 = sábado. */
export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
