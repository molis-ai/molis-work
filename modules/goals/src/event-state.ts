import { parseGoalProgressSource } from "./event-system-payload.js";
import { randomUUID } from "node:crypto";
import type {
  ApplyGoalConcernInput,
  CiteGoalDecisionInput,
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
} from "@molis-ai/molis-work-contracts/modules/goals";
import { GoalsCommandContext, requestHash } from "./command-support.js";
import type { GoalEventFactsRepository, StoredWorkEvent } from "./event-facts-repository.js";
import { requiredText } from "./event-facts-validation.js";
import { GoalEventStateEffects } from "./event-state-effects.js";
import type { GoalEventStateHost } from "./event-state-host.js";
import { currentEffectiveDecisions } from "./event-state-authorization.js";
import {
  GoalEventStateRepository,
  agreementView,
  normalizeScope,
} from "./event-state-repository.js";

export type { GoalEventStateCore, GoalEventStateHost } from "./event-state-host.js";

export class GoalEventState {
  private readonly effects: GoalEventStateEffects;

  constructor(
    private readonly context: GoalsCommandContext,
    private readonly facts: GoalEventFactsRepository,
    private readonly records: GoalEventStateRepository,
    private readonly host: GoalEventStateHost,
  ) {
    this.effects = new GoalEventStateEffects(context, facts, records, host, {
      mutate: this.mutate.bind(this),
      insertSystem: this.insertSystem.bind(this),
      requireOwnedWritable: this.requireOwnedWritable.bind(this),
      requireLocalScope: this.requireLocalScope.bind(this),
      assertConfigVersion: this.assertConfigVersion.bind(this),
      assertAgreementVersion: this.assertAgreementVersion.bind(this),
      error: this.error,
    });
  }

  isEventStateOwner(boardId: string, goalId: string): boolean {
    return this.records.isOwner(boardId, goalId);
  }

  readWorkState(boardId: string, goalId: string): GoalEventWorkStateView {
    const goal = this.context.requireGoal(boardId, goalId);
    const requirements = this.host.readCurrentRequirements(boardId, goalId);
    const progress = this.records.latestProgress(boardId, goalId);
    const progressEvent = progress ? this.facts.getWorkEvent(boardId, goalId, progress.event_id) : null;
    const progressPayload = progressEvent?.payload as GoalEventSystemPayload | undefined;
    const source = progressPayload?.operation === "progress_summary" ? parseGoalProgressSource(progressPayload.source) : undefined;
    const laterCursor = progress
      ? this.facts.maxGoalCursor(boardId, goalId, progress.event_id)
      : this.facts.maxGoalCursor(boardId, goalId);
    const applied = this.records.listAppliedDecisions(boardId, goalId);
    return {
      owner: this.records.readOwner(boardId, goalId),
      work_status: this.records.workStatus(boardId, goalId),
      agreement: agreementView(this.records.latestAgreement(boardId, goalId), requirements.length, goal.outcome),
      progress_summary: progress
        ? {
            ...progress,
            ...(source ? { source } : {}),
            stale: laterCursor > progress.based_on_cursor,
            stale_because_cursor: laterCursor > progress.based_on_cursor ? laterCursor : null,
          }
        : null,
      concerns: this.records.listConcerns(boardId, goalId),
      pending_decisions: this.records.listDecisionRequests(boardId, goalId).filter((item) => item.status === "pending"),
      applied_decisions: applied,
      current_decisions: currentEffectiveDecisions(applied),
      closure: this.records.latestClosure(boardId, goalId),
      imported_completion: this.records.latestImportedCompletion(boardId, goalId),
    };
  }

