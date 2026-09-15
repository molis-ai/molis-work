import {
  goalEventClosureKinds,
  goalEventConcernActions,
  goalEventDecisionEffectKinds,
  type GoalEventAgreementChange,
  type GoalEventAppliedDecisionView,
  type GoalEventClosureKind,
  type GoalEventConcernAction,
  type GoalEventDecisionCommitment,
  type GoalEventDecisionEffect,
  type GoalEventDecisionRequestView,
  type GoalEventRequirementCommitment,
  type GoalEventRequirementStatus,
  type GoalEventScope,
  type RecordGoalUserDecisionInput,
} from "@molis-ai/molis-work-contracts/modules/goals";
import {
  affectedExistingRequirementIds,
  type CanonicalAgreementChange,
} from "./event-agreement-change.js";
import { emptyScope, scopeIsSubset } from "./event-state-repository.js";

type StateError = (code: string, message: string, details?: Record<string, unknown>) => Error;

export function requiredEnum<T extends string>(
  error: StateError,
  value: unknown,
  allowed: readonly T[],
  code: string,
  message: string,
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw error(code, message, { value });
  }
  return value as T;
}

export function requiredConcernAction(error: StateError, value: unknown): GoalEventConcernAction {
  return requiredEnum(
    error,
    value,
    goalEventConcernActions,
    "event_concern.invalid_action",
    "Concern 动作只能是 open、resolve、accept 或 overturn",
  );
}

export function requiredClosureKind(error: StateError, value: unknown): GoalEventClosureKind {
  return requiredEnum(
    error,
    value,
    goalEventClosureKinds,
    "event_closure.invalid_kind",
    "收尾类型只能是 complete 或 cancel",
  );
}

export function resolveDecisionEffects(
  error: StateError,
  input: { accepts_requirements?: boolean; effects?: GoalEventDecisionEffect[] },
  scope: GoalEventScope,
): GoalEventDecisionEffect[] {
  return normalizeTrustedDecision(error, input, scope).effects;
}

export function normalizeTrustedDecision(
  error: StateError,
  input: { accepts_requirements?: boolean; effects?: GoalEventDecisionEffect[] },
  scope: GoalEventScope,
): { effects: GoalEventDecisionEffect[]; accepts_requirements: boolean } {
  if (Array.isArray(input.effects) && input.effects.length > 0) {
    const effects = normalizeEffects(error, input.effects);
    assertEffectsMatchScope(error, effects, scope);
    const derived = effects.some((effect) => effect.kind === "accept_requirements");
    if (input.accepts_requirements === true && !derived) {
      throw error("event_decision.effect_conflict", "显式效果与 accepts_requirements 互相矛盾，不能各写各的");
    }
    if (input.accepts_requirements === false && derived) {
      throw error("event_decision.effect_conflict", "显式效果与 accepts_requirements 互相矛盾，不能各写各的");
    }
    return { effects, accepts_requirements: derived };
  }
  const effects: GoalEventDecisionEffect[] = [];
  if (input.accepts_requirements === true) {
    if (scope.requirement_ids.length) effects.push({ kind: "accept_requirements" });
    if (scope.concern_ids.length) effects.push({ kind: "accept_concerns" });
    if (scope.action) effects.push({ kind: "authorize_action", action: scope.action });
  } else {
    if (scope.requirement_ids.length) effects.push({ kind: "reject_requirements" });
    if (scope.concern_ids.length) effects.push({ kind: "reject_concerns" });
    if (scope.action) effects.push({ kind: "deny_action", action: scope.action });
  }
  return { effects, accepts_requirements: input.accepts_requirements === true };
}

