import { configureStore } from "@reduxjs/toolkit";
import { createLogger } from "redux-logger";

import { alertService } from "@/core/alert";
import { createNotifyOnRejected } from "./middleware/notifyOnRejected";
import { reducers } from "./reducers";

/** Prefijo de módulo del `typePrefix` → título del aviso de error. */
const MODULE_TITLES: Record<string, string> = {
  // orders: "Pedidos",
  exampleTasks: "Tareas (ejemplo)", // bórralo junto con features/_example
};

const notifyOnRejected = createNotifyOnRejected({
  moduleTitles: MODULE_TITLES,
  // Al stack de alertas: el usuario lo lee y lo cierra. Los repetidos se agrupan con ×N.
  notify: ({ title, message }) => {
    alertService.error(title, message);
  },
});

/**
 * Crea un store nuevo. En App Router NO se exporta un store singleton: el
 * módulo también se evalúa en el servidor durante SSR y un singleton
 * compartiría el estado entre peticiones de usuarios distintos.
 * `StoreProvider` crea uno por petición en el servidor y uno solo en el navegador.
 */
export function makeStore() {
  return configureStore({
    reducer: reducers,
    middleware: (getDefaultMiddleware) => {
      const middleware = getDefaultMiddleware().concat(notifyOnRejected);
      return process.env.NODE_ENV === "development"
        ? middleware.concat(createLogger({ collapsed: true }))
        : middleware;
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
export type { RootState } from "./reducers";

let browserStore: AppStore | undefined;

/** En el navegador devuelve siempre el mismo store; en el servidor, uno nuevo. */
export function getOrCreateStore(): AppStore {
  if (typeof window === "undefined") return makeStore();
  browserStore ??= makeStore();
  return browserStore;
}

/**
 * El store del navegador para código fuera de React (servicios de UI como el
 * de alertas). `undefined` en el servidor o antes de montar `StoreProvider`.
 */
export const getBrowserStore = (): AppStore | undefined => browserStore;
