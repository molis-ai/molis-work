import {
  goalEventClosureKinds,
  goalEventConcernActions,
  type ApplyGoalConcernInput,
  type CiteGoalDecisionInput,
  type ConfigureGoalEventsApplicationInput,
  type CreateGoalIntentInput,
  type RecordGoalProgressSummaryInput,
  type RecordGoalUserDecisionInput,
  type RecordGoalNoteInput,
  type ReportGoalEventsInput,
  type ReportGoalWorkEventInput,
  type RequestGoalDecisionInput,
  type ResumeGoalEventWorkInput,
  type SetGoalEventAgreementInput,
  type SubmitGoalEventClosureInput,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { createGoalEventEntryClient, hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";
import { mcpWebUrl } from "./goal-presentation.js";
import type { LocalHostProjectClient } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { McpPresentationErrorFactory } from "./query-presentation.js";

const WRITE_TOOLS = new Set([
  "molis_work_v1_goal_intent_create",
  "molis_work_v1_event_configure",
  "molis_work_v1_event_report",
  "molis_work_v1_event_note",
  "molis_work_v1_event_progress",
  "molis_work_v1_event_concern",
  "molis_work_v1_event_decision_request",
  "molis_work_v1_event_cite_decision",
  "molis_work_v1_event_agree",
  "molis_work_v1_event_close",
  "molis_work_v1_event_resume",
  "molis_work_v1_event_decide",
]);

const ALLOWED_KEYS: Record<string, readonly string[]> = {
  molis_work_v1_goal_intent_create: [
    "database_path", "board_id", "actor_id", "actor_kind", "title", "outcome", "why", "business_logic",
    "priority", "goal_id", "parent_goal_id", "dependency_goal_ids", "requirements", "source_kind", "idempotency_key",
  ],
  molis_work_v1_goal_list: ["database_path", "board_id", "work_status", "limit", "after_cursor"],
  molis_work_v1_goal_state: ["database_path", "board_id", "goal_id"],
  molis_work_v1_event_configure: [
    "database_path", "board_id", "actor_id", "actor_kind", "goal_id", "expected_version",
    "expected_agreement_version", "idempotency_key",
    "types", "adopted_planning", "adopt_default_requirement_ids", "requirement_bindings",
  ],
  molis_work_v1_event_report: [
    "database_path", "board_id", "actor_id", "actor_kind", "goal_id", "idempotency_key", "events", "progress",
  ],
  molis_work_v1_event_note: [
    "database_path", "board_id", "actor_id", "actor_kind", "goal_id", "body", "idempotency_key",
  ],
  molis_work_v1_event_list: ["database_path", "board_id", "goal_id", "after_cursor", "limit"],
  molis_work_v1_event_read: ["database_path", "board_id", "goal_id", "event_id"],
  molis_work_v1_event_progress: [
    "database_path", "board_id", "actor_id", "actor_kind", "goal_id", "idempotency_key",
    "based_on_cursor", "summary", "next_step", "next_actor",
  ],
  molis_work_v1_event_concern: [
    "database_path", "board_id", "actor_id", "actor_kind", "goal_id", "idempotency_key", "action",
    "concern_id", "title", "statement", "scope", "blocks_closure", "reason",
    "supporting_event_ids", "cited_decision_id",
  ],
  molis_work_v1_event_decision_request: [
    "database_path", "board_id", "actor_id", "actor_kind", "goal_id", "idempotency_key",
    "question", "options", "purpose", "proposed_change", "scope",
  ],
  molis_work_v1_event_cite_decision: [
    "database_path", "board_id", "actor_id", "actor_kind", "goal_id", "idempotency_key", "decision_id", "scope",
  ],
  molis_work_v1_event_agree: [
    "database_path", "board_id", "actor_id", "actor_kind", "goal_id", "idempotency_key",
    "expected_config_version", "expected_agreement_version", "outcome", "new_requirements",
    "revise_requirements", "retire_requirement_ids", "cited_decision_id",
  ],
  molis_work_v1_event_close: [
    "database_path", "board_id", "actor_id", "actor_kind", "goal_id", "idempotency_key",
    "kind", "result", "reason", "expected_config_version", "expected_agreement_version",
  ],
  molis_work_v1_event_resume: [
    "database_path", "board_id", "actor_id", "actor_kind", "goal_id", "idempotency_key", "reason",
  ],
  molis_work_v1_event_decide: [
    "database_path", "board_id", "actor_id", "actor_kind", "goal_id", "idempotency_key",
    "request_id", "selected_option_id", "conclusion", "accepts_requirements", "effects",
    "authorized_change", "scope",
  ],
};

export function createMcpGoalEventHandlers(
  client: LocalHostProjectClient,
  audience: "runtime" | "management",
  createError: McpPresentationErrorFactory,
  urls: { webBaseUrl: string; projectId: string | null | undefined } = { webBaseUrl: "http://127.0.0.1:4173", projectId: null },
) {
  const events = createGoalEventEntryClient(client);
  const rejectUnknown = (name: string, input: Record<string, unknown>) => {
    const allowed = new Set(ALLOWED_KEYS[name] ?? []);
    const unexpected = Object.keys(input).filter((key) => !allowed.has(key));
    if (unexpected.length) {
      throw createError(
        "mcp.unexpected_field",
        `不能使用未许可字段：${unexpected.join("、")}`,
        { fields: unexpected },
      );
    }
  };
  const actor = (input: Record<string, unknown>) => {
    const actorId = String(input.actor_id ?? "").trim();
    if (!actorId) {
      throw createError(
        audience === "runtime" ? "mcp.runtime_identity_missing" : "mcp.actor_required",
        audience === "runtime"
          ? "宿主没有提供可信 Runtime 身份。请重新连接 Molis Work MCP，不要在参数里填用户身份。"
          : "管理入口需要 actor_id",
      );
    }
    return {
      actor_id: actorId,
      actor_kind: audience === "runtime" ? "runtime" as const : "user" as const,
    };
  };
  const withGoalUrl = <T,>(value: T, goalId: string): T & { goal_url: string } => {
    const path = urls.projectId
      ? `/projects/${encodeURIComponent(urls.projectId)}/goals/${encodeURIComponent(goalId)}`
      : `/goals/${encodeURIComponent(goalId)}`;
    return { ...value, goal_url: mcpWebUrl(path, urls.webBaseUrl, createError) };
  };

  return {
    molis_work_v1_goal_intent_create: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_goal_intent_create", input);
      const payload: CreateGoalIntentInput = {
        board_id: String(input.board_id),
        title: String(input.title ?? ""),
        outcome: input.outcome == null ? undefined : String(input.outcome),
        why: input.why == null ? undefined : String(input.why),
        business_logic: input.business_logic == null ? undefined : String(input.business_logic),
        priority: input.priority == null ? undefined : Number(input.priority),
        goal_id: input.goal_id == null ? undefined : String(input.goal_id),
        parent_goal_id: input.parent_goal_id == null ? undefined : String(input.parent_goal_id),
        dependency_goal_ids: Array.isArray(input.dependency_goal_ids) ? input.dependency_goal_ids.map(String) : undefined,
        requirements: input.requirements as CreateGoalIntentInput["requirements"],
        source_kind: audience === "runtime" ? "runtime" : undefined,
        idempotency_key: String(input.idempotency_key ?? ""),
        ...actor(input),
      };
      const created = await events.createIntent(payload);
      return withGoalUrl(created, created.goal.goal_id);
    },
    molis_work_v1_goal_list: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_goal_list", input);
      const page = await events.listGoals({
        board_id: String(input.board_id),
        work_status: input.work_status as "open" | "completed" | "cancelled" | undefined,
        limit: input.limit == null ? undefined : Number(input.limit),
        after_cursor: input.after_cursor == null ? undefined : String(input.after_cursor),
      });
      return {
        ...page,
        goals: page.goals.map((goal) => withGoalUrl(goal, goal.goal_id)),
      };
    },
    molis_work_v1_goal_state: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_goal_state", input);
      const state = await events.readState(String(input.board_id), String(input.goal_id));
      return withGoalUrl(state, String(input.goal_id));
    },
    molis_work_v1_event_configure: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_configure", input);
      const payload: ConfigureGoalEventsApplicationInput = {
        board_id: String(input.board_id),
        goal_id: String(input.goal_id),
        expected_version: Number(input.expected_version),
        idempotency_key: String(input.idempotency_key ?? ""),
        types: input.types as ConfigureGoalEventsApplicationInput["types"],
        adopted_planning: input.adopted_planning as ConfigureGoalEventsApplicationInput["adopted_planning"],
        adopt_default_requirement_ids: input.adopt_default_requirement_ids as string[] | undefined,
        expected_agreement_version: input.expected_agreement_version == null ? undefined : Number(input.expected_agreement_version),
        requirement_bindings: input.requirement_bindings as ConfigureGoalEventsApplicationInput["requirement_bindings"],
        ...actor(input),
      };
      return events.configure(payload);
    },
    molis_work_v1_event_report: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_report", input);
      const payload: ReportGoalEventsInput = {
        board_id: String(input.board_id),
        goal_id: String(input.goal_id),
        idempotency_key: String(input.idempotency_key ?? ""),
        events: (input.events as ReportGoalWorkEventInput[]) ?? [],
        progress: input.progress as ReportGoalEventsInput["progress"],
        ...actor(input),
      };
      return events.report(payload);
    },
    molis_work_v1_event_note: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_note", input);
      const payload: RecordGoalNoteInput = {
        board_id: String(input.board_id),
        goal_id: String(input.goal_id),
        idempotency_key: String(input.idempotency_key ?? ""),
        body: String(input.body ?? ""),
        ...actor(input),
      };
      return events.recordNote(payload);
    },
    molis_work_v1_event_list: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_list", input);
      return events.listEvents(String(input.board_id), String(input.goal_id), {
        after_cursor: input.after_cursor == null ? undefined : Number(input.after_cursor),
        limit: input.limit == null ? undefined : Number(input.limit),
      });
    },
    molis_work_v1_event_read: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_read", input);
      return events.readEvent(String(input.board_id), String(input.goal_id), String(input.event_id));
    },
    molis_work_v1_event_progress: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_progress", input);
      const payload: RecordGoalProgressSummaryInput = {
        board_id: String(input.board_id),
        goal_id: String(input.goal_id),
        idempotency_key: String(input.idempotency_key ?? ""),
        based_on_cursor: Number(input.based_on_cursor),
        summary: String(input.summary ?? ""),
        next_step: input.next_step == null ? undefined : String(input.next_step),
        next_actor: input.next_actor == null ? undefined : String(input.next_actor),
        ...actor(input),
      };
      return events.recordProgress(payload);
    },
    molis_work_v1_event_concern: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_concern", input);
      if (typeof input.action !== "string" || !(goalEventConcernActions as readonly string[]).includes(input.action)) {
        throw createError("event_concern.invalid_action", "Concern 动作只能是 open、resolve、accept 或 overturn", { value: input.action });
      }
      const payload: ApplyGoalConcernInput = {
        board_id: String(input.board_id),
        goal_id: String(input.goal_id),
        idempotency_key: String(input.idempotency_key ?? ""),
        action: input.action as ApplyGoalConcernInput["action"],
        concern_id: input.concern_id == null ? undefined : String(input.concern_id),
        title: input.title == null ? undefined : String(input.title),
        statement: input.statement == null ? undefined : String(input.statement),
        scope: input.scope as ApplyGoalConcernInput["scope"],
        blocks_closure: input.blocks_closure == null ? undefined : Boolean(input.blocks_closure),
        reason: input.reason == null ? undefined : String(input.reason),
        supporting_event_ids: input.supporting_event_ids as string[] | undefined,
        cited_decision_id: input.cited_decision_id == null ? undefined : String(input.cited_decision_id),
        ...actor(input),
      };
      return events.applyConcern(payload);
    },
    molis_work_v1_event_decision_request: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_decision_request", input);
      const payload: RequestGoalDecisionInput = {
        board_id: String(input.board_id),
        goal_id: String(input.goal_id),
        idempotency_key: String(input.idempotency_key ?? ""),
        question: String(input.question ?? ""),
        options: input.options as RequestGoalDecisionInput["options"],
        purpose: input.purpose as RequestGoalDecisionInput["purpose"],
        proposed_change: input.proposed_change as RequestGoalDecisionInput["proposed_change"],
        scope: input.scope as RequestGoalDecisionInput["scope"],
        ...actor(input),
      };
      return events.requestDecision(payload);
    },
    molis_work_v1_event_cite_decision: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_cite_decision", input);
      const payload: CiteGoalDecisionInput = {
        board_id: String(input.board_id),
        goal_id: String(input.goal_id),
        idempotency_key: String(input.idempotency_key ?? ""),
        decision_id: String(input.decision_id),
        scope: input.scope as CiteGoalDecisionInput["scope"],
        ...actor(input),
      };
      return events.citeDecision(payload);
    },
    molis_work_v1_event_agree: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_agree", input);
      const payload: SetGoalEventAgreementInput = {
        board_id: String(input.board_id),
        goal_id: String(input.goal_id),
        idempotency_key: String(input.idempotency_key ?? ""),
        expected_config_version: Number(input.expected_config_version),
        expected_agreement_version: Number(input.expected_agreement_version),
        outcome: input.outcome == null ? undefined : String(input.outcome),
        new_requirements: input.new_requirements as SetGoalEventAgreementInput["new_requirements"],
        revise_requirements: input.revise_requirements as SetGoalEventAgreementInput["revise_requirements"],
        retire_requirement_ids: input.retire_requirement_ids as SetGoalEventAgreementInput["retire_requirement_ids"],
        cited_decision_id: input.cited_decision_id == null ? undefined : String(input.cited_decision_id),
        ...actor(input),
      };
      return events.setAgreement(payload);
    },
    molis_work_v1_event_close: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_close", input);
      if (typeof input.kind !== "string" || !(goalEventClosureKinds as readonly string[]).includes(input.kind)) {
        throw createError("event_closure.invalid_kind", "收尾类型只能是 complete 或 cancel", { value: input.kind });
      }
      const payload: SubmitGoalEventClosureInput = {
        board_id: String(input.board_id),
        goal_id: String(input.goal_id),
        idempotency_key: String(input.idempotency_key ?? ""),
        kind: input.kind as SubmitGoalEventClosureInput["kind"],
        result: input.result == null ? undefined : String(input.result),
        reason: String(input.reason ?? ""),
        expected_config_version: Number(input.expected_config_version),
        expected_agreement_version: Number(input.expected_agreement_version),
        ...actor(input),
      };
      return events.submitClosure(payload);
    },
    molis_work_v1_event_resume: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_resume", input);
      const payload: ResumeGoalEventWorkInput = {
        board_id: String(input.board_id),
        goal_id: String(input.goal_id),
        idempotency_key: String(input.idempotency_key ?? ""),
        reason: String(input.reason ?? ""),
        ...actor(input),
      };
      return events.resumeWork(payload);
    },
    molis_work_v1_event_decide: async (input: Record<string, unknown>) => {
      rejectUnknown("molis_work_v1_event_decide", input);
      if (audience !== "management") {
        throw createError(
          "mcp.authority_denied",
          "用户决定只能由受保护的管理入口或 Web 记录。Runtime 可以请求或引用已保存决定，不能自行批准。",
        );
      }
      const actorFields = actor(input);
      const payload: RecordGoalUserDecisionInput = {
        board_id: String(input.board_id),
        goal_id: String(input.goal_id),
        idempotency_key: String(input.idempotency_key ?? ""),
        authority: hostEventDecisionAuthority(
          "management",
          String(input.board_id),
          actorFields.actor_id,
          String(input.idempotency_key ?? ""),
        ),
        request_id: input.request_id == null ? undefined : String(input.request_id),
        selected_option_id: input.selected_option_id == null ? undefined : String(input.selected_option_id),
        conclusion: String(input.conclusion ?? ""),
        accepts_requirements: input.accepts_requirements === true ? true : input.accepts_requirements === false ? false : undefined,
        effects: input.effects as RecordGoalUserDecisionInput["effects"],
        authorized_change: input.authorized_change as RecordGoalUserDecisionInput["authorized_change"],
        scope: input.scope as RecordGoalUserDecisionInput["scope"],
      };
      return events.recordTrustedDecision(payload);
    },
  };
}

export function isGoalEventTool(name: string): boolean {
  return Object.hasOwn(ALLOWED_KEYS, name);
}

export function isGoalEventWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}
