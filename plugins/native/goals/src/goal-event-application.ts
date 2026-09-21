import { createHash } from "node:crypto";
import {
  goalEventWorkStatuses,
  type ApplyGoalConcernInput,
  type CiteGoalDecisionInput,
  type ConfigureGoalEventsApplicationInput,
  type ConfigureGoalEventsResult,
  type CreateGoalIntentInput,
  type CreateGoalIntentResult,
  type GoalEventAgreementResult,
  type GoalEventClosureResult,
  type GoalEventConcernResult,
  type GoalEventDecisionRequestResult,
  type GoalEventDecisionResult,
  type GoalEventDirectoryItem,
  type GoalEventDirectoryPage,
  type GoalEventDirectoryQuery,
  type GoalEventFactsApi,
  type GoalEventHistoryPage,
  type GoalEventHistoryQuery,
  type GoalEventListPage,
  type GoalEventListQuery,
  type GoalEventProgressResult,
  type GoalEventReportSummary,
  type GoalEventResumeResult,
  type GoalEventStateView,
  type GoalEventTimelinePage,
  type GoalEventTrustedAuthority,
  type GoalEventTrustedDecisionRecord,
  type GoalEventWorkGap,
  type GoalRecord,
  type GoalsCommandApi,
  type GoalsPlanningApi,
  type GoalsQueryApi,
  type GoalWorkEventRecord,
  type RecordGoalProgressSummaryInput,
  type RecordGoalUserDecisionInput,
  type ReportGoalEventsInput,
  type ReportGoalEventsResult,
  type RequestGoalDecisionInput,
  type RecordGoalNoteInput,
  type ResumeGoalEventWorkInput,
  type SetGoalEventAgreementInput,
  type SubmitGoalEventClosureInput,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { MolisWorkV1Error } from "./errors.js";

const STATE_REPORT_LIMIT = 5;

export interface GoalEventApplicationPorts {
  query: Pick<GoalsQueryApi, "getGoal" | "listGoals">;
  commands: Pick<GoalsCommandApi, "createGoal" | "addRelation">;
  events: GoalEventFactsApi;
  planning: Pick<GoalsPlanningApi, "resolveEventAdoption">;
  recordTrustedDecision?: (input: RecordGoalUserDecisionInput) => GoalEventTrustedDecisionRecord;
}

/** Compose intent, planning adoption, event facts and typed state effects without a second state machine. */
export class GoalEventApplication {
  constructor(private readonly ports: GoalEventApplicationPorts) {}

  createIntent(input: CreateGoalIntentInput): CreateGoalIntentResult {
    assertCreateIntentKeys(input);
    const title = input.title?.trim();
    if (!title) throw new MolisWorkV1Error("goal.title_required", "意图创建只需要能辨认的标题");
    const outcome = input.outcome?.trim() ?? "";
    const why = input.why?.trim() ?? "";
    const businessLogic = input.business_logic?.trim() ?? "";
    const priority = input.priority;
    if (priority != null && (!Number.isFinite(priority) || priority < 0 || priority > 100)) {
      throw new MolisWorkV1Error("goal.priority_invalid", "priority 必须是 0 到 100 的数字");
    }
    const hash = intentHash(input);
    return this.ports.events.runImmediate(() => {
      const replay = this.ports.events.replayIntent(input.board_id, input.actor_id, input.idempotency_key, hash);
      if (replay) return { ...replay, replayed: true };
      const result = this.ports.commands.createGoal(input.board_id, {
        goal_id: input.goal_id?.trim() || undefined,
        title,
        outcome,
        why,
        business_logic: businessLogic,
        ...(priority != null ? { priority } : {}),
        definition_state: "draft",
        decomposition_state: "abstract",
        acceptance_criteria: [],
      }, {
        actor_id: input.actor_id,
        actor_kind: input.actor_kind,
        idempotency_key: `${input.idempotency_key}::identity`,
        reason: "保存原始意图",
      });
      this.ports.events.recordIntentArtifacts({
        board_id: result.goal.board_id,
        goal_id: result.goal.goal_id,
        actor_id: input.actor_id,
        actor_kind: input.actor_kind,
        source_kind: input.source_kind,
        outcome,
        requirements: input.requirements,
      });
      const parentGoalId = input.parent_goal_id?.trim();
      if (parentGoalId) {
        this.ports.commands.addRelation(input.board_id, {
          from_goal_id: result.goal.goal_id,
          to_goal_id: parentGoalId,
          type: "part_of",
          state: "active",
          reason: "创建 Goal 时指定上级 Goal",
        }, {
          actor_id: input.actor_id,
          idempotency_key: `${input.idempotency_key}::parent`,
        });
      }
      for (const dependencyGoalId of uniqueIds(input.dependency_goal_ids)) {
        this.ports.commands.addRelation(input.board_id, {
          from_goal_id: result.goal.goal_id,
          to_goal_id: dependencyGoalId,
          type: "depends_on",
          state: "active",
          reason: "创建 Goal 时指定上游依赖",
        }, {
          actor_id: input.actor_id,
          idempotency_key: `${input.idempotency_key}::dep::${dependencyGoalId}`,
        });
      }
      const created: CreateGoalIntentResult = {
        goal: {
          goal_id: result.goal.goal_id,
          board_id: result.goal.board_id,
          title: result.goal.title,
          outcome: result.goal.outcome,
        },
        replayed: false,
        observed_event_cursor: this.ports.events.readObservedEventCursor(result.goal.board_id),
        recorded: true,
        completion_effect: false,
      };
      this.ports.events.rememberIntent(
        input.board_id, input.actor_id, input.idempotency_key, hash, created, new Date().toISOString(),
      );
      return created;
    });
  }

  adoptOwner(input: Parameters<GoalEventFactsApi["adoptOwner"]>[0]): void {
    this.ports.events.adoptOwner(input);
  }

  readState(boardId: string, goalId: string): GoalEventStateView {
    const goal = this.requireGoal(boardId, goalId);
    const config = this.ports.events.readConfig(boardId, goalId);
    const requirements = this.ports.events.readCurrentRequirements(boardId, goalId);
    const work = this.ports.events.readWorkState(boardId, goalId);
    const latest = this.ports.events.listLatestReports(boardId, goalId, { limit: STATE_REPORT_LIMIT });
    const latestReports = latest.reports.map(reportSummary);
    const gaps: GoalEventWorkGap[] = requirements
      .filter((requirement) => !requirement.currently_satisfied)
      .map((requirement) => ({
        requirement_id: requirement.requirement_id,
        statement: requirement.statement,
        current_verdict: requirement.current_report?.verdict ?? null,
        human_decision_required: requirement.human_decision_required,
      }));
    return {
      board_id: boardId,
      goal_id: goal.goal_id,
      intent: {
        title: goal.title,
        why: goal.why,
        business_logic: goal.business_logic,
        source_kind: intentSourceKind(work.owner?.source, this.ports.events.readIntentSourceKind(boardId, goalId)),
      },
      config,
      requirements,
      latest_reports: latestReports,
      gaps,
      observed_event_cursor: latest.observed_event_cursor,
      goal_event_cursor: this.ports.events.listLatestTimeline(boardId, goalId, { limit: 1 }).items[0]?.journal_seq ?? 0,
      event_list_next_cursor: null,
      owner: work.owner,
      work_status: work.work_status,
      agreement: work.agreement,
      progress_summary: work.progress_summary,
      concerns: work.concerns,
      pending_decisions: work.pending_decisions,
      applied_decisions: work.applied_decisions,
      current_decisions: work.current_decisions,
      closure: work.closure,
      imported_completion: work.imported_completion,
      can_record: canRecord(goal, work.owner != null),
      recorded_not_completed: work.work_status !== "completed",
      completion_effect: work.work_status === "completed" && goal.fulfillment_state === "satisfied",
    };
  }

  listGoals(query: GoalEventDirectoryQuery): GoalEventDirectoryPage {
    const limit = query.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new MolisWorkV1Error("goal_list.invalid_limit", "列表数量必须是 1 到 100");
    }
    const workStatus = query.work_status as string | undefined;
    if (workStatus != null && !(goalEventWorkStatuses as readonly string[]).includes(workStatus)) {
      throw new MolisWorkV1Error("goal_list.invalid_status", "不支持的工作状态");
    }
    const cursor = query.after_cursor === undefined ? null : parseDirectoryCursor(query.after_cursor);
    const goals = this.ports.query.listGoals(query.board_id)
      .filter((goal) => !goal.trashed_at && !goal.archived_at)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || left.goal_id.localeCompare(right.goal_id));
    const summaries = [];
    for (const goal of goals) {
      const state = this.readState(query.board_id, goal.goal_id);
      if (query.work_status && state.work_status !== query.work_status) continue;
      const item = directoryItem(goal, state);
      if (cursor && !isAfterDirectoryCursor(item, cursor)) continue;
      summaries.push(item);
    }
    const overflow = summaries.length > limit;
    const items = summaries.slice(0, limit);
    const last = items.at(-1);
    return {
      goals: items,
      next_cursor: overflow && last ? `${last.updated_at}|${last.goal_id}` : null,
      observed_event_cursor: items[0] ? this.readState(query.board_id, items[0].goal_id).observed_event_cursor : 0,
    };
  }

  readDirectoryItem(boardId: string, goalId: string): GoalEventDirectoryItem | null {
    const id = goalId.trim();
    if (!id) return null;
    const goal = this.ports.query.getGoal(boardId, id);
    if (!goal || goal.trashed_at || goal.archived_at) return null;
    return directoryItem(goal, this.readState(boardId, goal.goal_id));
  }

  configure(input: ConfigureGoalEventsApplicationInput): ConfigureGoalEventsResult {
    return this.ports.events.configureRequested(
      input,
      (boardId, requested) => this.ports.planning.resolveEventAdoption(boardId, requested),
    );
  }

  report(input: ReportGoalEventsInput): ReportGoalEventsResult {
    const result = this.ports.events.report(input);
    const state = this.readState(input.board_id, input.goal_id);
    return {
      events: result.events,
      replayed: result.replayed,
      observed_event_cursor: state.observed_event_cursor,
      goal_event_cursor: state.goal_event_cursor,
      work_status: state.work_status,
      gaps: state.gaps,
      progress_summary: state.progress_summary,
      completion_effect: state.completion_effect,
      can_record: state.can_record,
    };
  }

  listEvents(boardId: string, goalId: string, query?: GoalEventListQuery): GoalEventListPage {
    return this.ports.events.listEvents(boardId, goalId, query);
  }

  listLatestEvents(boardId: string, goalId: string, query?: GoalEventHistoryQuery): GoalEventHistoryPage {
    return this.ports.events.listLatestEvents(boardId, goalId, query);
  }

  listLatestTimeline(boardId: string, goalId: string, query?: GoalEventHistoryQuery): GoalEventTimelinePage {
    return this.ports.events.listLatestTimeline(boardId, goalId, query);
  }

  readEvent(boardId: string, goalId: string, eventId: string): GoalWorkEventRecord {
    return this.ports.events.readEvent(boardId, goalId, eventId);
  }

  isEventStateOwner(boardId: string, goalId: string): boolean {
    return this.ports.events.isEventStateOwner(boardId, goalId);
  }

  readProgressReceipt(boardId: string, goalId: string, actorId: string, key: string): GoalEventProgressResult | null {
    return this.ports.events.readProgressReceipt(boardId, goalId, actorId, key);
  }

  recordProgress(input: RecordGoalProgressSummaryInput): GoalEventProgressResult {
    return this.ports.events.recordProgress(input);
  }

  applyConcern(input: ApplyGoalConcernInput): GoalEventConcernResult {
    return this.ports.events.applyConcern(input);
  }

  requestDecision(input: RequestGoalDecisionInput): GoalEventDecisionRequestResult {
    return this.ports.events.requestDecision(input);
  }

  citeDecision(input: CiteGoalDecisionInput): GoalEventDecisionResult {
    return this.ports.events.citeDecision(input);
  }

  recordTrustedDecision(input: RecordGoalUserDecisionInput): GoalEventDecisionResult {
    const persist = this.ports.recordTrustedDecision;
    if (!persist) {
      throw new MolisWorkV1Error(
        "event_decision.untrusted_actor",
        "用户决定必须经 Host 受保护入口与 Governance 来源校验，不能由 Runtime 自填",
      );
    }
    return this.ports.events.recordTrustedDecision(input, (normalized) => persist(normalized));
  }

  setAgreement(input: SetGoalEventAgreementInput): GoalEventAgreementResult {
    return this.ports.events.setAgreement(input);
  }

  submitClosure(input: SubmitGoalEventClosureInput): GoalEventClosureResult {
    return this.ports.events.submitClosure(input);
  }

  resumeWork(input: ResumeGoalEventWorkInput): GoalEventResumeResult {
    return this.ports.events.resumeWork(input);
  }

  recordNote(input: RecordGoalNoteInput) {
    return this.ports.events.recordNote(input);
  }

  private requireGoal(boardId: string, goalId: string): GoalRecord {
    const goal = this.ports.query.getGoal(boardId, goalId);
    if (!goal) throw new MolisWorkV1Error("goal.not_found", `找不到这个 Goal: ${goalId}`);
    return goal;
  }
}

