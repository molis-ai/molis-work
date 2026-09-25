import { ActionError, type ActionCallContext, type ActionSceneClient, type ActionSceneDefinition, type ActionSceneBinding, type ActionSceneHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { INBOX_NEXT_SCENE_ID, type JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";

export const inboxNextScene: ActionSceneDefinition = {
  scene_id: INBOX_NEXT_SCENE_ID, version: 1, title: "Inbox 下一步",
  description: "根据事项内容推荐下一步，保存建议供用户选择，不自动执行建议。",
  trigger: "事项进入 Inbox 或用户要求重新判断", scope: "project", subject_kinds: ["inbox_entry"],
  permissions: ["inbox:read", "model:invoke"],
  event_schema: { type: "object", properties: { entry_id: { type: "string", minLength: 1 } }, required: ["entry_id"], additionalProperties: false },
  input_schema: { type: "object", properties: { content: { type: "string", minLength: 1, maxLength: 8000 } }, required: ["content"], additionalProperties: false },
  result_type: "molis.behavior-recommendation.v1",
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
  save(binding: ActionSceneBinding): void;
  resolve(entryId: string): InboxJudgmentSubject;
  record(subject: InboxJudgmentSubject, binding: ActionSceneBinding, result: { status: "ok" | "needs_review"; suggested_behavior_ids: string[]; error_code?: string }): JudgmentRecord;
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
    bind: (caller, binding) => {
      if (!caller.permissions.includes("inbox:write")) throw new ActionError("actions.forbidden", "缺少 Inbox 配置权限");
      if (binding.binding_id !== inboxSceneBindingId(ports.projectId)) throw new ActionError("actions.binding_invalid", "Inbox 只接受当前项目的下一步绑定");
      ports.save(binding);
    },
    prepare: (_caller, event) => {
      const subject = ports.resolve((event as { entry_id: string }).entry_id);
      if (subject.status !== "open" && subject.status !== "in_progress") throw new ActionError("actions.subject_unavailable", "已完成或已忽略的事项请先重新打开");
      return { input: { content: subject.content }, state: subject };
    },
    consume: (_caller, _input, result, execution) => {
      const subject = checkedSubject(execution.state);
      const recommendation = result as { status: "ok" | "needs_review"; suggested_behavior_ids: string[] };
      return ports.record(subject, execution.binding, { status: recommendation.status,
        suggested_behavior_ids: recommendation.status === "ok" ? recommendation.suggested_behavior_ids : [] });
    },
    failed: (_caller, _input, error, execution) => ports.record(checkedSubject(execution.state), execution.binding, {
      status: "needs_review", suggested_behavior_ids: [],
      error_code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "actions.judgment_failed",
    }),
  };
}

/** An automatic trigger has the same caller and scope as its host-owned event source. */
export function createInboxJudgmentTrigger(options: { scenes: ActionSceneClient; context(): ActionCallContext; boardId: string }) {
  return async (entry: { board_id: string; entry_id: string }): Promise<void> => {
    if (entry.board_id !== options.boardId) throw new ActionError("actions.scope_mismatch", "入箱事件不属于当前项目");
    const caller = options.context();
    const usage = (await options.scenes.usages(caller)).find(binding => binding.scene_id === inboxNextScene.scene_id
      && binding.scene_version === inboxNextScene.version && binding.binding_id === inboxSceneBindingId(caller.project_id!));
    if (!usage?.enabled || !usage.availability.available) return;
    try {
      await options.scenes.runScene(caller, inboxNextScene, usage.binding_id, { entry_id: entry.entry_id });
    } catch (error) {
      // These invalidate this event's decision; they must not turn a saved Inbox entry into an ingestion failure.
      if (error instanceof ActionError && ["actions.binding_changed", "actions.binding_missing", "actions.provider_changed",
        "actions.subject_changed", "actions.subject_unavailable"].includes(error.code)) return;
      const current = (await options.scenes.usages(caller)).find(binding => binding.binding_id === usage.binding_id);
      if (!current?.enabled || !current.availability.available) return;
      throw error;
    }
  };
}
