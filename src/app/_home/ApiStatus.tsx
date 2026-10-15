"use client";

import { useEffect, useState } from "react";

import { getHealth, type Health } from "./healthApi";

type State = { kind: "loading" } | { kind: "ok"; health: Health } | { kind: "error" };

/** Comprueba de punta a punta: componente → core/http → app/api/health → ApiResult. */
export function ApiStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    getHealth()
      .then((health) => setState({ kind: "ok", health }))
      .catch(() => setState({ kind: "error" }));
  }, []);

  const dot = state.kind === "ok" ? "bg-primary" : state.kind === "error" ? "bg-destructive" : "bg-muted-foreground animate-pulse";
  const text =
    state.kind === "ok"
      ? `API en línea · ${state.health.env}`
      : state.kind === "error"
        ? "API sin respuesta"
        : "Comprobando API…";

  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
      {text}
    </span>
  );
}
