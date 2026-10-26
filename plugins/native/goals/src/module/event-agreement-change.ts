import { canonicalJsonValue as canonicalize } from "@molis-ai/molis-work-plugin-sdk";
import { goalErrors, type GoalErrorCode } from "./errors.js";
import {
  goalEventDecisionPurposes,
  type GoalEventAgreementChange,
  type GoalEventDecisionPurpose,
  type GoalEventExtraRequirementInput,
  type GoalEventRequirementRevisionInput,
  type GoalEventRequirementStatus,
} from "@molis-ai/molis-work-contracts/modules/goals";
import {
  assertAllowedKeys,
  assertConfigText,
  normalizeNewRequirement,
  requiredText,
} from "./event-facts-validation.js";

const CHANGE_KEYS = new Set(["outcome", "new_requirements", "revise_requirements", "retire_requirement_ids"]);
const REVISE_KEYS = new Set(["requirement_id", "statement", "human_decision_required"]);

export interface CanonicalAgreementChange {
  outcome: string | null;
  new_requirements: GoalEventExtraRequirementInput[];
  revise_requirements: Array<{
    requirement_id: string;
    statement?: string;
    human_decision_required?: boolean;
  }>;
  retire_requirement_ids: string[];
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
    throw goalErrors["goals.event_decision.invalid_purpose"]("决定用途必须是 suggestion、requirement_acceptance、action 或 agreement_change");
  }
  return value as GoalEventDecisionPurpose;
}

export function normalizeAgreementChange(
  raw: GoalEventAgreementChange | undefined,
): CanonicalAgreementChange {
  const input = raw ?? {};
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw goalErrors["goals.event_agreement.invalid_change"]("约定变更必须是对象");
  }
  assertAllowedKeys(input, CHANGE_KEYS, "约定变更");
  const outcome = input.outcome == null ? null : requiredText(input.outcome, "goals.event_agreement.outcome_required", "结果说明不能是空文本").trim();
  const newRequirements = normalizeNewRequirementList(input.new_requirements);
  const reviseRequirements = normalizeRevisions(input.revise_requirements);
  const retireIds = uniqueIds(input.retire_requirement_ids, "goals.event_agreement.duplicate_retire");
  return {
    outcome,
    new_requirements: newRequirements,
    revise_requirements: reviseRequirements,
    retire_requirement_ids: retireIds,
  };
}

export function changeFromAgreementInput(input: {
  outcome?: string;
  new_requirements?: GoalEventExtraRequirementInput[];
  revise_requirements?: GoalEventRequirementRevisionInput[];
  retire_requirement_ids?: string[];
}): GoalEventAgreementChange {
  return {
    ...(input.outcome != null ? { outcome: input.outcome } : {}),
    ...(input.new_requirements?.length ? { new_requirements: input.new_requirements } : {}),
    ...(input.revise_requirements?.length ? { revise_requirements: input.revise_requirements } : {}),
    ...(input.retire_requirement_ids?.length ? { retire_requirement_ids: input.retire_requirement_ids } : {}),
  };
}

export function toWireChange(change: CanonicalAgreementChange): GoalEventAgreementChange {
  return {
    ...(change.outcome != null ? { outcome: change.outcome } : {}),
    ...(change.new_requirements.length ? { new_requirements: change.new_requirements } : {}),
    ...(change.revise_requirements.length ? { revise_requirements: change.revise_requirements } : {}),
    ...(change.retire_requirement_ids.length ? { retire_requirement_ids: change.retire_requirement_ids } : {}),
  };
}

export function businessDelta(change: CanonicalAgreementChange): GoalEventAgreementChange {
  return toWireChange(change);
}

export function agreementChangeEquals(
  left: CanonicalAgreementChange | GoalEventAgreementChange | null | undefined,
  right: CanonicalAgreementChange | GoalEventAgreementChange | null | undefined,
): boolean {
  const one = normalizeAgreementChange(asWireChange(left));
  const two = normalizeAgreementChange(asWireChange(right));
  return JSON.stringify(canonicalize(businessDelta(one))) === JSON.stringify(canonicalize(businessDelta(two)));
}

function asWireChange(
  value: CanonicalAgreementChange | GoalEventAgreementChange | null | undefined,
): GoalEventAgreementChange {
  if (value == null) return {};
  const candidate = value as CanonicalAgreementChange;
  if (
    Array.isArray(candidate.new_requirements)
    && Array.isArray(candidate.revise_requirements)
    && Array.isArray(candidate.retire_requirement_ids)
  ) {
    return toWireChange(candidate);
  }
  return value as GoalEventAgreementChange;
}

export function isEmptyChange(change: CanonicalAgreementChange, currentOutcome: string): boolean {
  const outcomeChanged = change.outcome != null && change.outcome !== currentOutcome;
  return !outcomeChanged
    && change.new_requirements.length === 0
    && change.revise_requirements.length === 0
    && change.retire_requirement_ids.length === 0;
}

function actualRevisions(
  change: CanonicalAgreementChange,
  requirements: GoalEventRequirementStatus[],
): CanonicalAgreementChange["revise_requirements"] {
  const byId = new Map(requirements.map((item) => [item.requirement_id, item]));
  return change.revise_requirements.filter((revision) => {
    const current = byId.get(revision.requirement_id);
    if (!current) return true;
    if (revision.statement != null && revision.statement !== current.statement) return true;
    if (revision.human_decision_required != null && revision.human_decision_required !== current.human_decision_required) {
      return true;
    }
    return false;
  });
}

