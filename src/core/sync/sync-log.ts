/**
 * Bitácora de depuración de la sincronización: explica en la consola qué paso
 * se ejecuta, por qué y desde dónde (`archivo › función`), para seguir un
 * registro de punta a punta.
 *
 * Solo imprime en desarrollo y no se guarda en ningún lado. Los errores reales
 * van por `reportError`. En la consola se filtra con `[sync·`.
 */
export type SyncLogArea = "motor" | "gateway" | "tabla-local";

const enabled = process.env.NODE_ENV === "development";

const AREA_COLOR: Record<SyncLogArea, string> = {
  motor: "#dc2626",
  gateway: "#0284c7",
  "tabla-local": "#a16207",
};

export function syncLog(
  area: SyncLogArea,
  where: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!enabled) return;
  // eslint-disable-next-line no-console -- bitácora de depuración: solo consola en desarrollo
  console.log(
    `%c[sync·${area}]%c ${message} %c← ${where}`,
    `color:${AREA_COLOR[area]};font-weight:600`,
    "color:inherit",
    "color:#94a3b8",
    ...(data ? [data] : []),
  );
}
