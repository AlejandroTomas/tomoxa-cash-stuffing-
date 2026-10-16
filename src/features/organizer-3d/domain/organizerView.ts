import type { EnvelopeId } from "./envelopeView";

/**
 * closed → open → focused ⇄ extracted ⇄ browsing ⇄ reading
 * - browsing: el sobre extraído está abierto y se ven sus documentos.
 * - reading: un documento está fuera del sobre.
 */
export type Stage = "closed" | "open" | "focused" | "extracted" | "browsing" | "reading";

export interface OrganizerView {
  stage: Stage;
  activeId: EnvelopeId | null;
  /** Documento fuera del sobre (solo en `reading`). */
  documentId: string | null;
}

export const initialView: OrganizerView = { stage: "closed", activeId: null, documentId: null };

export type OrganizerAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "FOCUS"; id: EnvelopeId }
  | { type: "EXTRACT" }
  | { type: "RETURN" }
  | { type: "CLEAR_FOCUS" }
  | { type: "OPEN_ENVELOPE" }
  | { type: "CLOSE_ENVELOPE" }
  | { type: "PICK_DOCUMENT"; id: string }
  | { type: "RETURN_DOCUMENT" };

/** El sobre está fuera de la carpeta (extraído, abierto o con un documento fuera). */
export const isEnvelopeOut = (stage: Stage) => stage === "extracted" || stage === "browsing" || stage === "reading";

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
    case "FOCUS":
      if (view.stage === "closed" || isEnvelopeOut(view.stage)) return view;
      return view.activeId === action.id ? view : { stage: "focused", activeId: action.id, documentId: null };
    case "EXTRACT":
      return view.stage === "focused" && view.activeId ? { ...view, stage: "extracted" } : view;
    case "RETURN":
      return view.stage === "extracted" ? { ...view, stage: "focused" } : view;
    case "CLEAR_FOCUS":
      return view.stage === "focused" ? { ...initialView, stage: "open" } : view;
    case "OPEN_ENVELOPE":
      return view.stage === "extracted" ? { ...view, stage: "browsing" } : view;
    case "CLOSE_ENVELOPE":
      return view.stage === "browsing" ? { ...view, stage: "extracted" } : view;
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
    case "extracted":
      return { type: "RETURN" };
    case "focused":
      return { type: "CLEAR_FOCUS" };
    case "open":
      return { type: "CLOSE" };
    case "closed":
      return null;
  }
}

export const STAGE_LABELS: Record<Stage, string> = {
  closed: "Cerrada",
  open: "Explorando",
  focused: "Sobre enfocado",
  extracted: "Sobre extraído",
  browsing: "Sobre abierto",
  reading: "Documento fuera",
};
