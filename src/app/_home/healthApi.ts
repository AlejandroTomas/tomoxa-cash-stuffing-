import { http } from "@/core/http";

export interface Health {
  status: "ok";
  env: string;
  time: string;
}

/** `/api/health` a través de `core/http`: el mismo camino que cualquier repository. */
export const getHealth = () => http.get<Health>("/api/health");
