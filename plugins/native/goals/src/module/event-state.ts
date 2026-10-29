import { goalErrors } from "./errors.js";
import { parseGoalProgressSource } from "./event-system-payload.js";
import { randomUUID } from "node:crypto";
import type {
  ApplyGoalConcernInput,
  CiteGoalDecisionInput,
  GoalEventStateApi,
  GoalEventProgressResult,
  GoalProgressArtifactSource,
  GoalEventScope,
  GoalEventSystemPayload,
  GoalEventTrustedDecisionRecord,
  GoalEventWorkStateView,
  GoalRecord,
  GoalSystemWorkEventRecord,
  RecordGoalProgressSummaryInput,
  RecordGoalUserDecisionInput,
  RequestGoalDecisionInput,
  RecordGoalNoteInput,
  ResumeGoalEventWorkInput,
  SetGoalEventAgreementInput,
  SubmitGoalEventClosureInput,
} from "../contract/goals.js";
import { GoalsCommandContext, requestHash } from "./command-support.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";
import { requiredText } from "./event-facts-validation.js";
import { GoalEventStateEffects } from "./event-state-effects.js";
import { type GoalEventStateWriteDeps, mutateGoalEventState, requireOwnedWritableGoal } from "./event-state-write.js";
import type { GoalEventStateHost } from "./event-state-host.js";
import { currentEffectiveDecisions } from "./event-state-authorization.js";
import { insertGoalSystemEvent } from "./event-system-insert.js";
import { GoalEventStateRepository } from "./event-state-repository.js";
import { agreementView } from "./event-state-owner-records.js";
import { normalizeScope } from "./event-state-scope.js";

export type { GoalEventStateCore, GoalEventStateHost } from "./event-state-host.js";

export class GoalEventState implements GoalEventStateApi {
  private readonly effects: GoalEventStateEffects;
  private readonly writes: GoalEventStateWriteDeps;

  constructor(
    private readonly context: GoalsCommandContext,
    private readonly facts: GoalEventFactsRepository,
    private readonly records: GoalEventStateRepository,
    private readonly host: GoalEventStateHost,
  ) {
    this.writes = { context, records, host };
    this.effects = new GoalEventStateEffects(context, facts, records, host, {
      mutate: (input, operation, hash, write) => mutateGoalEventState(this.writes, input, operation, hash, write),
      insertSystem: this.insertSystem.bind(this),
      requireOwnedWritable: (projectId, goalId) => requireOwnedWritableGoal(this.writes, projectId, goalId),
      requireLocalScope: this.requireLocalScope.bind(this),
      assertConfigVersion: this.assertConfigVersion.bind(this),
      assertAgreementVersion: this.assertAgreementVersion.bind(this),
    });
  }

  isEventStateOwner(projectId: string, goalId: string): boolean {
    return this.records.owner.isOwner(projectId, goalId);
  }

  readWorkState(projectId: string, goalId: string): GoalEventWorkStateView {
    const goal = this.context.requireGoal(projectId, goalId);
    const requirements = this.host.readCurrentRequirements(projectId, goalId);
    const progress = this.records.outcomes.latestProgress(projectId, goalId);
    const progressEvent = progress ? this.facts.workEvents.getWorkEvent(projectId, goalId, progress.event_id) : null;
    const progressPayload = progressEvent?.payload as GoalEventSystemPayload | undefined;
    const source = progressPayload?.operation === "progress_summary" ? parseGoalProgressSource(progressPayload.source) : undefined;
    const laterCursor = progress
      ? this.facts.workEvents.maxGoalCursor(projectId, goalId, progress.event_id)
      : this.facts.workEvents.maxGoalCursor(projectId, goalId);
    const applied = this.records.decisions.listAppliedDecisions(projectId, goalId);
    return {
      owner: this.records.owner.readOwner(projectId, goalId),
      work_status: this.records.owner.workStatus(projectId, goalId),
      agreement: agreementView(this.records.owner.latestAgreement(projectId, goalId), requirements.length, goal.outcome),
      progress_summary: progress
        ? {
            ...progress,
            ...(source ? { source } : {}),
            stale: laterCursor > progress.based_on_cursor,
            stale_because_cursor: laterCursor > progress.based_on_cursor ? laterCursor : null,
          }
        : null,
      concerns: this.records.concerns.listConcerns(projectId, goalId),
      pending_decisions: this.records.decisions.listDecisionRequests(projectId, goalId).filter((item) => item.status === "pending"),
      applied_decisions: applied,
      current_decisions: currentEffectiveDecisions(applied),
      closure: this.records.outcomes.latestClosure(projectId, goalId),
    };
  }

