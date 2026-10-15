import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";

import {
  AppError,
  ConflictError,
  NetworkError,
  NotFoundError,
  PermissionDeniedError,
  ServerError,
  UnauthenticatedError,
  ValidationError,
  type FieldErrors,
} from "@/core/errors";
import { publicEnv } from "@/core/env";
import { clearSession, getSession, setSession } from "@/core/session";
import { isApiResult } from "./api-result";

/**
 * Cliente HTTP del navegador. **Solo lo usan los `repositories/`**: un
 * componente o un service que importa esto está en la capa equivocada.
 *
 * Contrato:
 * - Resuelve con el dato ya desenvuelto: si la respuesta es un `ApiResult`
 *   (`{ ok, data }`) devuelve `data`; si es otra API, devuelve el cuerpo tal cual.
 * - Rechaza SIEMPRE con un `AppError` tipado (`NotFoundError`, `NetworkError`…),
 *   nunca con el error crudo de axios. Excepción: una petición cancelada con
 *   `signal` rechaza con el `CanceledError` de axios (ver `isCanceled`).
 */

export interface HttpClientOptions {
  baseURL?: string;
  /** Adjunta `Authorization: Bearer <token>` de la sesión. Default: true. */
  auth?: boolean;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /**
   * Usar el `message` que manda el servidor como mensaje para el usuario.
   * `true` para la API propia (sus mensajes ya están pensados para el usuario);
   * `false` para APIs externas, cuyos mensajes suelen ser técnicos o en inglés.
   */
  trustServerMessages?: boolean;
  /** Se llama una vez cuando la API responde 401. Default: limpia la sesión. */
  onUnauthorized?: () => void;
}

export type RequestOptions = Pick<
  AxiosRequestConfig,
  "params" | "signal" | "headers" | "timeout" | "responseType"
>;

export interface HttpClient {
  get: <T>(url: string, options?: RequestOptions) => Promise<T>;
  post: <T>(url: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  put: <T>(url: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  patch: <T>(url: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  delete: <T>(url: string, options?: RequestOptions) => Promise<T>;
  /** La instancia de axios, para casos que el contrato no cubre (descargas, uploads con progreso). */
  instance: AxiosInstance;
}

export const isCanceled = (error: unknown): boolean => axios.isCancel(error);

interface ServerBody {
  message?: unknown;
  code?: unknown;
  fieldErrors?: unknown;
}

const asServerBody = (data: unknown): ServerBody =>
  typeof data === "object" && data !== null ? (data as ServerBody) : {};

/** Traduce un error de axios a un `AppError`. Exportado para los tests. */
export function toHttpError(
  error: AxiosError,
  trustServerMessages: boolean,
): AppError {
  const { config, response } = error;
  const target = `${config?.method?.toUpperCase() ?? "?"} ${config?.url ?? "?"}`;

  if (!response) {
    return new NetworkError(undefined, {
      cause: error,
      debugMessage: `${target} sin respuesta (${error.code ?? error.message})`,
    });
  }

  const body = asServerBody(response.data);
  const serverMessage =
    typeof body.message === "string" && body.message.trim()
      ? body.message
      : undefined;
  const message = trustServerMessages ? serverMessage : undefined;
  const options = {
    cause: error,
    code: typeof body.code === "string" ? body.code : undefined,
    debugMessage: `${target} → ${response.status}${serverMessage ? `: ${serverMessage}` : ""}`,
  };

  switch (response.status) {
    case 400:
    case 422:
      return new ValidationError(message, {
        ...options,
        fieldErrors:
          typeof body.fieldErrors === "object" && body.fieldErrors !== null
            ? (body.fieldErrors as FieldErrors)
            : undefined,
      });
    case 401:
      return new UnauthenticatedError(message, options);
    case 403:
      return new PermissionDeniedError(message, options);
    case 404:
      return new NotFoundError(message, options);
    case 409:
      return new ConflictError(message, options);
  }

  if (response.status === 429 || response.status >= 500) {
    return new ServerError(message, options);
  }
  return new AppError(message ?? "No se pudo completar la solicitud.", options);
}

export function createHttpClient({
  baseURL = "",
  auth = true,
  timeoutMs = 30_000,
  headers,
  trustServerMessages = true,
  onUnauthorized = clearSession,
}: HttpClientOptions = {}): HttpClient {
  const instance = axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: { "Content-Type": "application/json", ...headers },
  });

  if (auth) {
    instance.interceptors.request.use((config) => {
      const token = getSession()?.token;
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    // Renovación deslizante: si el servidor manda un token nuevo, se guarda.
    instance.interceptors.response.use((response) => {
      const nextToken = response.headers?.["x-auth-token"];
      const session = getSession();
      if (nextToken && session) {
        setSession({ ...session, token: String(nextToken) });
      }
      return response;
    });
  }

  // Varios 401 simultáneos disparan un solo `onUnauthorized`.
  let unauthorizedHandled = false;

  const request = async <T>(config: AxiosRequestConfig): Promise<T> => {
    try {
      const { data } = await instance.request<unknown>(config);
      unauthorizedHandled = false;
      if (isApiResult(data)) {
        if (data.ok) return data.data as T;
        throw new AppError(
          trustServerMessages ? data.message : "No se pudo completar la solicitud.",
          { code: data.code, debugMessage: `${config.method} ${config.url} → ok:false` },
        );
      }
      return data as T;
    } catch (error) {
      if (error instanceof AppError || isCanceled(error)) throw error;
      if (!axios.isAxiosError(error)) throw error;

      const httpError = toHttpError(error, trustServerMessages);
      if (auth && httpError instanceof UnauthenticatedError && !unauthorizedHandled) {
        unauthorizedHandled = true;
        onUnauthorized();
      }
      throw httpError;
    }
  };

  return {
    get: (url, options) => request({ ...options, url, method: "GET" }),
    post: (url, body, options) => request({ ...options, url, method: "POST", data: body }),
    put: (url, body, options) => request({ ...options, url, method: "PUT", data: body }),
    patch: (url, body, options) => request({ ...options, url, method: "PATCH", data: body }),
    delete: (url, options) => request({ ...options, url, method: "DELETE" }),
    instance,
  };
}

/** Cliente de la API propia. Para una API externa crea otro con `createHttpClient`. */
export const http = createHttpClient({
  baseURL: publicEnv.NEXT_PUBLIC_API_BASE_URL,
});
