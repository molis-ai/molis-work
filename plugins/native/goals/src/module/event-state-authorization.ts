import { canonicalJsonValue as canonicalizeValue } from "@molis-ai/molis-work-plugin-sdk";
import { goalErrors, type GoalErrorCode } from "./errors.js";
import {
  goalEventClosureKinds,
  goalEventConcernActions,
  goalEventNewDecisionEffectKinds,
  type GoalEventAgreementChange,
  type GoalEventAppliedDecisionView,
  type GoalEventClosureKind,
  type GoalEventConcernAction,
  type GoalEventDecisionCommitment,
  type GoalEventDecisionEffect,
  type GoalEventDecisionRequestView,
  type GoalEventRequirementCommitment,
  type GoalEventScope,
  type RecordGoalUserDecisionInput,
} from "../contract/goals.js";
import type { GoalRequirementTerm } from "./event-facts-requirements.js";
import { emptyScope, scopeIsSubset } from "./event-state-scope.js";

function requiredEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  code: GoalErrorCode,
  message: string,
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw goalErrors[code](message, { value });
  }
  return value as T;
}

export function requiredConcernAction(value: unknown): GoalEventConcernAction {
  return requiredEnum(
    value,
    goalEventConcernActions,
    "goals.event_concern.invalid_action",
    "Concern 动作只能是 open、resolve、accept 或 overturn",
  );
}

export function requiredClosureKind(value: unknown): GoalEventClosureKind {
  return requiredEnum(
    value,
    goalEventClosureKinds,
    "goals.event_closure.invalid_kind",
    "收尾类型只能是 complete 或 cancel",
  );
}

/**
 * A decision's effects: the ones it states, or, without any, a yes or no to the concerns and the action its scope names. A requirement
 * is accepted or returned on the platform's per-item review now (contract-design §10.3), so no decision recorded here has an effect on
 * one, and a decision whose scope names requirements and nothing else decides nothing.
 */
function normalizeTrustedDecision(
  input: { accepts_requirements?: boolean; effects?: GoalEventDecisionEffect[] },
  scope: GoalEventScope,
): { effects: GoalEventDecisionEffect[]; accepts_requirements: boolean } {
  if (Array.isArray(input.effects) && input.effects.length > 0) {
    const effects = normalizeEffects(input.effects);
    assertEffectsMatchScope(effects, scope);
    return { effects, accepts_requirements: input.accepts_requirements === true };
  }
  const effects: GoalEventDecisionEffect[] = [];
  if (input.accepts_requirements === true) {
    if (scope.concern_ids.length) effects.push({ kind: "accept_concerns" });
    if (scope.action) effects.push({ kind: "authorize_action", action: scope.action });
  } else {
    if (scope.concern_ids.length) effects.push({ kind: "reject_concerns" });
    if (scope.action) effects.push({ kind: "deny_action", action: scope.action });
  }
  if (!effects.length && scope.requirement_ids.length) {
    throw goalErrors["goals.event_decision.effect_scope_mismatch"]("认可或退回要求在平台的逐项审阅里做，这里的决定只管问题、动作和结果说明");
  }
  return { effects, accepts_requirements: input.accepts_requirements === true };
}

function comparableDecisionKey(scope: GoalEventScope): string {
  return JSON.stringify({
    action: scope.action,
    requirement_ids: [...scope.requirement_ids].sort(),
    concern_ids: [...scope.concern_ids].sort(),
    event_ids: [...scope.event_ids].sort(),
  });
}

export function currentActionDecision(
  decisions: GoalEventAppliedDecisionView[],
  action: string,
): GoalEventAppliedDecisionView | null {
  let current: GoalEventAppliedDecisionView | null = null;
  for (const decision of decisions) {
    if (decision.scope.action === action) current = decision;
  }
  return current;
}

export function currentEffectiveDecisions(
  decisions: GoalEventAppliedDecisionView[],
): GoalEventAppliedDecisionView[] {
  const latest = new Map<string, GoalEventAppliedDecisionView>();
  for (const decision of decisions) {
    latest.set(comparableDecisionKey(decision.scope), decision);
  }
  const currentIds = new Set([...latest.values()].map((decision) => decision.decision_id));
  return decisions.filter((decision) => currentIds.has(decision.decision_id));
}