export function compactChange(
  change: CanonicalAgreementChange,
  requirements: GoalEventRequirementStatus[],
  currentOutcome: string,
): CanonicalAgreementChange {
  const outcome = change.outcome != null && change.outcome !== currentOutcome ? change.outcome : null;
  return {
    outcome,
    new_requirements: change.new_requirements,
    revise_requirements: actualRevisions(change, requirements),
    retire_requirement_ids: change.retire_requirement_ids,
  };
}

export function isProtectedAgreementChange(
  change: CanonicalAgreementChange,
  requirements: GoalEventRequirementStatus[],
  currentOutcome: string,
): boolean {
  if (change.outcome != null && currentOutcome && change.outcome !== currentOutcome) return true;
  if (change.retire_requirement_ids.length) return true;
  const byId = new Map(requirements.map((item) => [item.requirement_id, item]));
  for (const revision of change.revise_requirements) {
    const current = byId.get(revision.requirement_id);
    if (!current) continue;
    if (revision.statement != null && revision.statement !== current.statement) return true;
    if (revision.human_decision_required === false && current.human_decision_required) return true;
  }
  return false;
}

export function expireRequirementIds(
  change: CanonicalAgreementChange,
  requirements: GoalEventRequirementStatus[],
  currentOutcome: string,
): string[] {
  if (change.outcome != null && currentOutcome) {
    return [...new Set(requirements.map((item) => item.requirement_id))];
  }
  const byId = new Map(requirements.map((item) => [item.requirement_id, item]));
  const ids: string[] = [];
  for (const revision of change.revise_requirements) {
    const current = byId.get(revision.requirement_id);
    if (!current) continue;
    const statementChanged = revision.statement != null && revision.statement !== current.statement;
    const humanChanged = revision.human_decision_required != null
      && revision.human_decision_required !== current.human_decision_required;
    if (statementChanged || humanChanged) ids.push(revision.requirement_id);
  }
  return [...new Set(ids)];
}

export function affectedExistingRequirementIds(change: CanonicalAgreementChange): string[] {
  return [...new Set([
    ...change.revise_requirements.map((item) => item.requirement_id),
    ...change.retire_requirement_ids,
  ])];
}

function normalizeNewRequirementList(
  items: GoalEventExtraRequirementInput[] | undefined,
): GoalEventExtraRequirementInput[] {
  if (items == null) return [];
  if (!Array.isArray(items)) throw goalErrors["goals.event_agreement.invalid_change"]("新增要求必须是列表");
  const seen = new Set<string>();
  return items.map((item) => {
    const normalized = normalizeNewRequirement(item);
    if (seen.has(normalized.requirement_id)) {
      throw goalErrors["goals.event_config.duplicate_requirement"](`同一配置不能重复新增要求: ${normalized.requirement_id}`);
    }
    seen.add(normalized.requirement_id);
    return normalized;
  });
}

function normalizeRevisions(
  items: GoalEventRequirementRevisionInput[] | undefined,
): CanonicalAgreementChange["revise_requirements"] {
  if (items == null) return [];
  if (!Array.isArray(items)) throw goalErrors["goals.event_agreement.invalid_change"]("修订要求必须是列表");
  const seen = new Set<string>();
  return items.map((item, index) => {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      throw goalErrors["goals.event_agreement.invalid_change"](`第 ${index + 1} 条修订必须是对象`);
    }
    assertAllowedKeys(item, REVISE_KEYS, `修订 ${index + 1}`);
    const requirementId = requiredText(item.requirement_id, "goals.event_config.requirement_id_required", "修订要求必须有稳定 ID").trim();
    if (seen.has(requirementId)) {
      throw goalErrors["goals.event_agreement.duplicate_revision"](`同一请求不能重复修订要求: ${requirementId}`);
    }
    seen.add(requirementId);
    if (item.statement == null && item.human_decision_required == null) {
      throw goalErrors["goals.event_agreement.revision_empty"](`修订 ${requirementId} 需要 statement 或 human_decision_required`);
    }
    if (item.human_decision_required != null && typeof item.human_decision_required !== "boolean") {
      throw goalErrors["goals.event_config.invalid_human_decision_required"](`要求 ${requirementId} 的 human_decision_required 必须是布尔值`);
    }
    return {
      requirement_id: requirementId,
      ...(item.statement != null
        ? { statement: assertConfigText(requiredText(item.statement, "goals.event_config.requirement_statement_required", "修订要求必须说明具体结果").trim(), "修订要求") }
        : {}),
      ...(item.human_decision_required != null ? { human_decision_required: item.human_decision_required } : {}),
    };
  });
}

function uniqueIds(values: string[] | undefined, duplicateCode: GoalErrorCode): string[] {
  if (values == null) return [];
  if (!Array.isArray(values)) throw goalErrors["goals.event_agreement.invalid_change"]("退休要求必须是 ID 列表");
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of values) {
    const id = requiredText(value, "goals.event_config.requirement_id_required", "退休要求必须有稳定 ID").trim();
    if (seen.has(id)) throw goalErrors[duplicateCode](`同一请求不能重复退休要求: ${id}`);
    seen.add(id);
    ids.push(id);
  }
  return ids.sort();
}
