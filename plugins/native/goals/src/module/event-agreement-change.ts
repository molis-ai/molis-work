import { goalErrors, type GoalErrorCode } from "./errors.js";
import {
  goalEventDecisionPurposes,
  type GoalEventAgreementChange,
  type GoalEventDecisionPurpose,
} from "../contract/goals.js";
import { assertAllowedKeys, requiredText } from "./event-facts-validation.js";

/*
 * A Goal's agreement is its outcome (contract-design §10.9 question 3): the requirements are the platform's,
 * so a change names a new outcome and nothing else.
 */

const CHANGE_KEYS = new Set(["outcome"]);

export interface CanonicalAgreementChange {
  outcome: string | null;
}

export function requiredVersion(
  value: unknown,
  code: GoalErrorCode,
  message: string,
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw goalErrors[code](message, { value });
  }
  return value;
}

export function requiredDecisionPurpose(value: unknown): GoalEventDecisionPurpose {
  if (typeof value !== "string" || !(goalEventDecisionPurposes as readonly string[]).includes(value)) {
    throw goalErrors["goals.event_decision.invalid_purpose"]("决定用途必须是 suggestion、action 或 agreement_change；认可要求在平台的逐项审阅里做");
  }
  return value as GoalEventDecisionPurpose;
}

export function normalizeAgreementChange(raw: GoalEventAgreementChange | undefined): CanonicalAgreementChange {
  const input = raw ?? {};
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw goalErrors["goals.event_agreement.invalid_change"]("约定变更必须是对象");
  }
  assertAllowedKeys(input, CHANGE_KEYS, "约定变更");
  return { outcome: input.outcome == null ? null : requiredText(input.outcome, "goals.event_agreement.outcome_required", "结果说明不能是空文本").trim() };
}

export function toWireChange(change: CanonicalAgreementChange): GoalEventAgreementChange {
  return change.outcome != null ? { outcome: change.outcome } : {};
}

/** Whether a recorded change authorizes exactly this one: the same new outcome. */
export function agreementChangeEquals(recorded: GoalEventAgreementChange | null | undefined, change: CanonicalAgreementChange): boolean {
  if (recorded == null) return false;
  const outcome = recorded.outcome == null ? null : recorded.outcome.trim();
  return outcome === change.outcome;
}

export function isEmptyChange(change: CanonicalAgreementChange, currentOutcome: string): boolean {
  return change.outcome == null || change.outcome === currentOutcome;
}

export function compactChange(change: CanonicalAgreementChange, currentOutcome: string): CanonicalAgreementChange {
  return { outcome: change.outcome != null && change.outcome !== currentOutcome ? change.outcome : null };
}

/** Replacing an outcome that was already agreed needs the person (or their decision for this very change); writing the first one does not. */
export function isProtectedAgreementChange(change: CanonicalAgreementChange, currentOutcome: string): boolean {
  return change.outcome != null && Boolean(currentOutcome) && change.outcome !== currentOutcome;
}