export function laterComparableDecision(
  decisions: GoalEventAppliedDecisionView[],
  cited: GoalEventAppliedDecisionView,
): GoalEventAppliedDecisionView | null {
  const key = comparableDecisionKey(cited.scope);
  let seenCited = false;
  let later: GoalEventAppliedDecisionView | null = null;
  for (const decision of decisions) {
    if (decision.decision_id === cited.decision_id) {
      seenCited = true;
      continue;
    }
    if (!seenCited) continue;
    if (comparableDecisionKey(decision.scope) === key) later = decision;
  }
  return later;
}

export function decisionHasEffect(
  decision: { effects: GoalEventDecisionEffect[] },
  kind: GoalEventDecisionEffect["kind"],
  action?: string | null,
): boolean {
  return decision.effects.some((effect) => {
    if (effect.kind !== kind) return false;
    if (action == null) return true;
    return (effect.action ?? null) === action;
  });
}

export function decisionCoversConcern(
  decision: GoalEventAppliedDecisionView,
  concern: { concern_id: string; scope: GoalEventScope },
): boolean {
  if (emptyScope(decision.scope)) return false;
  if (decision.scope.concern_ids.includes(concern.concern_id)) return true;
  const concernScope: GoalEventScope = {
    requirement_ids: concern.scope.requirement_ids,
    event_ids: [],
    concern_ids: [concern.concern_id],
    action: concern.scope.action,
  };
  return scopeIsSubset(concernScope, decision.scope);
}

export function snapshotCommitment(
  requirements: GoalRequirementTerm[],
  outcome: string,
  scope: GoalEventScope,
  effects: GoalEventDecisionEffect[],
): GoalEventDecisionCommitment {
  const scoped = commitsToWholeAgreement(scope, effects)
    ? requirements
    : scope.requirement_ids.length
      ? requirements.filter((item) => scope.requirement_ids.includes(item.requirement_id))
      : [];
  return {
    outcome,
    requirements: scoped.map(requirementCommitment),
  };
}

/**
 * Completing (and, in a decision recorded before batch 44, accepting requirements) is the person's nod for the agreement as a whole: the
 * project's approval rule counts it for the agreement it was given for, so such a decision commits to every requirement there is now,
 * not only to the ones its scope names.
 */
function commitsToWholeAgreement(scope: GoalEventScope, effects: GoalEventDecisionEffect[]): boolean {
  return scopeAppliesToComplete(scope) || effects.some((effect) => effect.kind === "accept_requirements");
}

/** What approving an agreement change commits to: the outcome it replaces (an agreement is its outcome, §10.9 question 3). */
export function snapshotAgreementChangeCommitment(currentOutcome: string): GoalEventDecisionCommitment {
  return { outcome: currentOutcome, requirements: [] };
}

/**
 * Whether what an agreement-change decision committed to still stands: the outcome it replaced is the current one, and the requirements
 * a decision recorded before batch 44 also named (when it changed requirements with the outcome) read now as they did then. `terms` is
 * asked only for such a decision.
 */
export function agreementChangeCommitmentCurrent(
  recorded: GoalEventDecisionCommitment | null | undefined,
  terms: () => GoalRequirementTerm[],
  currentOutcome: string,
): boolean {
  if (!recorded || recorded.outcome !== currentOutcome) return false;
  if (!recorded.requirements.length) return true;
  return commitmentsMatch(recorded, currentCommitment(terms(), currentOutcome, recorded.requirements.map((item) => item.requirement_id)));
}

function requirementCommitment(requirement: GoalRequirementTerm): GoalEventRequirementCommitment {
  return {
    requirement_id: requirement.requirement_id,
    statement: requirement.statement,
    human_decision_required: requirement.human_decision_required,
    bound_type_ids: [...requirement.bound_type_ids].sort(),
  };
}

