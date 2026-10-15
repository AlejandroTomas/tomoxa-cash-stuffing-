import type { EnvelopeId } from "../mocks/envelopes.mock";

export type Stage = "closed" | "open" | "focused" | "extracted";
export interface OrganizerView {
  stage: Stage;
  activeId: EnvelopeId | null;
}

export const initialView: OrganizerView = { stage: "closed", activeId: null };

export type OrganizerAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "FOCUS"; id: EnvelopeId }
  | { type: "EXTRACT" }
  | { type: "RETURN" }
  | { type: "CLEAR_FOCUS" };

/**
 * Máquina de estados visual: decide qué animación es válida desde cada estado.
 * Devuelve la misma referencia cuando la acción no aplica. Nunca toca montos.
 */
export function transitionView(view: OrganizerView, action: OrganizerAction): OrganizerView {
  switch (action.type) {
    case "OPEN":
      return view.stage === "closed" ? { stage: "open", activeId: null } : view;
    case "CLOSE":
      return view.stage === "closed" ? view : initialView;
    case "FOCUS":
      if (view.stage === "closed" || view.stage === "extracted") return view;
      return view.activeId === action.id ? view : { stage: "focused", activeId: action.id };
    case "EXTRACT":
      return view.stage === "focused" && view.activeId ? { ...view, stage: "extracted" } : view;
    case "RETURN":
      return view.stage === "extracted" ? { ...view, stage: "focused" } : view;
    case "CLEAR_FOCUS":
      return view.stage === "focused" ? { stage: "open", activeId: null } : view;
  }
}

export const STAGE_LABELS: Record<Stage, string> = {
  closed: "Cerrada",
  open: "Explorando",
  focused: "Sobre enfocado",
  extracted: "Sobre extraído",
};