  adoptOwner(input: {
    board_id: string;
    goal_id: string;
    actor_id: string;
    source: "intent" | "configuration" | "continue" | "migration";
    outcome?: string;
  }): void {
    const at = this.context.now().toISOString();
    this.records.adoptOwner({
      boardId: input.board_id,
      goalId: input.goal_id,
      actorId: input.actor_id,
      source: input.source,
      at,
    });
    const outcome = input.outcome?.trim();
    if (outcome && !this.records.latestAgreement(input.board_id, input.goal_id)) {
      this.records.insertAgreement({
        boardId: input.board_id,
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
    this.records.insertProgress({
      summaryId,
      boardId: goal.board_id,
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

  readProgressReceipt(boardId: string, goalId: string, actorId: string, key: string): GoalEventProgressResult | null {
    this.context.requireGoal(boardId, goalId);
    const receipt = this.context.repository.getIdempotency(boardId, actorId, "record_goal_progress", key);
    const result = receipt?.outcome as GoalEventProgressResult | undefined;
    if (!result || !this.facts.getWorkEvent(boardId, goalId, result.event_id)) return null;
    return { ...result, replayed: true };
  }

  recordProgress(input: RecordGoalProgressSummaryInput): GoalEventProgressResult {
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      based_on_cursor: input.based_on_cursor,
      summary: input.summary,
      next_step: input.next_step ?? null,
      next_actor: input.next_actor ?? null,
      ...(input.source ? { source: input.source } : {}),
      ...(input.expected_goal_cursor === undefined ? {} : { expected_goal_cursor: input.expected_goal_cursor }),
      ...(input.expected_contract_revision === undefined ? {} : { expected_contract_revision: input.expected_contract_revision }),
    });
    return this.mutate(input, "record_goal_progress", hash, (goal, actorKind) => {
      const summary = requiredText(this.error, input.summary, "event_progress.summary_required", "进展摘要需要原文");
      if (!Number.isInteger(input.based_on_cursor) || input.based_on_cursor < 0) {
        throw this.context.error("event_progress.invalid_cursor", "摘要必须依据当前 Goal 已存在的事件游标");
      }
      const maxCursor = this.facts.maxGoalCursor(goal.board_id, goal.goal_id);
      if (input.expected_goal_cursor !== undefined && input.expected_goal_cursor !== maxCursor
        || input.expected_contract_revision !== undefined && input.expected_contract_revision !== goal.current_contract_revision) {
        throw this.context.error("event_progress.stale_goal", "原目标已变化，请重新查看目标和拟记录内容后再确认");
      }
      if (input.source && !parseGoalProgressSource(input.source)) {
        throw this.context.error("event_progress.invalid_source", "成果必须引用一个明确的固定版本及其阅读入口");
      }
      if (input.based_on_cursor > maxCursor) {
        throw this.context.error("event_progress.future_cursor", "不能引用尚未发生的事件游标");
      }
      if (!this.facts.hasGoalCursor(goal.board_id, goal.goal_id, input.based_on_cursor)) {
        throw this.context.error("event_progress.cursor_not_on_goal", "摘要游标必须是当前 Goal 的事件，不能用其他 Goal 的更新");
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
      board_id: input.board_id,
      goal_id: input.goal_id,
      body: input.body,
    });
    return this.mutate(input, "record_goal_note", hash, (goal, actorKind) => {
      const body = requiredText(this.error, input.body, "event_note.body_required", "补充需要原文");
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
      if (!this.facts.getWorkEvent(goal.board_id, goal.goal_id, eventId)) {
        throw this.context.error("event_concern.cross_goal_reference", `事件 ${eventId} 不属于当前 Goal`);
      }
    }
    const requirements = this.host.readCurrentRequirements(goal.board_id, goal.goal_id);
    const known = new Set(requirements.map((item) => item.requirement_id));
    for (const requirementId of scope.requirement_ids) {
      if (!known.has(requirementId)) {
        throw this.context.error("event_report.cross_goal_reference", `要求 ${requirementId} 不属于当前 Goal`);
      }
    }
    for (const concernId of scope.concern_ids) {
      if (!this.records.getConcern(goal.board_id, goal.goal_id, concernId)) {
        throw this.context.error("event_concern.cross_goal_reference", `Concern ${concernId} 不属于当前 Goal`);
      }
    }
    return scope;
  }

  private assertConfigVersion(goal: GoalRecord, expected: number): void {
    const current = this.host.configVersion(goal.board_id, goal.goal_id);
    if (expected !== current) {
      throw this.context.error(
        "event_closure.stale_version",
        `正式版本已是 ${current}，不能用期望版本 ${expected} 覆盖新事实`,
        { current_version: current, expected_version: expected },
      );
    }
  }

  private assertAgreementVersion(goal: GoalRecord, expected: number, code: string): void {
    const current = this.records.latestAgreement(goal.board_id, goal.goal_id)?.version ?? 0;
    if (expected !== current) {
      throw this.context.error(
        code,
        `当前约定版本已是 ${current}，不能用期望版本 ${expected} 覆盖`,
        { current_version: current, expected_version: expected },
      );
    }
  }

  private requireOwnedWritable(boardId: string, goalId: string): GoalRecord {
    const goal = this.host.requireWritableGoal(boardId, goalId);
    if (!this.records.isOwner(boardId, goalId)) {
      throw this.context.error(
        "event_state.not_owner",
        "这个 Goal 还没有事件状态归属。请先保存意图或登记事件配置，不要把旧完成入口和新状态效果混用",
      );
    }
    return goal;
  }

  private mutate<T extends { event_id: string; observed_event_cursor: number; recorded: true }>(
    input: { board_id: string; goal_id: string; actor_id: string; actor_kind?: "user" | "runtime"; idempotency_key: string },
    operation: string,
    hash: string,
    write: (goal: GoalRecord, actorKind: "user" | "runtime" | null) => T,
  ): T & { replayed: boolean } {
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<T>(input.board_id, input.actor_id, operation, input.idempotency_key, hash);
      if (replay) return { ...replay, replayed: true };
      const goal = this.requireOwnedWritable(input.board_id, input.goal_id);
      const cancelled = this.records.workStatus(goal.board_id, goal.goal_id) === "cancelled";
      const ordinaryRecord = operation === "record_goal_note" || operation === "record_goal_progress";
      if (cancelled && !ordinaryRecord && operation !== "resume_goal_event_work") {
        throw this.context.error("event_closure.cancelled", "已取消的 Goal 不会被普通记录自动恢复，需要显式继续");
      }
      const outcome = write(goal, this.host.actorKind(input.actor_kind));
      this.context.remember(goal.board_id, input.actor_id, operation, input.idempotency_key, hash, outcome, this.context.now().toISOString());
      return { ...outcome, replayed: false };
    });
  }

  insertSystem(
    goal: GoalRecord,
    actorId: string,
    actorKind: "user" | "runtime" | null,
    title: string,
    payload: GoalEventSystemPayload,
  ): GoalSystemWorkEventRecord {
    const eventId = `gevt-${randomUUID()}`;
    const at = this.context.now().toISOString();
    const cursor = this.context.repository.appendEvent({
      eventId,
      boardId: goal.board_id,
      actorId,
      type: `goal.event_state.${payload.operation}`,
      objectType: "goal_work_event",
      objectId: eventId,
      reason: title,
      payload,
      at,
    });
    const stored: StoredWorkEvent = {
      event_id: eventId,
      board_id: goal.board_id,
      goal_id: goal.goal_id,
      kind: "system",
      type_id: null,
      type_version: null,
      title,
      payload,
      actor_id: actorId,
      actor_kind: actorKind,
      received_at: at,
      journal_seq: cursor,
      config_version: this.facts.getConfig(goal.board_id, goal.goal_id)?.current_version ?? null,
    };
    this.facts.insertWorkEvent(stored);
    return {
      event_id: eventId,
      board_id: goal.board_id,
      goal_id: goal.goal_id,
      title,
      actor_id: actorId,
      actor_kind: actorKind,
      received_at: at,
      journal_seq: cursor,
      config_version: stored.config_version,
      kind: "system",
      type: null,
      payload,
      judgments: [],
    };
  }

  private readonly error = (code: string, message: string, details?: Record<string, unknown>) =>
    this.context.error(code, message, details);
}
