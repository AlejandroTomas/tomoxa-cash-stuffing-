import { ValidationError } from "@/core/errors";

/** Un problema de reglas del libro (ver `domain/validation.ts` y `domain/envelopes.ts`). */
export interface RuleIssue {
  code: string;
  /** Campo del formulario, o "form" si es del formulario completo. */
  field: string;
  message: string;
}

/**
 * errors/: excepciones del libro. `message` siempre es seguro para el usuario;
 * `fieldErrors` señala el campo del formulario.
 */
export class LedgerRuleError extends ValidationError {
  constructor(issue: RuleIssue) {
    super(issue.message, { code: issue.code, fieldErrors: issue.field === "form" ? undefined : { [issue.field]: issue.message } });
  }
}
