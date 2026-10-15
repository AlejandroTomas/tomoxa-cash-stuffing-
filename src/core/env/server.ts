import "server-only";
import { parseEnv, serverSchema } from "./schema";

/**
 * Variables de servidor. Importar este archivo desde un componente cliente
 * rompe el build a propósito (`server-only`): así un secreto no puede terminar
 * en el bundle del navegador.
 */
export const serverEnv = parseEnv(serverSchema, process.env, "de servidor");

export const isDev = serverEnv.NODE_ENV === "development";
