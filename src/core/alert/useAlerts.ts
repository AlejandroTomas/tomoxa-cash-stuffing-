import { useSyncExternalStore } from "react";

import { alertStore, type Alert } from "./alertStore";

const EMPTY: readonly Alert[] = [];

/** Las alertas abiertas, para la UI. */
export function useAlerts(): readonly Alert[] {
  return useSyncExternalStore(alertStore.subscribe, alertStore.getSnapshot, () => EMPTY);
}
