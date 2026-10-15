/**
 * Sesión del lado cliente: el token y los datos mínimos del usuario.
 *
 * Se guarda en `localStorage` en texto plano. Cualquier script que corra en la
 * página puede leerlo, así que **no es un lugar seguro para un token de larga
 * duración**. Si el proyecto tiene backend propio, lo recomendable es una
 * cookie `httpOnly` emitida por el servidor; en ese caso este módulo solo
 * guarda los datos de perfil y `token` queda vacío.
 *
 * Ajusta `Session` a lo que necesite cada proyecto.
 */
export interface Session {
  token: string;
  userId: string;
  username: string;
  role: string;
  fullName?: string;
}

const SESSION_KEY = "app.session.v1";

type Listener = (session: Session | null) => void;
const listeners = new Set<Listener>();

const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

// Misma sesión → mismo objeto: `useSyncExternalStore` (hook useSession) lo exige.
let cachedRaw: string | null = null;
let cachedSession: Session | null = null;

export function getSession(): Session | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedSession = raw ? (JSON.parse(raw) as Session) : null;
    }
    return cachedSession;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  listeners.forEach((listener) => listener(session));
}

export function clearSession(): void {
  if (!hasStorage()) return;
  window.localStorage.removeItem(SESSION_KEY);
  listeners.forEach((listener) => listener(null));
}

/** Avisa cada vez que la sesión cambia, en esta pestaña o en otra. */
export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY) listener(getSession());
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}
