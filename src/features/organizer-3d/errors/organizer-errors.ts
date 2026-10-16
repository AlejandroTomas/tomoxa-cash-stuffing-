import { AppError } from "@/core/errors";

/**
 * El dispositivo o navegador no puede mostrar la escena 3D (sin WebGL o con
 * la GPU bloqueada). Es un caso esperado: la interfaz sigue funcionando sin 3D.
 */
export class WebGLUnavailableError extends AppError {
  constructor(debugMessage = "WebGL no disponible") {
    super("Este dispositivo no puede mostrar la carpeta 3D.", { code: "WEBGL_UNAVAILABLE", debugMessage });
  }
}
