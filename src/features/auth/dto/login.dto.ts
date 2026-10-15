import { z } from "zod";

/**
 * Un solo esquema para el formulario (react-hook-form) y para el servidor
 * (`parseJson`): las reglas no se duplican ni se desincronizan.
 */
export const loginSchema = z.object({
  username: z.string().trim().min(3, "Mínimo 3 caracteres"),
  password: z.string().min(4, "Mínimo 4 caracteres"),
});

export type LoginDto = z.infer<typeof loginSchema>;
