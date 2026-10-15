import { http } from "@/core/http";
import type { Session } from "@/core/session";
import type { LoginDto } from "../dto/login.dto";

export const authRepository = {
  login: (dto: LoginDto) => http.post<Session>("/api/auth/login", dto),
};
