// Lado cliente. Los helpers de Route Handlers se importan desde "@/core/http/server".
export { http, createHttpClient, isCanceled } from "./client";
export type { HttpClient, HttpClientOptions, RequestOptions } from "./client";
export * from "./api-result";