function currentCommitment(
  requirements: GoalRequirementTerm[],
  outcome: string,
  requirementIds: string[],
): GoalEventDecisionCommitment {
  const wanted = new Set(requirementIds);
  return {
    outcome,
    requirements: requirements.filter((item) => wanted.has(item.requirement_id)).map(requirementCommitment),
  };
}

function commitmentsMatch(left: GoalEventDecisionCommitment, right: GoalEventDecisionCommitment): boolean {
  if (left.outcome !== right.outcome) return false;
  if (left.requirements.length !== right.requirements.length) return false;
  const byId = new Map(right.requirements.map((item) => [item.requirement_id, item]));
  for (const item of left.requirements) {
    const other = byId.get(item.requirement_id);
    if (!other) return false;
    if (item.statement !== other.statement) return false;
    if (item.human_decision_required !== other.human_decision_required) return false;
    if (item.bound_type_ids.join("\0") !== other.bound_type_ids.join("\0")) return false;
  }
  return true;
}

/**
 * Whether the decision was given for the agreement as it stands: the same outcome and the same requirements, each with the same
 * text, user-acceptance flag and bound event types.
 */
export function decisionCommitsToCurrentAgreement(
  decision: GoalEventAppliedDecisionView,
  requirements: GoalRequirementTerm[],
  outcome: string,
): boolean {
  return commitmentsMatch(
    decision.commitment,
    currentCommitment(requirements, outcome, requirements.map((item) => item.requirement_id)),
  );
}

export function scopedRequirementCommitmentsMatch(
  decision: GoalEventAppliedDecisionView,
  requirements: GoalRequirementTerm[],
): boolean {
  const ids = decision.scope.requirement_ids;
  if (!ids.length) return true;
  const current = currentCommitment(requirements, "", ids).requirements;
  // A decision that commits to the whole agreement is reused on the requirements its scope names, not on the rest of it.
  const recorded = commitsToWholeAgreement(decision.scope, decision.effects)
    ? decision.commitment.requirements.filter((item) => ids.includes(item.requirement_id))
    : decision.commitment.requirements;
  if (!recorded.length) {
    return ids.every((id) => requirements.some((item) => item.requirement_id === id));
  }
  return commitmentsMatch({ outcome: "", requirements: recorded }, { outcome: "", requirements: current });
}

function scopeAppliesToComplete(scope: GoalEventScope): boolean {
  return scope.action === "complete";
}

/** Whether a waiting request holds completion back: one about completing does; whether the requirements are met is the platform's. */
export function pendingBlocksCompletion(pending: { purpose?: string; scope: GoalEventScope }): boolean {
  if (pending.purpose === "suggestion" || pending.purpose === "agreement_change" || pending.purpose === "requirement_acceptance") return false;
  return scopeAppliesToComplete(pending.scope);
}

function assertEffectsMatchScope(
  effects: GoalEventDecisionEffect[],
  scope: GoalEventScope,
): void {
  for (const effect of effects) {
    if (effect.kind === "accept_concerns" || effect.kind === "reject_concerns") {
      if (scope.concern_ids.length === 0) {
        throw goalErrors["goals.event_decision.effect_scope_mismatch"]("Concern 效果必须声明适用的 concern_ids");
      }
      continue;
    }
    if (effect.kind === "authorize_agreement_change") continue;
    if (!scope.action || effect.action !== scope.action) {
      throw goalErrors["goals.event_decision.effect_scope_mismatch"]("动作效果必须匹配声明的 scope.action，不能把授权扩大到范围之外");
    }
  }
}