export function hostEventDecisionAuthority(
  source: GoalEventTrustedAuthority["authority_source"],
  boardId: string,
  actorId: string,
  idempotencyKey: string,
): GoalEventTrustedAuthority {
  return {
    actor_id: actorId,
    actor_kind: "user",
    authority_source: source,
    conversation_ref: `${source}:${boardId}`,
    message_ref: `${source}-event-decision:${idempotencyKey}`,
  };
}

function reportSummary(event: Extract<GoalWorkEventRecord, { kind: "report" }>): GoalEventReportSummary {
  return {
    event_id: event.event_id,
    title: event.title,
    type_id: event.type?.type_id ?? null,
    type_version: event.type?.version ?? null,
    received_at: event.received_at,
    journal_seq: event.journal_seq,
    judgments: event.judgments,
  };
}

const CREATE_INTENT_KEYS = new Set([
  "board_id", "title", "outcome", "why", "business_logic", "priority", "goal_id",
  "actor_id", "actor_kind", "idempotency_key", "parent_goal_id", "dependency_goal_ids",
  "requirements", "source_kind",
]);

function assertCreateIntentKeys(input: CreateGoalIntentInput): void {
  const unexpected = Object.keys(input).filter((key) => !CREATE_INTENT_KEYS.has(key));
  if (unexpected.length) {
    throw new MolisWorkV1Error("mcp.unexpected_field", `不能使用未许可字段：${unexpected.join("、")}`, { fields: unexpected });
  }
}

