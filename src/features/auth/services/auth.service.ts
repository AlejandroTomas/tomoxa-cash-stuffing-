import { clearSession, setSession, type Session } from "@/core/session";
import type { LoginDto } from "../dto/login.dto";
import { authRepository } from "../repositories/auth.repository";

export const authService = {
  async login(dto: LoginDto): Promise<Session> {
    const session = await authRepository.login(dto);
    setSession(session);
    return session;
  },

  /** Si el backend usa cookie httpOnly, aquí también va la llamada a su logout. */
  logout(): void {
    clearSession();
  },
};
