import { ActionError, type ActionCallContext, type ActionSceneDefinition, type ActionSceneConfigureOptions, type ActionSceneBinding, type ActionSceneExecutionContext, type ActionSceneHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { INBOX_DISMISS_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID, INBOX_NEXT_SCENE_ID, SYSTEM_INBOX_NEXT_FUNCTION_KEY, type JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";

export const inboxNextScene: ActionSceneDefinition = {
  scene_id: INBOX_NEXT_SCENE_ID, version: 1, title: "Inbox 下一步",
  description: "根据事项内容推荐下一步，保存建议供用户选择，不自动执行建议。",
  trigger: "事项进入 Inbox 或用户要求重新判断", scope: "project", subject_kinds: ["inbox_entry"],
  permissions: ["inbox:read", "model:invoke", "judgments:write"], configuration_permissions: ["inbox:write"],
  event_schema: { type: "object", properties: { entry_id: { type: "string", minLength: 1 } }, required: ["entry_id"], additionalProperties: false },
  input_schema: { type: "object", properties: { content: { type: "string", minLength: 1, maxLength: 8000 } }, required: ["content"], additionalProperties: false },
  result_type: "molis.behavior-recommendation.v1",
  default_rule: { function_key: SYSTEM_INBOX_NEXT_FUNCTION_KEY, name: "挑 Inbox 下一步", instructions: "看这条 Inbox 该显示哪个按钮。", subject_kinds: ["inbox_entry"],
    options: [{ key: INBOX_DONE_BEHAVIOR_ID, description: "标记已处理" }, { key: INBOX_DISMISS_BEHAVIOR_ID, description: "忽略" }] },
  recommendation_labels: { "inbox.compose": "整理成稿", "inbox.verify": "先核查", "inbox.done": "做完了", "inbox.dismiss": "忽略" },
  result_schema: { type: "object", properties: { status: { enum: ["ok", "needs_review"] },
    suggested_behavior_ids: { type: "array", items: { enum: ["inbox.compose", "inbox.verify", "inbox.done", "inbox.dismiss"] } } },
  required: ["status", "suggested_behavior_ids"] },
};

export interface InboxJudgmentSubject {
  entry_id: string; revision: number; status: string; content: string;
}
export interface InboxScenePorts {
  projectId: string;
  binding(): ActionSceneBinding | null;
  save(context: ActionSceneExecutionContext, binding: ActionSceneBinding, options?: ActionSceneConfigureOptions): void | Promise<void>;
  /** Reads what the callbacks of one run see: the entry and the text of the item it points at, both from the run that started them. */
  resolve(entryId: string): InboxJudgmentSubject;
  record(context: ActionSceneExecutionContext, subject: InboxJudgmentSubject, binding: ActionSceneBinding, result: { status: "ok" | "needs_review"; suggested_behavior_ids: string[]; error_code?: string }): JudgmentRecord | Promise<JudgmentRecord>;
}

export function inboxSceneBindingId(projectId: string): string { return `${INBOX_NEXT_SCENE_ID}:${projectId}`; }

/** Trigger identity and revision stay with the consumer; only content goes to the judgment. */
export function createInboxSceneHandler(ports: InboxScenePorts): ActionSceneHandlerBinding {
  const checkedSubject = (state: unknown) => {
    const subject = state as InboxJudgmentSubject;
    const current = ports.resolve(subject.entry_id);
    if (current.revision !== subject.revision || current.status !== subject.status || current.content !== subject.content) {
      throw new ActionError("actions.subject_changed", "判断期间事项或原始内容已变化，请重新判断");
    }
    return subject;
  };
  return {
    scene_id: inboxNextScene.scene_id, version: inboxNextScene.version,
    bindings: () => { const binding = ports.binding(); return binding ? [binding] : []; },
    targets: () => { const binding = ports.binding(); return [{ binding_id: inboxSceneBindingId(ports.projectId), title: "Inbox 下一步",
      href: `/projects/${encodeURIComponent(ports.projectId)}/?openPlugin=inbox`, revision: binding?.revision ?? null }]; },
    bind: (caller, binding, options) => {
      if (!caller.permissions.includes("inbox:write")) throw new ActionError("actions.forbidden", "缺少 Inbox 配置权限");
      if (binding.binding_id !== inboxSceneBindingId(ports.projectId)) throw new ActionError("actions.binding_invalid", "Inbox 只接受当前项目的下一步绑定");
      return ports.save(caller, binding, options);
    },
    prepare: (_caller, event) => {
      const subject = ports.resolve((event as { entry_id: string }).entry_id);
      if (subject.status !== "open" && subject.status !== "in_progress") throw new ActionError("actions.subject_unavailable", "已完成或已忽略的事项请先重新打开");
      return { input: { content: subject.content }, state: subject };
    },
    consume: (caller, _input, result, execution) => {
      const subject = checkedSubject(execution.state);
      const recommendation = result as { status: "ok" | "needs_review"; suggested_behavior_ids: string[] };
      return ports.record(caller, subject, execution.binding, { status: recommendation.status,
        suggested_behavior_ids: recommendation.status === "ok" ? recommendation.suggested_behavior_ids : [] });
    },
    failed: (caller, _input, error, execution) => ports.record(caller, checkedSubject(execution.state), execution.binding, {
      status: "needs_review", suggested_behavior_ids: [],
      error_code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "actions.judgment_failed",
    }),
  };
}

/** What starting the next-step judgment of an entry needs of its caller; the Host and Feed each give theirs. */
export interface InboxJudgmentTriggerOptions {
  readonly projectId: string;
  /** The caller of an event that has no person's request behind it (a source tick, a workflow's handoff). */
  context(): ActionCallContext;
  /** Whether `inbox.judgment.evaluate` is ready for this caller: a rule is bound, enabled and usable. Nothing is run to find out. */
  available(caller: ActionCallContext): Promise<boolean>;
  /** Runs `inbox.judgment.evaluate` for the one entry, as the caller. */
  evaluate(entryId: string, caller: ActionCallContext): Promise<unknown>;
}

/** Judgment errors that invalidate this event's decision (an entry no longer open says `actions.subject_unavailable`); they must not turn a saved Inbox entry into an ingestion failure. */
const TOLERATED_CODES: readonly string[] = ["actions.binding_changed", "actions.binding_missing", "actions.provider_changed", "actions.subject_changed", "actions.subject_unavailable"];

/** An automatic trigger has the same caller and scope as its event source, and asks the Inbox's own action to judge. */
export function createInboxJudgmentTrigger(options: InboxJudgmentTriggerOptions) {
  return async (entry: { project_id: string; entry_id: string }, explicitCaller?: ActionCallContext): Promise<void> => {
    if (entry.project_id !== options.projectId) throw new ActionError("actions.scope_mismatch", "入箱事件不属于当前项目");
    const caller = explicitCaller ?? options.context();
    if (!await options.available(caller)) return;
    try {
      await options.evaluate(entry.entry_id, caller);
    } catch (error) {
      if (error instanceof ActionError && TOLERATED_CODES.includes(error.code)) return;
      if (!await options.available(caller)) return;
      throw error;
    }
  };
}