function uniqueIds(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function intentHash(input: CreateGoalIntentInput): string {
  return createHash("sha256").update(JSON.stringify({
    board_id: input.board_id,
    title: input.title,
    outcome: input.outcome ?? "",
    why: input.why ?? "",
    business_logic: input.business_logic ?? "",
    priority: input.priority ?? null,
    goal_id: input.goal_id ?? "",
    parent_goal_id: input.parent_goal_id ?? "",
    dependency_goal_ids: uniqueIds(input.dependency_goal_ids),
    requirements: input.requirements ?? [],
    source_kind: input.source_kind ?? "web",
  })).digest("hex");
}

function canRecord(goal: GoalRecord, owned: boolean): boolean {
  return owned && !goal.trashed_at && !goal.archived_at;
}

function intentSourceKind(
  source: "intent" | "configuration" | "continue" | "migration" | null | undefined,
  stored: GoalEventStateView["intent"]["source_kind"],
): GoalEventStateView["intent"]["source_kind"] {
  if (source === "migration") return "migration";
  return stored;
}

function nextHint(state: GoalEventStateView): string {
  if (state.work_status === "completed") return "已完成，明确继续后开启新一轮";
  if (state.work_status === "cancelled") return "已取消，普通记录不会重开";
  if (state.pending_decisions.length) return "可记录，待用户决定";
  if (state.concerns.some((item) => item.status === "open" && item.blocks_closure) || state.gaps.length) {
    return "可记录，尚不可完成";
  }
  return "可记录";
}

function directoryItem(goal: GoalRecord, state: GoalEventStateView): GoalEventDirectoryItem {
  return {
    goal_id: goal.goal_id,
    title: goal.title,
    work_status: state.work_status,
    completion_effect: state.completion_effect,
    can_record: state.can_record,
    next_hint: nextHint(state),
    unmet_requirement_count: state.gaps.length,
    pending_decision_count: state.pending_decisions.length,
    blocking_concern_count: state.concerns.filter((item) => item.status === "open" && item.blocks_closure).length,
    updated_at: goal.updated_at,
  };
}

const DIRECTORY_CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function parseDirectoryCursor(cursor: string): { updated_at: string; goal_id: string } {
  const separator = cursor.indexOf("|");
  const updated_at = separator >= 0 ? cursor.slice(0, separator) : "";
  const goal_id = separator >= 0 ? cursor.slice(separator + 1) : "";
  if (!DIRECTORY_CURSOR_TIME.test(updated_at) || !goal_id || !Number.isFinite(Date.parse(updated_at))) {
    throw new MolisWorkV1Error("goal_list.invalid_cursor", "列表游标无效");
  }
  return { updated_at, goal_id };
}

function isAfterDirectoryCursor(
  item: { updated_at: string; goal_id: string },
  cursor: { updated_at: string; goal_id: string },
): boolean {
  const time = item.updated_at.localeCompare(cursor.updated_at);
  if (time !== 0) return time < 0;
  return item.goal_id.localeCompare(cursor.goal_id) > 0;
}
