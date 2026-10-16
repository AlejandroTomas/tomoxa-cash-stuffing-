import { parseEnv, publicSchema } from "./schema";

/**
 * Variables públicas, utilizables en cliente y servidor.
 *
 * Cada variable se lee con su nombre literal (`process.env.NEXT_PUBLIC_X`):
 * Next solo incrusta en el bundle las lecturas estáticas. Un
 * `process.env[nombre]` o pasar `process.env` entero llega vacío al navegador.
 */
export const publicEnv = parseEnv(
  publicSchema,
  {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },
  "públicas",
);