export function comparableDecisionKey(scope: GoalEventScope): string {
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

export function decisionCoversScope(decision: GoalEventAppliedDecisionView, target: GoalEventScope): boolean {
  if (emptyScope(decision.scope)) return false;
  return scopeIsSubset(target, decision.scope);
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
  requirements: GoalEventRequirementStatus[],
  outcome: string,
  scope: GoalEventScope,
): GoalEventDecisionCommitment {
  const scoped = scope.requirement_ids.length
    ? requirements.filter((item) => scope.requirement_ids.includes(item.requirement_id))
    : [];
  return {
    outcome,
    requirements: scoped.map(requirementCommitment),
  };
}

export function snapshotAgreementChangeCommitment(
  change: CanonicalAgreementChange,
  requirements: GoalEventRequirementStatus[],
  currentOutcome: string,
): GoalEventDecisionCommitment {
  const ids = new Set(affectedExistingRequirementIds(change));
  if (change.outcome != null && currentOutcome) {
    for (const item of requirements) ids.add(item.requirement_id);
  }
  return currentCommitment(requirements, currentOutcome, [...ids]);
}

export function agreementChangeCommitmentCurrent(
  recorded: GoalEventDecisionCommitment | null | undefined,
  requirements: GoalEventRequirementStatus[],
  currentOutcome: string,
  change: CanonicalAgreementChange,
): boolean {
  if (!recorded) return false;
  if (recorded.outcome !== currentOutcome) return false;
  const affected = new Set(affectedExistingRequirementIds(change));
  if (change.outcome != null && currentOutcome) {
    for (const item of requirements) affected.add(item.requirement_id);
  }
  const recordedIds = new Set(recorded.requirements.map((item) => item.requirement_id));
  if (![...affected].every((id) => recordedIds.has(id))) return false;
  if (!recorded.requirements.length) return affected.size === 0;
  return commitmentsMatch(
    recorded,
    currentCommitment(requirements, currentOutcome, recorded.requirements.map((item) => item.requirement_id)),
  );
}

export function requirementCommitment(requirement: GoalEventRequirementStatus): GoalEventRequirementCommitment {
  return {
    requirement_id: requirement.requirement_id,
    statement: requirement.statement,
    human_decision_required: requirement.human_decision_required,
    bound_type_ids: [...requirement.bound_type_ids].sort(),
  };
}

export function currentCommitment(
  requirements: GoalEventRequirementStatus[],
  outcome: string,
  requirementIds: string[],
): GoalEventDecisionCommitment {
  const wanted = new Set(requirementIds);
  return {
    outcome,
    requirements: requirements.filter((item) => wanted.has(item.requirement_id)).map(requirementCommitment),
  };
}

export function commitmentsMatch(left: GoalEventDecisionCommitment, right: GoalEventDecisionCommitment): boolean {
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

export function scopedRequirementCommitmentsMatch(
  decision: GoalEventAppliedDecisionView,
  requirements: GoalEventRequirementStatus[],
): boolean {
  const ids = decision.scope.requirement_ids;
  if (!ids.length) return true;
  const current = currentCommitment(requirements, "", ids).requirements;
  const recorded = decision.commitment.requirements;
  if (!recorded.length) {
    return ids.every((id) => requirements.some((item) => item.requirement_id === id));
  }
  return commitmentsMatch({ outcome: "", requirements: recorded }, { outcome: "", requirements: current });
}

export function requirementCurrentlySatisfied(requirement: GoalEventRequirementStatus): boolean {
  if (requirement.human_decision_required) {
    if (requirement.user_conclusion?.verdict !== "accepted") return false;
    const report = requirement.current_report;
    if (
      report
      && (report.verdict === "contradicts" || report.verdict === "unknown")
      && report.journal_seq > requirement.user_conclusion.journal_seq
    ) {
      return false;
    }
    return true;
  }
  return requirement.current_report?.verdict === "supports";
}

export function scopeAppliesToComplete(scope: GoalEventScope): boolean {
  return scope.action === "complete";
}

export function pendingBlocksCompletion(
  pending: { purpose?: string; scope: GoalEventScope },
  requirements: GoalEventRequirementStatus[],
): boolean {
  if (pending.purpose === "suggestion" || pending.purpose === "agreement_change") return false;
  if (pending.purpose === "requirement_acceptance") {
    const current = new Set(requirements.map((item) => item.requirement_id));
    return pending.scope.requirement_ids.some((id) => current.has(id));
  }
  return scopeAppliesToComplete(pending.scope);
}

function assertEffectsMatchScope(
  error: StateError,
  effects: GoalEventDecisionEffect[],
  scope: GoalEventScope,
): void {
  for (const effect of effects) {
    if (effect.kind === "accept_requirements" || effect.kind === "reject_requirements") {
      if (scope.requirement_ids.length === 0) {
        throw error("event_decision.effect_scope_mismatch", "要求效果必须声明适用的 requirement_ids");
      }
      continue;
    }
    if (effect.kind === "accept_concerns" || effect.kind === "reject_concerns") {
      if (scope.concern_ids.length === 0) {
        throw error("event_decision.effect_scope_mismatch", "Concern 效果必须声明适用的 concern_ids");
      }
      continue;
    }
    if (effect.kind === "authorize_agreement_change") continue;
    if (!scope.action || effect.action !== scope.action) {
      throw error("event_decision.effect_scope_mismatch", "动作效果必须匹配声明的 scope.action，不能把授权扩大到范围之外");
    }
  }
}

export function resolveRecordedDecision(
  error: StateError,
  input: Pick<RecordGoalUserDecisionInput, "accepts_requirements" | "effects" | "authorized_change" | "scope">,
  request: GoalEventDecisionRequestView | null,
  scope: GoalEventScope,
): { effects: GoalEventDecisionEffect[]; accepts_requirements: boolean; authorized_change: GoalEventAgreementChange | null; scope: GoalEventScope } {
  if (request?.purpose === "agreement_change") {
    const proposed = request.proposed_change;
    if (!proposed) {
      throw error("event_decision.missing_proposed_change", "约定变更请求必须带有可审阅的具体变化");
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
      throw error("event_decision.effect_widened", "批准约定变更时不能附加请求里没有的效果或另一份变化");
    }
    if (authorize && deny) {
      throw error("event_decision.effect_conflict", "不能同时批准和拒绝同一份约定变更");
    }
    if (input.scope && (input.scope.requirement_ids?.length || input.scope.event_ids?.length || input.scope.concern_ids?.length || input.scope.action)) {
      if (!scopeIsSubset(scope, request.scope) || !scopeIsSubset(request.scope, scope)) {
        throw error("event_decision.scope_expanded", "批准约定变更时不能替换请求中的范围");
      }
    }
    const accepts = input.accepts_requirements === true || authorize;
    if (accepts) {
      if (deny) {
        throw error("event_decision.effect_conflict", "不能同时批准和拒绝同一份约定变更");
      }
      if (input.authorized_change) {
        const left = JSON.stringify(canonicalizeValue(input.authorized_change));
        const right = JSON.stringify(canonicalizeValue(proposed));
        if (left !== right) {
          throw error("event_decision.change_mismatch", "批准时的约定变化必须与请求中的具体变化一致，不能加宽或替换");
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
  const normalized = normalizeTrustedDecision(error, input, scope);
  if (normalized.effects.some((effect) => effect.kind === "authorize_agreement_change")) {
    if (!input.authorized_change) {
      throw error("event_decision.missing_proposed_change", "授权约定变更必须带上可审阅的具体变化");
    }
    return { ...normalized, authorized_change: input.authorized_change, scope };
  }
  return { ...normalized, authorized_change: null, scope };
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeValue(item)]),
    );
  }
  return value;
}

function normalizeEffects(error: StateError, effects: GoalEventDecisionEffect[]): GoalEventDecisionEffect[] {
  const normalized: GoalEventDecisionEffect[] = [];
  const seen = new Set<string>();
  for (const raw of effects) {
    const kind = requiredEnum(
      error,
      raw?.kind,
      goalEventDecisionEffectKinds,
      "event_decision.invalid_effect",
      "决定效果必须是有限的明确授权，不能从结论或选项猜测",
    );
    const action = raw.action?.trim() || null;
    if ((kind === "authorize_action" || kind === "deny_action") && !action) {
      throw error("event_decision.invalid_effect", "动作授权必须写明具体动作");
    }
    const key = `${kind}:${action ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(kind === "authorize_action" || kind === "deny_action" ? { kind, action } : { kind });
  }
  return normalized;
}