  adoptOwner(input: {
    project_id: string;
    goal_id: string;
    actor_id: string;
    source: "intent" | "configuration" | "continue";
    outcome?: string;
  }): void {
    const at = this.context.now().toISOString();
    this.records.owner.adoptOwner({
      projectId: input.project_id,
      goalId: input.goal_id,
      actorId: input.actor_id,
      source: input.source,
      at,
    });
    const outcome = input.outcome?.trim();
    if (outcome && !this.records.owner.latestAgreement(input.project_id, input.goal_id)) {
      this.records.owner.insertAgreement({
        projectId: input.project_id,
        goalId: input.goal_id,
        version: 1,
        outcome,
        actorId: input.actor_id,
        at,
        eventId: "",
      });
    }
  }

  writeProgress(
    goal: GoalRecord,
    actorId: string,
    actorKind: "user" | "runtime" | null,
    input: { summary: string; based_on_cursor: number; next_step: string | null; next_actor: string | null; source?: GoalProgressArtifactSource },
  ): Omit<GoalEventProgressResult, "replayed"> {
    const event = this.insertSystem(goal, actorId, actorKind, "记录当前进展和下一步", {
      operation: "progress_summary",
      ...(input.source ? { source: input.source } : {}),
      summary: input.summary,
      based_on_cursor: input.based_on_cursor,
      next_step: input.next_step,
      next_actor: input.next_actor,
    });
    const summaryId = `gsum-${randomUUID()}`;
    this.records.outcomes.insertProgress({
      summaryId,
      projectId: goal.project_id,
      goalId: goal.goal_id,
      eventId: event.event_id,
      summary: input.summary,
      basedOnCursor: input.based_on_cursor,
      nextStep: input.next_step,
      nextActor: input.next_actor,
      actorId,
      at: event.received_at,
    });
    return {
      event_id: event.event_id,
      observed_event_cursor: event.journal_seq,
      recorded: true as const,
      progress_summary: {
        ...(input.source ? { source: input.source } : {}),
        summary_id: summaryId,
        event_id: event.event_id,
        summary: input.summary,
        based_on_cursor: input.based_on_cursor,
        next_step: input.next_step,
        next_actor: input.next_actor,
        recorded_at: event.received_at,
        actor_id: actorId,
        stale: false,
        stale_because_cursor: null,
      },
    };
  }

  readProgressReceipt(projectId: string, goalId: string, actorId: string, key: string): GoalEventProgressResult | null {
    this.context.requireGoal(projectId, goalId);
    const receipt = this.context.repository.getIdempotency(projectId, actorId, "record_goal_progress", key);
    const result = receipt?.outcome as GoalEventProgressResult | undefined;
    if (!result || !this.facts.workEvents.getWorkEvent(projectId, goalId, result.event_id)) return null;
    return { ...result, replayed: true };
  }

  recordProgress(input: RecordGoalProgressSummaryInput): GoalEventProgressResult {
    const hash = requestHash({
      project_id: input.project_id,
      goal_id: input.goal_id,
      based_on_cursor: input.based_on_cursor,
      summary: input.summary,
      next_step: input.next_step ?? null,
      next_actor: input.next_actor ?? null,
      ...(input.source ? { source: input.source } : {}),
      ...(input.expected_goal_cursor === undefined ? {} : { expected_goal_cursor: input.expected_goal_cursor }),
    });
    return mutateGoalEventState(this.writes, input, "record_goal_progress", hash, (goal, actorKind) => {
      const summary = requiredText(input.summary, "goals.event_progress.summary_required", "进展摘要需要原文");
      if (!Number.isInteger(input.based_on_cursor) || input.based_on_cursor < 0) {
        throw goalErrors["goals.event_progress.invalid_cursor"]("摘要必须依据当前 Goal 已存在的事件游标");
      }
      const maxCursor = this.facts.workEvents.maxGoalCursor(goal.project_id, goal.goal_id);
      if (input.expected_goal_cursor !== undefined && input.expected_goal_cursor !== maxCursor) {
        throw goalErrors["goals.event_progress.stale_goal"]("原目标已变化，请重新查看目标和拟记录内容后再确认");
      }
      if (input.source && !parseGoalProgressSource(input.source)) {
        throw goalErrors["goals.event_progress.invalid_source"]("成果必须引用一个明确的固定版本及其阅读入口");
      }
      if (input.based_on_cursor > maxCursor) {
        throw goalErrors["goals.event_progress.future_cursor"]("不能引用尚未发生的事件游标");
      }
      if (!this.facts.workEvents.hasGoalCursor(goal.project_id, goal.goal_id, input.based_on_cursor)) {
        throw goalErrors["goals.event_progress.cursor_not_on_goal"]("摘要游标必须是当前 Goal 的事件，不能用其他 Goal 的更新");
      }
      return this.writeProgress(goal, input.actor_id, actorKind, {
        summary,
        ...(input.source ? { source: structuredClone(input.source) } : {}),
        based_on_cursor: input.based_on_cursor,
        next_step: input.next_step?.trim() || null,
        next_actor: input.next_actor?.trim() || null,
      });
    });
  }

