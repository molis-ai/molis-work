import { randomUUID } from "node:crypto";
import type {
  ApplyGoalConcernInput,
  CiteGoalDecisionInput,
  GoalEventAgreementResult,
  GoalEventAppliedDecisionView,
  GoalEventClosureResult,
  GoalEventConcernResult,
  GoalEventDecisionCommitment,
  GoalEventDecisionOption,
  GoalEventDecisionRequestResult,
  GoalEventDecisionResult,
  GoalEventResumeResult,
  GoalEventScope,
  GoalEventTrustedDecisionRecord,
  GoalRecord,
  RecordGoalUserDecisionInput,
  RequestGoalDecisionInput,
  ResumeGoalEventWorkInput,
  SubmitGoalEventClosureInput,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { requestHash } from "./command-support.js";
import {
  affectedExistingRequirementIds,
  compactChange,
  isEmptyChange,
  normalizeAgreementChange,
  requiredDecisionPurpose,
  requiredVersion,
  toWireChange,
} from "./event-agreement-change.js";
import { GoalEventStateAgreement } from "./event-state-agreement.js";
import { requiredText } from "./event-facts-validation.js";
import type { GoalEventStateRepository } from "./event-state-repository.js";
import { agreementView, emptyScope, scopeIsSubset } from "./event-state-repository.js";
import type { GoalEventStateCore, GoalEventStateHost } from "./event-state-host.js";
import type { GoalsCommandContext } from "./command-support.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";
import { GoalEventConcerns } from "./event-state-concerns.js";
import {
  agreementChangeCommitmentCurrent,
  laterComparableDecision,
  requiredClosureKind,
  resolveRecordedDecision,
  scopedRequirementCommitmentsMatch,
  snapshotAgreementChangeCommitment,
  snapshotCommitment,
} from "./event-state-authorization.js";
import { completionUnmetReasons, syncClosedState } from "./event-state-completion.js";

export class GoalEventStateEffects {
  private readonly concerns: GoalEventConcerns;
  private readonly agreement: GoalEventStateAgreement;

  constructor(
    private readonly context: GoalsCommandContext,
    facts: GoalEventFactsRepository,
    private readonly records: GoalEventStateRepository,
    private readonly host: GoalEventStateHost,
    private readonly core: GoalEventStateCore,
  ) {
    this.concerns = new GoalEventConcerns(context, facts, records, core, (goal, cited) => {
      this.assertReusable(goal, cited, cited.scope);
    });
    this.agreement = new GoalEventStateAgreement(context, records, host, core);
  }

  applyConcern(input: ApplyGoalConcernInput): GoalEventConcernResult {
    return this.concerns.applyConcern(input);
  }

  requestDecision(input: RequestGoalDecisionInput): GoalEventDecisionRequestResult {
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      question: input.question,
      options: input.options,
      purpose: input.purpose,
      proposed_change: input.proposed_change ?? null,
      scope: input.scope ?? null,
    });
    return this.core.mutate(input, "request_goal_decision", hash, (goal, actorKind) => {
      const question = requiredText(this.core.error, input.question, "event_decision.question_required", "决定请求需要具体问题");
      const options = normalizeOptions(this.core.error, input.options);
      const purpose = requiredDecisionPurpose(this.core.error, input.purpose);
      const requirements = this.host.readCurrentRequirements(goal.board_id, goal.goal_id);
      const currentOutcome = this.records.latestAgreement(goal.board_id, goal.goal_id)?.outcome || goal.outcome.trim();
      let proposedChange = input.proposed_change
        ? toWireChange(compactChange(normalizeAgreementChange(this.core.error, input.proposed_change), requirements, currentOutcome))
        : null;
      let commitment: GoalEventDecisionCommitment | null = null;
      if (purpose === "agreement_change") {
        if (!proposedChange) {
          throw this.context.error("event_decision.missing_proposed_change", "约定变更请求必须带上可审阅的具体变化");
        }
        const canonical = compactChange(normalizeAgreementChange(this.core.error, proposedChange), requirements, currentOutcome);
        if (isEmptyChange(canonical, currentOutcome)) {
          throw this.context.error("event_agreement.no_changes", "需要补充结果说明、新增、修订或退休要求");
        }
        proposedChange = toWireChange(canonical);
        commitment = snapshotAgreementChangeCommitment(canonical, requirements, currentOutcome);
      } else if (input.proposed_change) {
        throw this.context.error("event_decision.unexpected_proposed_change", "只有约定变更请求才能附带具体变化");
      }
      const requestedScope = input.scope ?? (purpose === "agreement_change"
        ? { action: "set_agreement", requirement_ids: proposedChange ? affectedExistingRequirementIds(normalizeAgreementChange(this.core.error, proposedChange)) : [] }
        : undefined);
      const scope = this.core.requireLocalScope(goal, requestedScope);
      if (emptyScope(scope)) {
        throw this.context.error("event_decision.scope_required", "决定请求需要明确的作用范围");
      }
      const requestId = `gdec-req-${randomUUID()}`;
      const event = this.core.insertSystem(goal, input.actor_id, actorKind, `请求决定：${question}`, {
        operation: "decision_requested",
        request_id: requestId,
        question,
        options,
        scope,
        purpose,
        proposed_change: proposedChange,
      });
      this.records.insertDecisionRequest({
        requestId,
        boardId: goal.board_id,
        goalId: goal.goal_id,
        eventId: event.event_id,
        question,
        options,
        scope,
        purpose,
        proposedChange,
        commitment,
        at: event.received_at,
      });
      return {
        event_id: event.event_id,
        observed_event_cursor: event.journal_seq,
        recorded: true as const,
        decision_request: {
          request_id: requestId,
          event_id: event.event_id,
          question,
          options,
          scope,
          purpose,
          proposed_change: proposedChange,
          commitment,
          status: "pending",
          created_at: event.received_at,
        },
      };
    });
  }

  citeDecision(input: CiteGoalDecisionInput): GoalEventDecisionResult {
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      decision_id: input.decision_id,
      scope: input.scope ?? null,
    });
    return this.core.mutate(input, "cite_goal_decision", hash, (goal, actorKind) => {
      const existing = this.records.getAppliedDecision(goal.board_id, goal.goal_id, input.decision_id)
        ?? this.records.getAppliedDecisionByGovernanceId(goal.board_id, goal.goal_id, input.decision_id);
      if (!existing) {
        throw this.context.error("event_decision.not_found", "只能引用当前 Goal 已持久化的可信决定");
      }
      const requested = this.core.requireLocalScope(goal, input.scope);
      this.assertReusable(goal, existing, requested);
      const scope = emptyScope(requested) ? existing.scope : requested;
      const event = this.core.insertSystem(goal, input.actor_id, actorKind, "复用已有决定", {
        operation: "decision_cited",
        decision_id: existing.decision_id,
        scope,
      });
      return {
        event_id: event.event_id,
        observed_event_cursor: event.journal_seq,
        recorded: true as const,
        decision: existing,
      };
    });
  }

  recordTrustedDecision(
    input: RecordGoalUserDecisionInput,
    persistGovernance: (normalized: RecordGoalUserDecisionInput) => GoalEventTrustedDecisionRecord,
  ): GoalEventDecisionResult {
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      request_id: input.request_id ?? null,
      selected_option_id: input.selected_option_id ?? null,
      conclusion: input.conclusion,
      accepts_requirements: input.accepts_requirements ?? null,
      effects: input.effects ?? null,
      authorized_change: input.authorized_change ?? null,
      scope: input.scope ?? null,
      authority_source: input.authority.authority_source,
      actor_id: input.authority.actor_id,
    });
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<Omit<GoalEventDecisionResult, "replayed">>(
        input.board_id, input.authority.actor_id, "record_goal_user_decision", input.idempotency_key, hash,
      );
      if (replay) return { ...replay, replayed: true };
      const goal = this.core.requireOwnedWritable(input.board_id, input.goal_id);
      const request = input.request_id
        ? this.records.getDecisionRequest(goal.board_id, goal.goal_id, input.request_id)
        : null;
      if (input.request_id && !request) {
        throw this.context.error("event_decision.request_not_found", "决定请求不存在或不属于当前 Goal");
      }
      const scope = this.core.requireLocalScope(goal, input.scope ?? request?.scope);
      if (emptyScope(scope)) {
        throw this.context.error("event_decision.scope_required", "可信决定需要明确的作用范围，空范围不能扩大权限");
      }
      const resolved = resolveRecordedDecision(this.core.error, input, request, scope);
      const requirements = this.host.readCurrentRequirements(goal.board_id, goal.goal_id);
      const agreement = this.records.latestAgreement(goal.board_id, goal.goal_id);
      const outcome = agreement?.outcome || goal.outcome.trim();
      if (
        request?.purpose === "agreement_change"
        && resolved.effects.some((effect) => effect.kind === "authorize_agreement_change")
      ) {
        const proposed = compactChange(
          normalizeAgreementChange(this.core.error, request.proposed_change ?? {}),
          requirements,
          outcome,
        );
        if (!agreementChangeCommitmentCurrent(request.commitment, requirements, outcome, proposed)) {
          throw this.context.error(
            "event_decision.stale_commitment",
            "原约定或受影响要求已经变化，不能批准这份过期请求",
          );
        }
      }
      const recorded = persistGovernance({
        ...input,
        effects: resolved.effects,
        accepts_requirements: resolved.accepts_requirements,
        authorized_change: resolved.authorized_change ?? undefined,
        scope: resolved.scope,
      });
      if (recorded.board_id !== goal.board_id || recorded.goal_id !== goal.goal_id) {
        throw this.context.error("event_decision.cross_goal_reference", "可信决定不属于当前 Goal");
      }
      if (recorded.request_id) {
        const existingRequest = this.records.getDecisionRequest(goal.board_id, goal.goal_id, recorded.request_id);
        if (!existingRequest) throw this.context.error("event_decision.request_not_found", "决定请求不存在或不属于当前 Goal");
        if (recorded.selected_option_id && !existingRequest.options.some((option) => option.option_id === recorded.selected_option_id)) {
          throw this.context.error("event_decision.option_not_found", "所选选项不在该决定请求中");
        }
      }
      const conclusion = requiredText(this.core.error, recorded.conclusion, "event_decision.conclusion_required", "用户决定需要结论");
      const commitmentScope = resolved.authorized_change
        ? {
            ...resolved.scope,
            requirement_ids: affectedExistingRequirementIds(normalizeAgreementChange(this.core.error, resolved.authorized_change)),
          }
        : resolved.scope;
      const commitment = request?.purpose === "agreement_change" && request.commitment
        ? request.commitment
        : resolved.authorized_change
          ? snapshotAgreementChangeCommitment(
              compactChange(normalizeAgreementChange(this.core.error, resolved.authorized_change), requirements, outcome),
              requirements,
              outcome,
            )
          : snapshotCommitment(requirements, outcome, commitmentScope);
      const configVersion = this.host.configVersion(goal.board_id, goal.goal_id);
      const agreementVersion = agreement?.version ?? 0;
      const decisionId = `gdec-${randomUUID()}`;
      const event = this.core.insertSystem(goal, recorded.actor_id, "user", "记录用户决定", {
        operation: "user_decision",
        decision_id: decisionId,
        governance_decision_id: recorded.decision_id,
        request_id: recorded.request_id,
        selected_option_id: recorded.selected_option_id,
        conclusion,
        accepts_requirements: resolved.accepts_requirements,
        effects: resolved.effects,
        scope: resolved.scope,
        authorized_change: resolved.authorized_change,
        config_version: configVersion,
        agreement_version: agreementVersion,
      });
      this.records.insertAppliedDecision({
        decisionId,
        boardId: goal.board_id,
        goalId: goal.goal_id,
        governanceDecisionId: recorded.decision_id,
        requestId: recorded.request_id,
        eventId: event.event_id,
        selectedOptionId: recorded.selected_option_id,
        conclusion,
        acceptsRequirements: resolved.accepts_requirements,
        effects: resolved.effects,
        scope: resolved.scope,
        commitment,
        authorizedChange: resolved.authorized_change,
        configVersion,
        agreementVersion,
        actorId: recorded.actor_id,
        authoritySource: recorded.authority_source,
        at: event.received_at,
      });
      if (recorded.request_id) this.records.markRequestDecided(recorded.request_id);
      const requirementEffect = resolved.effects.some((effect) => effect.kind === "accept_requirements" || effect.kind === "reject_requirements")
        || (resolved.accepts_requirements && resolved.scope.requirement_ids.length > 0);
      if (requirementEffect && resolved.scope.requirement_ids.length) {
        this.records.insertConclusions({
          boardId: goal.board_id,
          goalId: goal.goal_id,
          requirementIds: resolved.scope.requirement_ids,
          decisionId,
          actorId: recorded.actor_id,
          verdict: resolved.accepts_requirements || resolved.effects.some((effect) => effect.kind === "accept_requirements") ? "accepted" : "rejected",
          at: event.received_at,
          journalSeq: event.journal_seq,
        });
      }
      if (this.records.workStatus(goal.board_id, goal.goal_id) === "completed") {
        const rejected = resolved.effects.some((effect) => effect.kind === "reject_requirements") && resolved.scope.requirement_ids.length > 0;
        const deniedComplete = resolved.effects.some((effect) => effect.kind === "deny_action" && effect.action === "complete");
        if (rejected || deniedComplete) {
          this.reopenCompletion(goal, recorded.actor_id, "user", resolved.scope.requirement_ids, "后续用户拒绝使当前完成不再成立");
        }
      }
      const outcomeResult = {
        event_id: event.event_id,
        observed_event_cursor: event.journal_seq,
        recorded: true as const,
        decision: this.records.getAppliedDecision(goal.board_id, goal.goal_id, decisionId)!,
      };
      this.context.remember(goal.board_id, input.authority.actor_id, "record_goal_user_decision", input.idempotency_key, hash, outcomeResult, event.received_at);
      return { ...outcomeResult, replayed: false };
    });
  }

  setAgreement(input: Parameters<GoalEventStateAgreement["setAgreement"]>[0]): GoalEventAgreementResult {
    return this.agreement.setAgreement(input);
  }


  submitClosure(input: SubmitGoalEventClosureInput): GoalEventClosureResult {
    const kind = requiredClosureKind(this.core.error, input.kind);
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      kind,
      result: input.result ?? null,
      reason: input.reason,
      expected_config_version: input.expected_config_version,
      expected_agreement_version: input.expected_agreement_version,
    });
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<Omit<GoalEventClosureResult, "replayed">>(
        input.board_id, input.actor_id, "submit_goal_event_closure", input.idempotency_key, hash,
      );
      if (replay) return { ...replay, replayed: true };
      const goal = this.core.requireOwnedWritable(input.board_id, input.goal_id);
      const expectedConfig = requiredVersion(
        this.core.error,
        input.expected_config_version,
        "event_closure.expected_config_version_required",
        "正式收尾需要 expected_config_version",
      );
      const expectedAgreement = requiredVersion(
        this.core.error,
        input.expected_agreement_version,
        "event_closure.expected_agreement_version_required",
        "正式收尾需要 expected_agreement_version",
      );
      this.core.assertConfigVersion(goal, expectedConfig);
      this.core.assertAgreementVersion(goal, expectedAgreement, "event_closure.stale_version");
      const agreementVersion = expectedAgreement;
      const status = this.records.workStatus(goal.board_id, goal.goal_id);
      if (status === "cancelled") {
        throw this.context.error("event_closure.cancelled", "已取消的 Goal 需要显式继续后才能再收尾");
      }
      const reason = requiredText(this.core.error, input.reason, "event_closure.reason_required", "收尾需要理由");
      const actorKind = this.host.actorKind(input.actor_kind);
      const result = input.result?.trim() || null;
      const configVersion = this.host.configVersion(goal.board_id, goal.goal_id);
      if (kind === "cancel") {
        if (status === "completed") {
          this.records.supersedeAppliedClosures(goal.board_id, goal.goal_id, "用户取消使已完成效果不再成立");
        }
        const closureId = `gclo-${randomUUID()}`;
        const event = this.core.insertSystem(goal, input.actor_id, actorKind, "取消当前 Goal", {
          operation: "closure_submitted",
          kind: "cancel",
          result,
          reason,
          completion_applied: false,
          unmet_reasons: [],
          expected_config_version: input.expected_config_version,
          expected_agreement_version: agreementVersion,
          config_version: configVersion,
          agreement_version: agreementVersion,
        });
        this.records.insertClosure({
          closureId,
          boardId: goal.board_id,
          goalId: goal.goal_id,
          eventId: event.event_id,
          kind: "cancel",
          result,
          reason,
          completionApplied: false,
          expectedConfigVersion: input.expected_config_version,
          expectedAgreementVersion: agreementVersion,
          configVersion,
          agreementVersion,
          unmetReasons: [],
          at: event.received_at,
        });
        syncClosedState(this.records, goal, "cancelled", event.received_at);
        const outcome = this.closureOutcome(goal, event.event_id, event.journal_seq);
        this.context.remember(goal.board_id, input.actor_id, "submit_goal_event_closure", input.idempotency_key, hash, outcome, event.received_at);
        return { ...outcome, replayed: false };
      }
      const unmet = this.completionUnmet(goal, result);
      const applied = unmet.length === 0;
      const closureId = `gclo-${randomUUID()}`;
      const event = this.core.insertSystem(goal, input.actor_id, actorKind, applied ? "显式完成当前 Goal" : "记录完成报告但未生效", {
        operation: "closure_submitted",
        kind: "complete",
        result,
        reason,
        completion_applied: applied,
        unmet_reasons: unmet,
        expected_config_version: input.expected_config_version,
        expected_agreement_version: agreementVersion,
        config_version: configVersion,
        agreement_version: agreementVersion,
      });
      this.records.insertClosure({
        closureId,
        boardId: goal.board_id,
        goalId: goal.goal_id,
        eventId: event.event_id,
        kind: "complete",
        result,
        reason,
        completionApplied: applied,
        expectedConfigVersion: input.expected_config_version,
        expectedAgreementVersion: agreementVersion,
        configVersion,
        agreementVersion,
        unmetReasons: unmet,
        at: event.received_at,
      });
      if (applied) {
        this.context.repository.clearActiveGoalIfMatches(goal.board_id, goal.goal_id, event.received_at);
        syncClosedState(this.records, goal, "completed", event.received_at);
      }
      const outcome = this.closureOutcome(goal, event.event_id, event.journal_seq);
      this.context.remember(goal.board_id, input.actor_id, "submit_goal_event_closure", input.idempotency_key, hash, outcome, event.received_at);
      return { ...outcome, replayed: false };
    });
  }

  resumeWork(input: ResumeGoalEventWorkInput): GoalEventResumeResult {
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      reason: input.reason,
    });
    return this.core.mutate(input, "resume_goal_event_work", hash, (goal, actorKind) => {
      const reason = requiredText(this.core.error, input.reason, "event_resume.reason_required", "重新继续需要说明理由");
      const previous = this.records.workStatus(goal.board_id, goal.goal_id);
      if (previous === "open") {
        throw this.context.error("event_resume.already_open", "当前已在进行，无须重开");
      }
      if (previous !== "completed" && previous !== "cancelled") {
        throw this.context.error("event_resume.not_resumable", "只有已完成或已取消的 Goal 才能显式继续");
      }
      if (previous === "completed") {
        this.records.supersedeAppliedClosures(goal.board_id, goal.goal_id, reason);
      }
      const event = previous === "completed"
        ? this.core.insertSystem(goal, input.actor_id, actorKind, "明确继续已完成目标，开启新一轮工作", {
          operation: "completion_reopened",
          requirement_ids: [],
          reason,
          previous_work_status: previous,
        })
        : this.core.insertSystem(goal, input.actor_id, actorKind, "显式继续已取消的 Goal", {
          operation: "work_resumed",
          reason,
          previous_work_status: previous,
        });
      syncClosedState(this.records, goal, "open", event.received_at);
      return {
        event_id: event.event_id,
        observed_event_cursor: event.journal_seq,
        recorded: true as const,
        work_status: "open" as const,
      };
    });
  }

  reassessAfterReports(goal: GoalRecord, actorId: string, actorKind: "user" | "runtime" | null, judgedIds: string[]): void {
    if (!this.records.isOwner(goal.board_id, goal.goal_id)) return;
    if (this.records.workStatus(goal.board_id, goal.goal_id) !== "completed") return;
    const closure = this.records.currentAppliedClosure(goal.board_id, goal.goal_id);
    if (!closure || !closure.completion_applied || closure.superseded) return;
    if (judgedIds.length === 0) return;
    const current = this.host.readCurrentRequirements(goal.board_id, goal.goal_id);
    const unsatisfied = current
      .filter((item) => judgedIds.includes(item.requirement_id) && !item.currently_satisfied)
      .map((item) => item.requirement_id);
    if (unsatisfied.length === 0) return;
    this.reopenCompletion(goal, actorId, actorKind, unsatisfied, `相关判断更新了要求 ${unsatisfied.join("、")} 的当前差距`);
  }

  assertReusable(goal: GoalRecord, decision: GoalEventAppliedDecisionView, requested: GoalEventScope): void {
    if (emptyScope(decision.scope)) {
      throw this.context.error("event_decision.scope_expanded", "空范围的决定不能被复用");
    }
    if (!emptyScope(requested) && !scopeIsSubset(requested, decision.scope)) {
      throw this.context.error("event_decision.scope_expanded", "不能把已有决定扩大到原范围之外");
    }
    const requirements = this.host.readCurrentRequirements(goal.board_id, goal.goal_id);
    if (!scopedRequirementCommitmentsMatch(decision, requirements)) {
      throw this.context.error("event_decision.stale_commitment", "承诺已经变化，不能把旧决定静默套用到新约定");
    }
    const later = laterComparableDecision(this.records.listAppliedDecisions(goal.board_id, goal.goal_id), decision);
    if (later) {
      throw this.context.error("event_decision.superseded", "已有更新的决定覆盖了这个授权，不能把旧决定当作当前有效结果");
    }
  }

  completionUnmet(goal: GoalRecord, result: string | null) {
    const requirements = this.host.readCurrentRequirements(goal.board_id, goal.goal_id);
    return completionUnmetReasons({
      goal,
      result,
      requirements,
      agreement: agreementView(
        this.records.latestAgreement(goal.board_id, goal.goal_id),
        requirements.length,
        this.context.requireGoal(goal.board_id, goal.goal_id).outcome,
      ),
      blockingConcerns: this.records.openBlockingConcerns(goal.board_id, goal.goal_id),
      pendingDecisions: this.records.listDecisionRequests(goal.board_id, goal.goal_id).filter((item) => item.status === "pending"),
      appliedDecisions: this.records.listAppliedDecisions(goal.board_id, goal.goal_id),
      context: this.host.readCompletionContext(goal.board_id, goal.goal_id),
    });
  }

  closureOutcome(
    goal: GoalRecord,
    eventId: string,
    cursor: number,
  ): Omit<GoalEventClosureResult, "replayed"> {
    const closure = this.records.closureByEventId(goal.board_id, goal.goal_id, eventId)!;
    return {
      event_id: eventId,
      observed_event_cursor: cursor,
      recorded: true,
      completion_applied: closure.completion_applied,
      work_status: this.records.workStatus(goal.board_id, goal.goal_id),
      unmet_reasons: closure.unmet_reasons,
      closure,
    };
  }

  private reopenCompletion(
    goal: GoalRecord,
    actorId: string,
    actorKind: "user" | "runtime" | null,
    requirementIds: string[],
    reason: string,
  ): void {
    const previous = this.records.workStatus(goal.board_id, goal.goal_id);
    const at = this.context.now().toISOString();
    this.records.supersedeAppliedClosures(goal.board_id, goal.goal_id, reason);
    syncClosedState(this.records, goal, "open", at);
    this.core.insertSystem(goal, actorId, actorKind, "相关事实使完成效果不再成立", {
      operation: "completion_reopened",
      requirement_ids: requirementIds,
      reason,
      previous_work_status: previous,
    });
  }
}

function normalizeOptions(
  error: (code: string, message: string, details?: Record<string, unknown>) => Error,
  options: GoalEventDecisionOption[] | undefined,
): GoalEventDecisionOption[] {
  if (!Array.isArray(options) || options.length < 2) {
    throw error("event_decision.invalid_options", "决定请求至少需要两个可区分选项和影响");
  }
  const seen = new Set<string>();
  return options.map((option, index) => {
    const optionId = option.option_id?.trim();
    const label = option.label?.trim();
    const impact = option.impact?.trim();
    if (!optionId || !label || !impact) {
      throw error("event_decision.invalid_options", `第 ${index + 1} 个选项需要 option_id、label 和 impact`);
    }
    if (seen.has(optionId)) throw error("event_decision.duplicate_option", `选项重复: ${optionId}`);
    seen.add(optionId);
    return { option_id: optionId, label, impact };
  });
}
