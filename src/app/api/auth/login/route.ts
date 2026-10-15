import { UnauthenticatedError } from "@/core/errors";
import { ok, parseJson, route } from "@/core/http/server";
import type { Session } from "@/core/session";
import { loginSchema } from "@/features/auth/dto/login.dto";

/**
 * ⚠️ LOGIN DE DEMOSTRACIÓN — REEMPLÁZALO antes de producción.
 *
 * Acepta cualquier usuario con la contraseña "demo" y devuelve un token falso.
 * Uno real verifica la contraseña contra la base (hash con bcrypt/argon2),
 * limita intentos y, de preferencia, responde una cookie `httpOnly` en vez de
 * un token en el cuerpo. Ver `.ia/context/arquitectura-en-capas.md`.
 */
export const POST = route("api.auth.login", async (request) => {
  const { username, password } = await parseJson(request, loginSchema);
  if (password !== "demo") {
    // Mismo mensaje para usuario o contraseña: no revela qué usuarios existen.
    throw new UnauthenticatedError("Usuario o contraseña incorrectos.");
  }
  const session: Session = {
    token: crypto.randomUUID(),
    userId: `demo-${username.toLowerCase()}`,
    username,
    role: "Admin",
    fullName: username,
  };
  return ok(session);
});