  applyConcern(input: ApplyGoalConcernInput) {
    return this.effects.applyConcern(input);
  }

  requestDecision(input: RequestGoalDecisionInput) {
    return this.effects.requestDecision(input);
  }

  citeDecision(input: CiteGoalDecisionInput) {
    return this.effects.citeDecision(input);
  }

  recordTrustedDecision(
    input: RecordGoalUserDecisionInput,
    persistGovernance: (normalized: RecordGoalUserDecisionInput) => GoalEventTrustedDecisionRecord,
  ) {
    return this.effects.recordTrustedDecision(input, persistGovernance);
  }

  setAgreement(input: SetGoalEventAgreementInput) {
    return this.effects.setAgreement(input);
  }

  submitClosure(input: SubmitGoalEventClosureInput) {
    return this.effects.submitClosure(input);
  }

  resumeWork(input: ResumeGoalEventWorkInput) {
    return this.effects.resumeWork(input);
  }

  recordNote(input: RecordGoalNoteInput) {
    const hash = requestHash({
      project_id: input.project_id,
      goal_id: input.goal_id,
      body: input.body,
    });
    return mutateGoalEventState(this.writes, input, "record_goal_note", hash, (goal, actorKind) => {
      const body = requiredText(input.body, "goals.event_note.body_required", "补充需要原文");
      const event = this.insertSystem(goal, input.actor_id, actorKind, body.slice(0, 80), {
        operation: "observation_note",
        body,
      });
      return {
        event_id: event.event_id,
        observed_event_cursor: event.journal_seq,
        recorded: true as const,
      };
    });
  }

  reassessAfterReports(goal: GoalRecord, actorId: string, actorKind: "user" | "runtime" | null, contradictedIds: string[]): void {
    this.effects.reassessAfterReports(goal, actorId, actorKind, contradictedIds);
  }

  private requireLocalScope(goal: GoalRecord, raw?: Partial<GoalEventScope>): GoalEventScope {
    const scope = normalizeScope(raw);
    for (const eventId of scope.event_ids) {
      if (!this.facts.workEvents.getWorkEvent(goal.project_id, goal.goal_id, eventId)) {
        throw goalErrors["goals.event_concern.cross_goal_reference"](`事件 ${eventId} 不属于当前 Goal`);
      }
    }
    const requirements = this.host.readCurrentRequirements(goal.project_id, goal.goal_id);
    const known = new Set(requirements.map((item) => item.requirement_id));
    for (const requirementId of scope.requirement_ids) {
      if (!known.has(requirementId)) {
        throw goalErrors["goals.event_report.cross_goal_reference"](`要求 ${requirementId} 不属于当前 Goal`);
      }
    }
    for (const concernId of scope.concern_ids) {
      if (!this.records.concerns.getConcern(goal.project_id, goal.goal_id, concernId)) {
        throw goalErrors["goals.event_concern.cross_goal_reference"](`Concern ${concernId} 不属于当前 Goal`);
      }
    }
    return scope;
  }

  private assertConfigVersion(goal: GoalRecord, expected: number): void {
    const current = this.host.configVersion(goal.project_id, goal.goal_id);
    if (expected !== current) {
      throw goalErrors["goals.event_closure.stale_version"](`正式版本已是 ${current}，不能用期望版本 ${expected} 覆盖新事实`, { current_version: current, expected_version: expected });
    }
  }

  private assertAgreementVersion(goal: GoalRecord, expected: number, code: "goals.event_closure.stale_version" | "goals.event_agreement.stale_version"): void {
    const current = this.records.owner.latestAgreement(goal.project_id, goal.goal_id)?.version ?? 0;
    if (expected !== current) {
      throw goalErrors[code](`当前约定版本已是 ${current}，不能用期望版本 ${expected} 覆盖`, { current_version: current, expected_version: expected });
    }
  }

  insertSystem(
    goal: GoalRecord,
    actorId: string,
    actorKind: "user" | "runtime" | null,
    title: string,
    payload: GoalEventSystemPayload,
  ): GoalSystemWorkEventRecord {
    return insertGoalSystemEvent(this.context, this.facts, goal, actorId, actorKind, title, payload);
  }
}
