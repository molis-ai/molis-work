import { randomUUID } from "node:crypto";
import type {
  ConfigureGoalEventsApplicationInput,
  ConfigureGoalEventsInput,
  ApplyGoalConcernInput,
  CiteGoalDecisionInput,
  ConfigureGoalEventsResult,
  CreateGoalIntentRequirementInput,
  CreateGoalIntentResult,
  GoalIntentSourceKind,
  GoalEventAdoptedPlanningRequest,
  GoalEventConfigView,
  GoalEventFactsApi,
  GoalEventHistoryPage,
  GoalEventHistoryQuery,
  GoalEventLatestReports,
  GoalEventLatestReportsQuery,
  GoalEventListPage,
  GoalEventListQuery,
  GoalEventRequirementStatus,
  GoalEventTimelinePage,
  GoalEventTypeDefinitionInput,
  GoalEventTrustedDecisionRecord,
  GoalRecord,
  GoalReportWorkEventRecord,
  GoalWorkEventRecord,
  RecordGoalProgressSummaryInput,
  RecordGoalUserDecisionInput,
  ReportGoalEventsInput,
  ReportGoalEventsRecordedResult,
  RequestGoalDecisionInput,
  ResolvedPlanningEventAdoption,
  RecordGoalNoteInput,
  ResumeGoalEventWorkInput,
  SetGoalEventAgreementInput,
  SubmitGoalEventClosureInput,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { GoalsCommandContext, requestHash } from "./command-support.js";
import { GoalEventFactsRepository, type StoredWorkEvent } from "./event-facts-repository.js";
import { GoalEventFactsConfig } from "./event-facts-config.js";
import { GoalEventState } from "./event-state.js";
import { GoalEventStateRepository } from "./event-state-repository.js";
import { normalizeAdoptedPlanning, parseOptionalReportProgress } from "./event-facts-validation.js";
import { instantiatePlanningRequirementId } from "./planning/event-adoption.js";
import { applyGoalEventAgreementChange, readCurrentGoalEventRequirements } from "./event-facts-requirements.js";
import { mapReportEvent, mapStoredWorkEvent, mapTimelineItem } from "./event-facts-mapping.js";
import type { GoalEventCompletionContext } from "./event-state-completion.js";
import { GoalEventIntent } from "./event-intent.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_LATEST_REPORTS = 5;
const MAX_LATEST_REPORTS = 20;

export class GoalEventFacts implements GoalEventFactsApi {
  private readonly records: GoalEventFactsRepository;
  private readonly configWrites: GoalEventFactsConfig;
  private readonly state: GoalEventState;
  private readonly intent: GoalEventIntent;

  constructor(private readonly context: GoalsCommandContext) {
    this.records = new GoalEventFactsRepository(context.repository.db);
    this.configWrites = new GoalEventFactsConfig(context, this.records, (code, message, details) => context.error(code, message, details));
    this.state = new GoalEventState(
      context,
      this.records,
      new GoalEventStateRepository(context.repository.db),
      {
        requireWritableGoal: (boardId, goalId) => this.requireWritableGoal(boardId, goalId),
        actorKind: (kind) => this.actorKind(kind),
        configVersion: (boardId, goalId) => this.records.getConfig(boardId, goalId)?.current_version ?? 0,
        readCurrentRequirements: (boardId, goalId) => this.readCurrentRequirements(boardId, goalId),
        applyAgreementChange: (input, goal) => applyGoalEventAgreementChange(this.context, this.records, this.configWrites, input, goal),
        readCompletionContext: (boardId, goalId) => this.readCompletionContext(boardId, goalId),
      },
    );
    this.intent = new GoalEventIntent(context, this.records, this.state, (kind) => this.actorKind(kind));
  }

  configure(input: ConfigureGoalEventsInput): ConfigureGoalEventsResult {
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      expected_version: input.expected_version,
      types: input.types ?? [],
      adopted_planning: input.adopted_planning ?? [],
      requirement_bindings: input.requirement_bindings ?? [],
    });
    return this.context.repository.immediate(() => this.configureInTransaction(input, hash, false));
  }

  configureRequested(
    input: ConfigureGoalEventsApplicationInput,
    resolveAdoption: (boardId: string, requested: GoalEventAdoptedPlanningRequest[]) => ResolvedPlanningEventAdoption,
  ): ConfigureGoalEventsResult {
    const originalHash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      expected_version: input.expected_version,
      types: input.types ?? [],
      adopted_planning: input.adopted_planning ?? null,
      adopt_default_requirement_ids: input.adopt_default_requirement_ids ?? [],
      requirement_bindings: input.requirement_bindings ?? [],
      expected_agreement_version: input.expected_agreement_version ?? null,
    });
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<Omit<ConfigureGoalEventsResult, "replayed">>(
        input.board_id, input.actor_id, "configure_goal_events_request", input.idempotency_key, originalHash,
      );
      if (replay) return { ...replay, replayed: true };

      const requested = input.adopted_planning;
      const resolved = requested && requested.length > 0
        ? resolveAdoption(input.board_id, requested)
        : { adopted_planning: [] as ResolvedPlanningEventAdoption["adopted_planning"], types: [] as GoalEventTypeDefinitionInput[], default_requirements: [] };
      const selectedIds = new Set((input.adopt_default_requirement_ids ?? []).map((value) => value.trim()).filter(Boolean));
      if (selectedIds.size) {
        const available = new Map(resolved.default_requirements.map((requirement) => [requirement.requirement_id, requirement]));
        for (const requirementId of selectedIds) {
          if (!available.has(requirementId)) {
            throw this.context.error(
              "event_config.default_requirement_not_found",
              `采用的规划里没有默认要求 ${requirementId}`,
              { requirement_id: requirementId },
            );
          }
        }
      }
      const instantiated = resolved.default_requirements
        .filter((requirement) => selectedIds.has(requirement.requirement_id))
        .map((requirement) => ({
          requirement_id: instantiatePlanningRequirementId(input.goal_id, requirement.requirement_id),
          statement: requirement.statement,
          bound_type_id: requirement.bound_type_id,
          human_decision_required: false,
          source: {
            kind: "planning" as const,
            template_requirement_id: requirement.requirement_id,
            methods: requirement.sources ?? [],
          },
        }));
      if (instantiated.length && !Number.isInteger(input.expected_agreement_version)) {
        throw this.context.error(
          "event_agreement.expected_agreement_version_required",
          "采用规划默认要求时需要 expected_agreement_version",
        );
      }
      const innerInput: ConfigureGoalEventsInput = {
        board_id: input.board_id,
        goal_id: input.goal_id,
        actor_id: input.actor_id,
        actor_kind: input.actor_kind,
        expected_version: input.expected_version,
        idempotency_key: input.idempotency_key,
        types: [...resolved.types, ...(input.types ?? [])],
        requirement_bindings: input.requirement_bindings,
        ...(requested === undefined ? {} : { adopted_planning: resolved.adopted_planning }),
      };
      const innerHash = requestHash({
        board_id: innerInput.board_id,
        goal_id: innerInput.goal_id,
        expected_version: innerInput.expected_version,
        types: innerInput.types ?? [],
        adopted_planning: innerInput.adopted_planning ?? [],
        requirement_bindings: innerInput.requirement_bindings ?? [],
      });
      let result = this.configureInTransaction(innerInput, innerHash, instantiated.length > 0);
      if (instantiated.length) {
        const agreed = this.state.setAgreement({
          board_id: input.board_id,
          goal_id: input.goal_id,
          actor_id: input.actor_id,
          actor_kind: input.actor_kind,
          idempotency_key: `${input.idempotency_key}:defaults`,
          expected_config_version: result.config.version,
          expected_agreement_version: input.expected_agreement_version!,
          new_requirements: instantiated,
        });
        result = {
          config: this.configView(input.board_id, input.goal_id),
          event_id: agreed.event_id,
          observed_event_cursor: agreed.observed_event_cursor,
          replayed: result.replayed,
        };
      }
      this.context.remember(
        input.board_id,
        input.actor_id,
        "configure_goal_events_request",
        input.idempotency_key,
        originalHash,
        { config: result.config, event_id: result.event_id, observed_event_cursor: result.observed_event_cursor },
        this.context.now().toISOString(),
      );
      return result;
    });
  }

  private configureInTransaction(
    input: ConfigureGoalEventsInput,
    hash: string,
    pendingRequirementAdds = false,
  ): ConfigureGoalEventsResult {
      const replay = this.context.replay<Omit<ConfigureGoalEventsResult, "replayed">>(
        input.board_id, input.actor_id, "configure_goal_events", input.idempotency_key, hash,
      );
      if (replay) return { ...replay, replayed: true };

      const goal = this.requireWritableGoal(input.board_id, input.goal_id);
      const current = this.records.getConfig(input.board_id, input.goal_id);
      const currentVersion = current?.current_version ?? 0;
      if (input.expected_version !== currentVersion) {
        throw this.context.error(
          "event_config.version_conflict",
          `配置版本已是 ${currentVersion}，不能用期望版本 ${input.expected_version} 覆盖`,
          { current_version: currentVersion, expected_version: input.expected_version },
        );
      }

      const actorKind = this.actorKind(input.actor_kind);
      const nextVersion = currentVersion + 1;
      const at = this.context.now().toISOString();
      const addedTypes = this.configWrites.applyTypes(goal, input, nextVersion, at);
      const addedRequirements = this.configWrites.applyRequirements(goal, [], input.actor_id, addedTypes, nextVersion, at);
      const addedBindings = this.configWrites.applyBindings(goal, input, addedTypes, addedRequirements, nextVersion, at);
      const adoptedPlanning = normalizeAdoptedPlanning(
        this.error,
        input.adopted_planning,
        currentVersion === 0 ? [] : this.records.listAdoptedPlanning(goal.board_id, goal.goal_id, currentVersion),
      );
      if (
        addedTypes.length === 0
        && addedBindings.length === 0
        && JSON.stringify(adoptedPlanning) === JSON.stringify(currentVersion === 0 ? [] : this.records.listAdoptedPlanning(goal.board_id, goal.goal_id, currentVersion))
      ) {
        if (!pendingRequirementAdds) {
          throw this.context.error("event_config.no_changes", "配置没有增加类型、类型版本、绑定或规划来源");
        }
        return {
          config: this.configView(goal.board_id, goal.goal_id),
          event_id: "",
          observed_event_cursor: this.context.repository.eventCursor(goal.board_id),
          replayed: false,
        };
      }

      const eventId = `gevt-${randomUUID()}`;
      this.records.upsertConfig({
        board_id: goal.board_id,
        goal_id: goal.goal_id,
        current_version: nextVersion,
        updated_at: at,
        updated_by: input.actor_id,
      });
      this.records.insertConfigVersion({
        boardId: goal.board_id,
        goalId: goal.goal_id,
        version: nextVersion,
        actorId: input.actor_id,
        adoptedPlanning,
        createdAt: at,
        configEventId: eventId,
      });
      const payload = {
        config_version: nextVersion,
        types: addedTypes,
        extra_requirements: addedRequirements,
        requirement_bindings: addedBindings,
        adopted_planning: adoptedPlanning,
      };
      const cursor = this.context.repository.appendEvent({
        eventId,
        boardId: goal.board_id,
        actorId: input.actor_id,
        type: "goal.event_config.updated",
        objectType: "goal_event_config",
        objectId: goal.goal_id,
        reason: "登记 Goal 局部事件配置",
        payload,
        at,
      });
      this.records.insertWorkEvent({
        event_id: eventId,
        board_id: goal.board_id,
        goal_id: goal.goal_id,
        kind: "configuration",
        type_id: null,
        type_version: null,
        title: addedTypes.length === 1 ? `新增记录方式：${addedTypes[0]!.name}` : "更新当前 Goal 的事件配置",
        payload,
        actor_id: input.actor_id,
        actor_kind: actorKind,
        received_at: at,
        journal_seq: cursor,
        config_version: nextVersion,
      });
      this.state.adoptOwner({
        board_id: goal.board_id,
        goal_id: goal.goal_id,
        actor_id: input.actor_id,
        source: "configuration",
        outcome: goal.outcome,
      });
      const outcome = { config: this.configView(goal.board_id, goal.goal_id), event_id: eventId, observed_event_cursor: cursor };
      this.context.remember(goal.board_id, input.actor_id, "configure_goal_events", input.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
  }

  report(input: ReportGoalEventsInput): ReportGoalEventsRecordedResult {
    const progress = parseOptionalReportProgress((code, message, details) => this.context.error(code, message, details), input.progress);
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      events: input.events,
      progress,
    });
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<Omit<ReportGoalEventsRecordedResult, "replayed">>(
        input.board_id, input.actor_id, "report_goal_events", input.idempotency_key, hash,
      );
      if (replay) return { ...replay, replayed: true };

      const goal = this.requireWritableGoal(input.board_id, input.goal_id);
      if (!this.state.isEventStateOwner(goal.board_id, goal.goal_id)) {
        throw this.context.error(
          "event_state.not_owner",
          "这个 Goal 还没有事件状态归属。请先保存意图或登记事件配置，不要把旧完成入口和新状态效果混用",
        );
      }
      if (!Array.isArray(input.events) || input.events.length === 0) {
        throw this.context.error("event_report.empty_batch", "至少需要一条工作事实");
      }
      const prepared = input.events.map((item, index) => this.configWrites.prepareReport(goal, item, index));
      const at = this.context.now().toISOString();
      const actorKind = this.actorKind(input.actor_kind);
      const stored: GoalReportWorkEventRecord[] = [];
      for (const item of prepared) {
        const eventId = `gevt-${randomUUID()}`;
        const cursor = this.context.repository.appendEvent({
          eventId,
          boardId: goal.board_id,
          actorId: input.actor_id,
          type: "goal.work_event.recorded",
          objectType: "goal_work_event",
          objectId: eventId,
          reason: item.title,
          payload: {
            type_id: item.type.type_id,
            type_version: item.type.version,
            fields: item.fields,
            judgments: item.judgments,
          },
          at,
        });
        const event: StoredWorkEvent = {
          event_id: eventId,
          board_id: goal.board_id,
          goal_id: goal.goal_id,
          kind: "report",
          type_id: item.type.type_id,
          type_version: item.type.version,
          title: item.title,
          payload: item.fields,
          actor_id: input.actor_id,
          actor_kind: actorKind,
          received_at: at,
          journal_seq: cursor,
          config_version: this.records.getConfig(goal.board_id, goal.goal_id)?.current_version ?? null,
        };
        this.records.insertWorkEvent(event);
        this.records.insertJudgments(eventId, item.judgments);
        stored.push(mapReportEvent(this.records, event));
      }
      const judged = [...new Set(prepared.flatMap((item) => item.judgments.map((judgment) => judgment.requirement_id)))];
      this.state.reassessAfterReports(goal, input.actor_id, actorKind, judged);
      if (progress) {
        this.state.writeProgress(goal, input.actor_id, actorKind, {
          summary: progress.summary,
          based_on_cursor: this.records.maxGoalCursor(goal.board_id, goal.goal_id),
          next_step: progress.next_step,
          next_actor: progress.next_actor,
        });
      }
      const outcome = {
        events: stored,
        observed_event_cursor: this.context.repository.eventCursor(goal.board_id),
      };
      this.context.remember(goal.board_id, input.actor_id, "report_goal_events", input.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
    });
  }

  readConfig(boardId: string, goalId: string): GoalEventConfigView {
    this.context.requireGoal(boardId, goalId);
    return this.configView(boardId, goalId);
  }

  listEvents(boardId: string, goalId: string, query: GoalEventListQuery = {}): GoalEventListPage {
    this.context.requireGoal(boardId, goalId);
    const afterCursor = query.after_cursor ?? 0;
    if (!Number.isInteger(afterCursor) || afterCursor < 0) {
      throw this.context.error("event_list.invalid_cursor", "分页游标必须是非负整数");
    }
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw this.context.error("event_list.invalid_limit", `每页最多 ${MAX_PAGE_SIZE} 条`);
    }
    const rows = this.records.listWorkEvents(boardId, goalId, afterCursor, limit);
    return {
      events: rows.map((row) => mapStoredWorkEvent(this.records, row)),
      next_cursor: rows.length === limit ? rows[rows.length - 1]!.journal_seq : null,
      observed_event_cursor: this.context.repository.eventCursor(boardId),
    };
  }

  listLatestEvents(boardId: string, goalId: string, query: GoalEventHistoryQuery = {}): GoalEventHistoryPage {
    const rows = this.latestWorkEventRows(boardId, goalId, query);
    return {
      events: rows.map((row) => mapStoredWorkEvent(this.records, row)),
      next_cursor: rows.length === (query.limit ?? DEFAULT_PAGE_SIZE) ? rows[rows.length - 1]!.journal_seq : null,
      observed_event_cursor: this.context.repository.eventCursor(boardId),
    };
  }

  listLatestTimeline(boardId: string, goalId: string, query: GoalEventHistoryQuery = {}): GoalEventTimelinePage {
    const rows = this.latestWorkEventRows(boardId, goalId, query);
    return {
      items: rows.map((row) => mapTimelineItem(this.records, row)),
      next_cursor: rows.length === (query.limit ?? DEFAULT_PAGE_SIZE) ? rows[rows.length - 1]!.journal_seq : null,
      observed_event_cursor: this.context.repository.eventCursor(boardId),
    };
  }

  listLatestReports(boardId: string, goalId: string, query: GoalEventLatestReportsQuery = {}): GoalEventLatestReports {
    this.context.requireGoal(boardId, goalId);
    const limit = query.limit ?? DEFAULT_LATEST_REPORTS;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LATEST_REPORTS) {
      throw this.context.error("event_list.invalid_limit", `最新报告最多 ${MAX_LATEST_REPORTS} 条`);
    }
    return {
      reports: this.records.listLatestReportEvents(boardId, goalId, limit).map((row) => mapReportEvent(this.records, row)),
      observed_event_cursor: this.context.repository.eventCursor(boardId),
    };
  }

  readEvent(boardId: string, goalId: string, eventId: string): GoalWorkEventRecord {
    this.context.requireGoal(boardId, goalId);
    const row = this.records.getWorkEvent(boardId, goalId, eventId);
    if (!row) throw this.context.error("event.not_found", `事件不存在: ${eventId}`);
    return mapStoredWorkEvent(this.records, row);
  }

  readCurrentRequirements(boardId: string, goalId: string): GoalEventRequirementStatus[] {
    return readCurrentGoalEventRequirements(this.context, this.records, boardId, goalId);
  }

  readIntentSourceKind(boardId: string, goalId: string): GoalIntentSourceKind | null {
    this.context.requireGoal(boardId, goalId);
    const row = this.records.getIntentCreatedEvent(boardId, goalId);
    const value = row?.payload.source_kind;
    if (value === "web" || value === "onboarding" || value === "feed" || value === "runtime" || value === "tree") {
      return value;
    }
    return null;
  }

  readObservedEventCursor(boardId: string): number {
    return this.context.repository.eventCursor(boardId);
  }

  private readCompletionContext(boardId: string, goalId: string): GoalEventCompletionContext {
    const openDependencies = this.context.repository.db.prepare(`
      SELECT g.goal_id, g.title, g.fulfillment_state
      FROM goal_relations r
      JOIN goals g ON g.goal_id = r.to_goal_id
      WHERE r.board_id = ? AND r.from_goal_id = ?
        AND r.type = 'depends_on' AND r.state = 'active'
      ORDER BY g.goal_id
    `).all(boardId, goalId) as Array<{ goal_id: string; title: string; fulfillment_state: string }>;
    return {
      open_dependencies: openDependencies
        .filter((row) => row.fulfillment_state !== "satisfied")
        .map((row) => ({ goal_id: row.goal_id, title: row.title })),
      human_approval_required: false,
      blocking_risks: [],
    };
  }

  isEventStateOwner(boardId: string, goalId: string): boolean {
    this.context.requireGoal(boardId, goalId);
    return this.state.isEventStateOwner(boardId, goalId);
  }

  readWorkState(boardId: string, goalId: string) {
    return this.state.readWorkState(boardId, goalId);
  }

  runImmediate<T>(operation: () => T): T {
    return this.context.repository.immediate(operation);
  }

  adoptOwner(input: {
    board_id: string;
    goal_id: string;
    actor_id: string;
    source: "intent" | "configuration" | "continue" | "migration";
    outcome?: string;
  }): void {
    this.state.adoptOwner(input);
  }

  replayIntent(boardId: string, actorId: string, idempotencyKey: string, hash: string): CreateGoalIntentResult | null {
    return this.intent.replay(boardId, actorId, idempotencyKey, hash);
  }

  rememberIntent(
    boardId: string,
    actorId: string,
    idempotencyKey: string,
    hash: string,
    result: CreateGoalIntentResult,
    at: string,
  ): void {
    this.intent.remember(boardId, actorId, idempotencyKey, hash, result, at);
  }

  recordIntentArtifacts(input: {
    board_id: string;
    goal_id: string;
    actor_id: string;
    actor_kind?: "user" | "runtime";
    source_kind?: GoalIntentSourceKind;
    outcome?: string;
    requirements?: CreateGoalIntentRequirementInput[];
  }): void {
    this.intent.recordArtifacts(input);
  }

  recordProgress(input: RecordGoalProgressSummaryInput) {
    return this.state.recordProgress(input);
  }

  applyConcern(input: ApplyGoalConcernInput) {
    return this.state.applyConcern(input);
  }

  requestDecision(input: RequestGoalDecisionInput) {
    return this.state.requestDecision(input);
  }

  citeDecision(input: CiteGoalDecisionInput) {
    return this.state.citeDecision(input);
  }

  recordTrustedDecision(
    input: RecordGoalUserDecisionInput,
    persistGovernance: (normalized: RecordGoalUserDecisionInput) => GoalEventTrustedDecisionRecord,
  ) {
    return this.state.recordTrustedDecision(input, persistGovernance);
  }

  setAgreement(input: SetGoalEventAgreementInput) {
    return this.state.setAgreement(input);
  }

  submitClosure(input: SubmitGoalEventClosureInput) {
    return this.state.submitClosure(input);
  }

  resumeWork(input: ResumeGoalEventWorkInput) {
    return this.state.resumeWork(input);
  }

  recordNote(input: RecordGoalNoteInput) {
    return this.state.recordNote(input);
  }

  private requireWritableGoal(boardId: string, goalId: string): GoalRecord {
    this.context.requireBoard(boardId);
    const goal = this.context.requireGoal(boardId, goalId);
    if (goal.trashed_at) {
      throw this.context.error("goal.trashed", "回收站中的 Goal 不能登记事件配置或上报工作事实");
    }
    if (goal.archived_at) {
      throw this.context.error("goal.archived", "已归档的 Goal 不能登记事件配置或上报工作事实");
    }
    return goal;
  }

  private configView(boardId: string, goalId: string): GoalEventConfigView {
    const current = this.records.getConfig(boardId, goalId);
    return {
      board_id: boardId,
      goal_id: goalId,
      version: current?.current_version ?? 0,
      types: this.records.listLatestTypes(boardId, goalId),
      adopted_planning: current ? this.records.listAdoptedPlanning(boardId, goalId, current.current_version) : [],
      extra_requirements: this.records.listExtraRequirements(boardId, goalId),
      requirement_bindings: this.records.listBindings(boardId, goalId),
      updated_at: current?.updated_at ?? null,
      updated_by: current?.updated_by ?? null,
    };
  }

  private latestWorkEventRows(boardId: string, goalId: string, query: GoalEventHistoryQuery) {
    this.context.requireGoal(boardId, goalId);
    const beforeCursor = query.before_cursor;
    if (beforeCursor != null && (!Number.isInteger(beforeCursor) || beforeCursor < 1)) {
      throw this.context.error("event_list.invalid_cursor", "最新页游标必须是正整数");
    }
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw this.context.error("event_list.invalid_limit", `每页最多 ${MAX_PAGE_SIZE} 条`);
    }
    return this.records.listLatestWorkEvents(boardId, goalId, beforeCursor ?? null, limit);
  }

  private actorKind(kind: "user" | "runtime" | undefined): "user" | "runtime" | null {
    if (kind == null) return null;
    if (kind !== "user" && kind !== "runtime") throw this.context.error("event_report.invalid_actor_kind", "actor_kind 只能是 user 或 runtime");
    return kind;
  }

  private readonly error = (code: string, message: string, details?: Record<string, unknown>) =>
    this.context.error(code, message, details);
}
