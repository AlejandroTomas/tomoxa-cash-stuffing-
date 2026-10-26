import { reportError } from "@/core/logger";

/**
 * Avisos del sistema (notificaciones) desde el navegador, sin servidor. Se
 * muestran con el service worker (`public/sw.js`), que es lo que piden Android
 * y las apps instaladas. Solo salen mientras la app está abierta o al abrirla:
 * para avisar con la app cerrada hace falta Web Push con un servidor.
 */

const PREFERENCE_KEY = "ahorroxa.reminders";
const SENT_KEY = "ahorroxa.reminders.sent";
const SW_URL = "/sw.js";

export type NotifyStatus = "unsupported" | "denied" | "off" | "on";

export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento (modo privado): el aviso puede repetirse; no es grave.
  }
}

/** Estado en este dispositivo: sin soporte, bloqueado por el navegador, apagado o encendido. */
export function notifyStatus(): NotifyStatus {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && readStorage(PREFERENCE_KEY) !== "off" ? "on" : "off";
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration(SW_URL)) ?? navigator.serviceWorker.register(SW_URL);
}

/** Pide permiso (debe llamarse desde un clic) y deja los avisos encendidos si se concede. */
export async function enableNotifications(): Promise<NotifyStatus> {
  if (!notificationsSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  writeStorage(PREFERENCE_KEY, "on");
  await registration();
  return "on";
}

export function disableNotifications(): NotifyStatus {
  writeStorage(PREFERENCE_KEY, "off");
  return notifyStatus();
}

export interface Reminder {
  /** Identifica el aviso: el mismo `key` solo se muestra una vez. */
  key: string;
  title: string;
  body: string;
}

/** Muestra los avisos que aún no se han mostrado (si están encendidos). Devuelve cuántos salieron. */
export async function notifyPending(reminders: readonly Reminder[]): Promise<number> {
  if (notifyStatus() !== "on" || !reminders.length) return 0;
  let sent: string[] = [];
  try {
    sent = JSON.parse(readStorage(SENT_KEY) ?? "[]") as string[];
  } catch {
    sent = [];
  }
  const pending = reminders.filter((reminder) => !sent.includes(reminder.key));
  if (!pending.length) return 0;
  try {
    const worker = await registration();
    await navigator.serviceWorker.ready;
    for (const reminder of pending) {
      await worker.showNotification(reminder.title, { body: reminder.body, tag: reminder.key, icon: "/web-app-manifest-192x192.png", badge: "/favicon-96x96.png" });
    }
  } catch (error) {
    reportError(error, { context: "notify.showNotification" });
    return 0;
  }
  // Se guardan los últimos para no crecer sin fin.
  writeStorage(SENT_KEY, JSON.stringify([...sent, ...pending.map((reminder) => reminder.key)].slice(-200)));
  return pending.length;
}
