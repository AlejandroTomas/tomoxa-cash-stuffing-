import { getSession, onSessionChange } from "@/core/session";

/**
 * Lo que el motor necesita del navegador, detrás de interfaces para poder
 * probarlo en Node: conectividad, sesión y un lock entre pestañas.
 */

export interface Connectivity {
  isOnline: () => boolean;
  /** Avisa cada vez que vuelve la conexión. Devuelve la función para desuscribirse. */
  onOnline: (listener: () => void) => () => void;
}

export interface RunLock {
  /** Corre `task` solo si nadie más tiene el lock. Si otra pestaña lo tiene, resuelve `false` sin esperar. */
  runExclusive: (task: () => Promise<void>) => Promise<boolean>;
}

export interface Identity {
  /** Usuario con sesión en este equipo, aunque no haya red. `null` si nadie inició sesión. */
  currentUserId: () => Promise<string | null>;
  /** Avisa cada vez que alguien inicia sesión. Devuelve la función para desuscribirse. */
  onSignIn: (listener: () => void) => () => void;
}

/**
 * `navigator.onLine === false` es confiable; `true` no (una red sin internet
 * también dice `true`). Por eso solo se usa para no intentar cuando seguro no
 * hay red: si dice que sí y no hay, el envío falla como error pasajero.
 */
export const browserConnectivity: Connectivity = {
  isOnline: () => typeof navigator === "undefined" || navigator.onLine,
  onOnline: (listener) => {
    if (typeof window === "undefined") return () => undefined;
    window.addEventListener("online", listener);
    return () => window.removeEventListener("online", listener);
  },
};

/**
 * Web Locks API: un solo envío a la vez aunque la app esté abierta en varias
 * pestañas. El lock se suelta solo si la pestaña se cierra a la mitad. Sin
 * soporte, cae a un lock dentro de la pestaña; el `id` propio de cada registro
 * hace que un envío duplicado no duplique datos.
 */
export function createBrowserRunLock(name: string): RunLock {
  let localBusy = false;

  return {
    async runExclusive(task) {
      const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
      if (locks) {
        return await locks.request(name, { ifAvailable: true }, async (lock) => {
          if (!lock) return false;
          await task();
          return true;
        });
      }
      if (localBusy) return false;
      localBusy = true;
      try {
        await task();
        return true;
      } finally {
        localBusy = false;
      }
    },
  };
}

/**
 * Identidad desde `core/session`. La sesión vive en el equipo, así que sigue
 * disponible sin red: lo encolado por un usuario se manda cuando vuelva la conexión.
 */
export function createSessionIdentity(): Identity {
  return {
    currentUserId: async () => getSession()?.userId ?? null,
    onSignIn: (listener) =>
      onSessionChange((session) => {
        if (session) listener();
      }),
  };
}
