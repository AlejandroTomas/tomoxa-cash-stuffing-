import type { Session } from "@/core/session";
import { createAsyncThunkWithErrorHandling } from "@/store/utils/createAsyncThunkWithErrorHandling";
import type { LoginDto } from "../dto/login.dto";
import { authService } from "../services/auth.service";

/**
 * `silent`: el error del login se muestra dentro del formulario (es lo que el
 * usuario está mirando), no en el panel de alertas.
 */
export const login = createAsyncThunkWithErrorHandling<Session, LoginDto>(
  "auth/login",
  (dto) => authService.login(dto),
  { silent: true },
);
