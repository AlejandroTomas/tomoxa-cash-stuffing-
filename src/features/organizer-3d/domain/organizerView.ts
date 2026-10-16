import type { EnvelopeId } from "./envelopeView";

/**
 * closed → open ⇄ browsing ⇄ reading
 * - browsing: el sobre salió de la carpeta ya abierto y se ven sus documentos
 *   (tocar un sobre lo saca y lo abre en una sola animación).
 * - reading: un documento está fuera del sobre.
 */
export type Stage = "closed" | "open" | "browsing" | "reading";

export interface OrganizerView {
  stage: Stage;
  /** Sobre fuera de la carpeta (en `browsing` y `reading`). */
  activeId: EnvelopeId | null;
  /** Documento fuera del sobre (solo en `reading`). */
  documentId: string | null;
}

export const initialView: OrganizerView = { stage: "closed", activeId: null, documentId: null };

export type OrganizerAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "OPEN_ENVELOPE"; id: EnvelopeId }
  | { type: "CLOSE_ENVELOPE" }
  | { type: "PICK_DOCUMENT"; id: string }
  | { type: "RETURN_DOCUMENT" };

/** El sobre está fuera de la carpeta (abierto o con un documento fuera). */
export const isEnvelopeOut = (stage: Stage) => stage === "browsing" || stage === "reading";

/**
 * Máquina de estados visual: decide qué animación es válida desde cada estado.
 * Devuelve la misma referencia cuando la acción no aplica. Nunca toca montos.
 */
export function transitionView(view: OrganizerView, action: OrganizerAction): OrganizerView {
  switch (action.type) {
    case "OPEN":
      return view.stage === "closed" ? { ...initialView, stage: "open" } : view;
    case "CLOSE":
      return view.stage === "closed" ? view : initialView;
    case "OPEN_ENVELOPE":
      return view.stage === "open" ? { stage: "browsing", activeId: action.id, documentId: null } : view;
    case "CLOSE_ENVELOPE":
      return view.stage === "browsing" ? { ...initialView, stage: "open" } : view;
    case "PICK_DOCUMENT":
      if (view.stage !== "browsing" && view.stage !== "reading") return view;
      return view.documentId === action.id ? view : { ...view, stage: "reading", documentId: action.id };
    case "RETURN_DOCUMENT":
      return view.stage === "reading" ? { ...view, stage: "browsing", documentId: null } : view;
  }
}

/** Acción de "retroceder un nivel" (Escape, botón atrás) desde cada estado. */
export function backAction(stage: Stage): OrganizerAction | null {
  switch (stage) {
    case "reading":
      return { type: "RETURN_DOCUMENT" };
    case "browsing":
      return { type: "CLOSE_ENVELOPE" };
    case "open":
      return { type: "CLOSE" };
    case "closed":
      return null;
  }
}

export const STAGE_LABELS: Record<Stage, string> = {
  closed: "Cerrada",
  open: "Explorando",
  browsing: "Sobre abierto",
  reading: "Documento fuera",
};