export function resolveRecordedDecision(
  input: Pick<RecordGoalUserDecisionInput, "accepts_requirements" | "effects" | "authorized_change" | "scope">,
  request: GoalEventDecisionRequestView | null,
  scope: GoalEventScope,
): { effects: GoalEventDecisionEffect[]; accepts_requirements: boolean; authorized_change: GoalEventAgreementChange | null; scope: GoalEventScope } {
  if (request?.purpose === "agreement_change") {
    const proposed = request.proposed_change;
    if (!proposed) {
      throw goalErrors["goals.event_decision.missing_proposed_change"]("约定变更请求必须带有可审阅的具体变化");
    }
    // A request made before batch 44 that also changed requirements cannot be approved: requirements are changed on the platform now.
    if (proposed.new_requirements?.length || proposed.revise_requirements?.length || proposed.retire_requirement_ids?.length) {
      throw goalErrors["goals.event_decision.stale_commitment"]("这份请求还改了要求；要求现在在平台的要求栏里改，请重新提出只改结果说明的请求");
    }
    const callerEffects = Array.isArray(input.effects) ? input.effects : [];
    const denyAction = request.scope.action || "set_agreement";
    const authorize = callerEffects.some((effect) => effect.kind === "authorize_agreement_change");
    const deny = callerEffects.some((effect) => effect.kind === "deny_action" && effect.action === denyAction);
    const extra = callerEffects.filter((effect) => {
      if (effect.kind === "authorize_agreement_change") return false;
      if (effect.kind === "deny_action" && effect.action === denyAction) return false;
      return true;
    });
    if (extra.length) {
      throw goalErrors["goals.event_decision.effect_widened"]("批准约定变更时不能附加请求里没有的效果或另一份变化");
    }
    if (authorize && deny) {
      throw goalErrors["goals.event_decision.effect_conflict"]("不能同时批准和拒绝同一份约定变更");
    }
    if (input.scope && (input.scope.requirement_ids?.length || input.scope.event_ids?.length || input.scope.concern_ids?.length || input.scope.action)) {
      if (!scopeIsSubset(scope, request.scope) || !scopeIsSubset(request.scope, scope)) {
        throw goalErrors["goals.event_decision.scope_expanded"]("批准约定变更时不能替换请求中的范围");
      }
    }
    const accepts = input.accepts_requirements === true || authorize;
    if (accepts) {
      if (deny) {
        throw goalErrors["goals.event_decision.effect_conflict"]("不能同时批准和拒绝同一份约定变更");
      }
      if (input.authorized_change) {
        const left = JSON.stringify(canonicalizeValue(input.authorized_change));
        const right = JSON.stringify(canonicalizeValue(proposed));
        if (left !== right) {
          throw goalErrors["goals.event_decision.change_mismatch"]("批准时的约定变化必须与请求中的具体变化一致，不能加宽或替换");
        }
      }
      return {
        effects: [{ kind: "authorize_agreement_change" }],
        accepts_requirements: false,
        authorized_change: proposed,
        scope: request.scope,
      };
    }
    return {
      effects: [{ kind: "deny_action", action: denyAction }],
      accepts_requirements: false,
      authorized_change: null,
      scope: request.scope,
    };
  }
  const normalized = normalizeTrustedDecision(input, scope);
  if (normalized.effects.some((effect) => effect.kind === "authorize_agreement_change")) {
    if (!input.authorized_change) {
      throw goalErrors["goals.event_decision.missing_proposed_change"]("授权约定变更必须带上可审阅的具体变化");
    }
    return { ...normalized, authorized_change: input.authorized_change, scope };
  }
  return { ...normalized, authorized_change: null, scope };
}

function normalizeEffects(effects: GoalEventDecisionEffect[]): GoalEventDecisionEffect[] {
  const normalized: GoalEventDecisionEffect[] = [];
  const seen = new Set<string>();
  for (const raw of effects) {
    const kind = requiredEnum(
      raw?.kind,
      goalEventNewDecisionEffectKinds,
      "goals.event_decision.invalid_effect",
      "决定效果必须是有限的明确授权，不能从结论或选项猜测；认可或退回要求在平台的逐项审阅里做",
    );
    const action = raw.action?.trim() || null;
    if ((kind === "authorize_action" || kind === "deny_action") && !action) {
      throw goalErrors["goals.event_decision.invalid_effect"]("动作授权必须写明具体动作");
    }
    const key = `${kind}:${action ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(kind === "authorize_action" || kind === "deny_action" ? { kind, action } : { kind });
  }
  return normalized;
}
