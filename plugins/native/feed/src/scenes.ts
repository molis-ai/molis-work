import { createHash } from "node:crypto";
import { ActionError, type ActionCallContext, type ActionSceneClient, type ActionSceneDefinition, type ActionSceneConfigureOptions, type ActionSceneBinding, type ActionSceneHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import type { FeedItemRecord, FeedOutRuleRecord } from "./projection.js";
import { feedOutRuleMatches } from "./out-rules.js";

export const feedCaptureScene: ActionSceneDefinition = {
  scene_id: "feed.capture", version: 1, title: "捕捉规则", description: "判断命中捕捉条件的消息；按规则保存建议或加入 Inbox。",
  trigger: "来源产生或更新消息，或用户要求处理已有消息", scope: "project", subject_kinds: ["feed_item"],
  permissions: ["feed:read", "model:invoke"], configuration_permissions: ["feed:write"],
  event_schema: { type: "object", properties: { item_id: { type: "string", minLength: 1 }, rule_id: { type: "string", minLength: 1 } }, required: ["item_id", "rule_id"], additionalProperties: false },
  input_schema: { type: "object", properties: { content: { type: "string", minLength: 1, maxLength: 8000 } }, required: ["content"], additionalProperties: false },
  result_type: "molis.behavior-recommendation.v1",
  recommendation_labels: { "inbox.admit": "加入 Inbox", "feed.open": "打开", "feed.save": "保存为资料", "feed.promote": "升格为 Goal", "feed.archive": "忽略" },
  result_schema: { type: "object", properties: { status: { enum: ["ok", "needs_review"] }, suggested_behavior_ids: { type: "array", items: { enum: ["inbox.admit", "feed.open", "feed.save", "feed.promote", "feed.archive"] } } }, required: ["status", "suggested_behavior_ids"] },
};
export function feedSceneBindingId(ruleId: string): string { return `feed.capture:${ruleId}`; }
export function feedRuleBinding(projectId: string, rule: FeedOutRuleRecord): ActionSceneBinding | null {
  if (!rule.judgment) return null;
  return { binding_id: feedSceneBindingId(rule.rule_id), scene_id: feedCaptureScene.scene_id, scene_version: feedCaptureScene.version,
    project_id: projectId, function: rule.judgment, enabled: rule.enabled, revision: rule.revision, title: rule.name,
    href: `/projects/${encodeURIComponent(projectId)}/?feedRule=${encodeURIComponent(rule.rule_id)}` };
}
interface CaptureState { item: FeedItemRecord; rule: FeedOutRuleRecord; content: string }
export interface FeedCaptureScenePorts {
  projectId: string;
  rules(): FeedOutRuleRecord[];
  save(rule: FeedOutRuleRecord, binding: ActionSceneBinding, options?: ActionSceneConfigureOptions): void;
  resolve(itemId: string): FeedItemRecord;
  record(item: FeedItemRecord, rule: FeedOutRuleRecord, binding: ActionSceneBinding, result: { status: "ok" | "needs_review"; suggested_behavior_ids: string[]; error_code?: string }, caller: ActionCallContext): JudgmentRecord | Promise<JudgmentRecord>;
}
export const feedCaptureContent = (item: FeedItemRecord) => [item.title, item.summary, item.body ?? "", ...item.materials.map(material => material.content ?? "")].filter(Boolean).join("\n");
export function feedCaptureSubjectRevision(item: FeedItemRecord): string {
  return createHash("sha256").update(JSON.stringify([item.revision, feedCaptureContent(item)])).digest("hex");
}
export function createFeedCaptureSceneHandler(ports: FeedCaptureScenePorts): ActionSceneHandlerBinding {
  const checked = (state: unknown, binding: ActionSceneBinding, caller: ActionCallContext): CaptureState => {
    const original = state as CaptureState;
    const item = ports.resolve(original.item.item_id);
    const rule = ports.rules().find(rule => rule.rule_id === original.rule.rule_id);
    if (binding.binding_id !== feedSceneBindingId(original.rule.rule_id)) throw new ActionError("actions.binding_invalid", "消息事件与捕捉规则不符");
    if (!rule || rule.revision !== original.rule.revision || !feedOutRuleMatches(rule, item)) throw new ActionError("actions.binding_changed", "捕捉规则已变化，请重新判断");
    if (item.revision !== original.item.revision || feedCaptureContent(item) !== original.content) throw new ActionError("actions.subject_changed", "原消息已变化，请重新判断");
    if (rule.admission === "inbox" && !caller.permissions.includes("inbox:write")) throw new ActionError("actions.forbidden", "自动入箱需要 Inbox 写入权限");
    return { item, rule, content: original.content };
  };
  return {
    scene_id: feedCaptureScene.scene_id, version: feedCaptureScene.version,
    bindings: () => ports.rules().flatMap(rule => { const binding = feedRuleBinding(ports.projectId, rule); return binding ? [binding] : []; }),
    targets: caller => ports.rules().map(rule => ({ binding_id: feedSceneBindingId(rule.rule_id), title: rule.name,
      href: `/projects/${encodeURIComponent(ports.projectId)}/?feedRule=${encodeURIComponent(rule.rule_id)}`, revision: rule.revision ?? null,
      ...(rule.admission === "inbox" ? { activation_permissions: ["inbox:write"],
        ...(!caller.permissions.includes("inbox:write") ? { activation_availability: { available: false as const, code: "actions.forbidden", reason: "启用自动入箱需要 Inbox 写入权限" } } : {}) } : {}) })),
    bind: (caller, binding, options) => {
      if (!caller.permissions.includes("feed:write")) throw new ActionError("actions.forbidden", "缺少 Feed 规则配置权限");
      const rule = ports.rules().find(rule => feedSceneBindingId(rule.rule_id) === binding.binding_id);
      if (!rule) throw new ActionError("actions.binding_missing", "捕捉规则不存在");
      if (binding.enabled && rule.admission === "inbox" && !caller.permissions.includes("inbox:write")) throw new ActionError("actions.forbidden", "启用自动入箱需要 Inbox 写入权限");
      ports.save(rule, binding, options);
    },
    prepare: (caller, event) => {
      if (!caller.permissions.includes("feed:write")) throw new ActionError("actions.forbidden", "缺少 Feed 处理权限");
      const { item_id, rule_id } = event as { item_id: string; rule_id: string };
      const item = ports.resolve(item_id);
      const rule = ports.rules().find(rule => rule.rule_id === rule_id);
      if (!rule || !feedOutRuleMatches(rule, item)) throw new ActionError("actions.subject_unavailable", "消息不再匹配捕捉规则");
      if (rule.admission === "inbox" && !caller.permissions.includes("inbox:write")) throw new ActionError("actions.forbidden", "自动入箱需要 Inbox 写入权限");
      return { input: { content: feedCaptureContent(item) }, state: { item, rule, content: feedCaptureContent(item) } satisfies CaptureState };
    },
    consume: (caller, _input, result, execution) => {
      const { item, rule } = checked(execution.state, execution.binding, caller);
      const value = result as { status: "ok" | "needs_review"; suggested_behavior_ids: string[] };
      return ports.record(item, rule, execution.binding, { status: value.status, suggested_behavior_ids: value.status === "ok" ? value.suggested_behavior_ids : [] }, caller);
    },
    failed: (caller, _input, error, execution) => {
      const { item, rule } = checked(execution.state, execution.binding, caller);
      return ports.record(item, rule, execution.binding, { status: "needs_review", suggested_behavior_ids: [],
        error_code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "actions.judgment_failed" }, caller);
    },
  };
}

export function createFeedCaptureTrigger(options: { scenes: ActionSceneClient; context(): ActionCallContext; boardId: string }) {
  return async (event: { board_id: string; item_id: string; rule_ids: string[] }, explicitCaller?: ActionCallContext): Promise<void> => {
    if (event.board_id !== options.boardId) throw new ActionError("actions.scope_mismatch", "Feed 事件不属于当前项目");
    if (!event.rule_ids.length) return;
    const caller = explicitCaller ?? options.context();
    const usages = await options.scenes.usages(caller);
    for (const ruleId of event.rule_ids) {
      const usage = usages.find(usage => usage.scene_id === feedCaptureScene.scene_id && usage.scene_version === feedCaptureScene.version && usage.binding_id === feedSceneBindingId(ruleId));
      if (!usage || !usage.availability.available) {
        if (explicitCaller) throw new ActionError("actions.binding_invalid", usage && !usage.availability.available ? usage.availability.reason : "捕捉规则的判断绑定不可用，请检查配置");
        continue;
      }
      if (!usage.enabled) continue;
      try { await options.scenes.runScene(caller, feedCaptureScene, usage.binding_id, { item_id: event.item_id, rule_id: ruleId }); }
      catch (error) {
        if (explicitCaller) throw error;
        if (error instanceof ActionError && ["actions.binding_changed", "actions.binding_missing", "actions.provider_changed", "actions.subject_changed", "actions.subject_unavailable"].includes(error.code)) continue;
        const current = (await options.scenes.usages(caller)).find(value => value.binding_id === usage.binding_id);
        if (!current?.enabled || !current.availability.available) continue;
        throw error;
      }
    }
  };
}
