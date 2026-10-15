import { z } from "zod";

/**
 * Esquemas de las variables de entorno. Agrega aquí las de cada proyecto y borra
 * las de ejemplo que no uses.
 *
 * - `publicSchema`: variables `NEXT_PUBLIC_*`. Next las incrusta en el bundle del
 *   navegador al hacer `next build`, así que NUNCA pongas un secreto aquí.
 * - `serverSchema`: secretos y configuración solo de servidor.
 */
export const publicSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Aurora"),
  /** Vacío = mismo origen (las rutas `/api/**` de esta misma app). */
  NEXT_PUBLIC_API_BASE_URL: z.union([z.literal(""), z.url()]).default(""),
});

export const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  // Ejemplos. Descomenta y adapta:
  // DATABASE_URL: z.url(),
  // RESEND_API_KEY: z.string().min(1, "Falta RESEND_API_KEY"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

/** Valida y lanza un error legible que nombra cada variable inválida. */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>,
  label: string,
): z.infer<T> {
  // Una variable declarada vacía en `.env` (`FOO=`) cuenta como no definida.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ""),
  );
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Variables de entorno ${label} inválidas → ${problems}. Revisa tu .env.`);
  }
  return parsed.data;
}
