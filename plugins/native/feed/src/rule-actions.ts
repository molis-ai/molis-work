import { FEED_PLUGIN_ID } from "./identity.js";
import { feedCaptureContent } from "./scenes.js";
import { retainActionAuthority, ActionError, type ActionCallContext, type ActionReference, type ActionSceneUsage, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplication } from "./application.js";
import type { FeedItemRecord, FeedOutRuleRecord } from "./projection.js";
import { FeedStoreError } from "./application-errors.js";
import { feedOutRuleMatches, type FeedOutRuleWrite } from "./out-rules.js";

const text = { type: "string" };
const id = { type: "string", minLength: 1 };
const match = { type: "object", properties: { contains: { type: "string", maxLength: 200 }, source_id: text, source_kind: text }, additionalProperties: false };
const reference = { type: "object", properties: { capability_id: id, version: { type: "integer", minimum: 1 }, provider_id: id }, required: ["capability_id", "version", "provider_id"], additionalProperties: false };
const fields = { name: { type: "string", minLength: 1, maxLength: 80 }, match, enabled: { type: "boolean" },
  function_key: { type: ["string", "null"] }, judgment: { anyOf: [reference, { type: "null" }] }, admission: { enum: ["suggest", "inbox"] } };
const rule = { type: "object", properties: { ...fields, board_id: id, rule_id: id, created_at: text, updated_at: text, revision: id },
  required: ["board_id", "rule_id", "name", "match", "enabled", "function_key", "admission", "created_at", "updated_at"] };
const object = (properties: Record<string, unknown>, required: string[] = []): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const result = { type: "object", properties: { rule }, required: ["rule"] };
function define<I, O>(suffix: string, title: string, description: string, input_schema: ActionSchema, output_schema: ActionSchema, write = false, permissions?: string[]): ActionDefinition<I, O> {
  return { capability_id: `feed.rules.${suffix}`, version: 1, operation: write ? "command" : "query", action: {
    title, description, kind: write ? "operation" : "query", scope: "project", audiences: ["user", "agent", "workflow", "mcp"],
    permissions: permissions ?? (write ? ["feed:read", "feed:write"] : ["feed:read"]), subject_kinds: ["feed_item", "source"], input_schema, output_schema,
  } };
}
export interface FeedJudgmentChoice { reference: ActionReference; title: string; available: boolean; reason?: string }
export interface FeedJudgmentCatalog { choices: FeedJudgmentChoice[]; usages: readonly ActionSceneUsage[] }
export interface FeedCaptureRecommendations { recommendations: { item_id: string; suggested_behavior_ids: string[] }[] }
export interface FeedRulePreview { samples: { item_id: string; title: string; matched: boolean; input: string }[] }
export const feedRuleActions = {
  recommendations: define<Record<string, never>, FeedCaptureRecommendations>("recommendations", "查看捕捉建议", "只返回当前消息、绑定与授权仍然有效的最新捕捉建议；旧结果保留历史。", object({}), object({ recommendations: { type: "array", items: object({ item_id: id, suggested_behavior_ids: { type: "array", items: text } }, ["item_id", "suggested_behavior_ids"]) } }, ["recommendations"])),
  judgments: define<Record<string, never>, FeedJudgmentCatalog>("judgments", "查看捕捉判断能力", "从当前授权目录读取 Feed 可选判断、可用状态与真实绑定。", object({}), { type: "object", properties: {
    choices: { type: "array", items: object({ reference, title: text, available: { type: "boolean" }, reason: text }, ["reference", "title", "available"]) }, usages: { type: "array", items: { type: "object" } },
  }, required: ["choices", "usages"] }),
  previewJudgment: define<{ judgment: ActionReference; item_id: string }, { status: "ok" | "needs_review"; suggested_behavior_ids: string[] }>("preview-judgment", "预览捕捉判断", "对一条原消息试跑兼容判断能力，不保存捕捉结果或加入 Inbox。", object({ judgment: reference, item_id: id }, ["judgment", "item_id"]),
    { type: "object", properties: { status: { enum: ["ok", "needs_review"] }, suggested_behavior_ids: { type: "array", items: text } }, required: ["status", "suggested_behavior_ids"] }, true, ["feed:read", "model:invoke"]),
  list: define<Record<string, never>, { rules: FeedOutRuleRecord[] }>("list", "查看捕捉规则", "读取当前项目的 Feed 捕捉规则与原函数引用。", object({}), { type: "object", properties: { rules: { type: "array", items: rule } }, required: ["rules"] }),
  create: define<FeedOutRuleWrite, { rule: FeedOutRuleRecord }>("create", "创建捕捉规则", "保存当前项目的捕捉条件；不会处理已经存在的消息。", object(fields, ["name", "match"]), result, true),
  update: define<{ rule_id: string; patch: Partial<FeedOutRuleWrite> }, { rule: FeedOutRuleRecord }>("update", "修改捕捉规则", "修改当前项目的原规则；不复制规则或自动重新处理消息。", object({ rule_id: id, patch: object(fields) }, ["rule_id", "patch"]), result, true),
  delete: define<{ rule_id: string }, { rule: FeedOutRuleRecord }>("delete", "删除捕捉规则", "删除当前项目指定规则及其绑定；保留已捕捉材料和判断历史。", object({ rule_id: id }, ["rule_id"]), result, true),
  evaluate: define<{ item_ids: string[] }, { evaluated: number }>("evaluate", "处理已有消息", "按当前捕捉规则处理指定消息并保存真实判断结果。", object({ item_ids: { type: "array", minItems: 1, maxItems: 20, items: id } }, ["item_ids"]), object({ evaluated: { type: "integer", minimum: 0 } }, ["evaluated"]), true, ["feed:read", "feed:write", "inbox:write", "model:invoke"]),
  preview: define<{ source_id: string; contains?: string }, FeedRulePreview>("preview", "预览关键词命中", "只读取当前来源最近五条消息，展示关键词是否命中及原文；不会运行模型、写入 Inbox 或生成成果。", object({ source_id: id, contains: { type: "string", maxLength: 200 } }, ["source_id"]), {
    type: "object", properties: { samples: { type: "array", items: { type: "object", properties: { item_id: id, title: text, matched: { type: "boolean" }, input: text }, required: ["item_id", "title", "matched", "input"] } } }, required: ["samples"],
  }),
} as const;

export interface FeedRuleJudgmentSelection {
  validate(reference: ActionReference, caller: ActionCallContext): Promise<ActionReference>;
  legacyReference(key: string): ActionReference | null;
  catalog(caller: ActionCallContext): Promise<FeedJudgmentCatalog>;
  recommendations(caller: ActionCallContext): Promise<FeedCaptureRecommendations>;
  preview(reference: ActionReference, content: string, caller: ActionCallContext): Promise<{ status: "ok" | "needs_review"; suggested_behavior_ids: string[] }>;
}
export function createFeedRuleHandlers(feed: FeedApplication, boardId: string, hydrate: (item: FeedItemRecord) => FeedItemRecord, judgments?: FeedRuleJudgmentSelection): ActionHandlerBinding[] {
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (args: I, caller: ActionCallContext) => O | Promise<O>): ActionHandlerBinding => ({ ...definition, handle: (caller, input) => handle(input as I, caller) });
  const select = async (next: FeedOutRuleRecord, patch: Partial<FeedOutRuleWrite>, caller: ActionCallContext, current?: FeedOutRuleRecord) => {
    const changed = "judgment" in patch || "function_key" in patch;
    if (next.enabled && next.admission === "inbox" && (!current || changed || "match" in patch || "admission" in patch || patch.enabled === true)
      && !caller.permissions.includes("inbox:write")) throw new ActionError("actions.forbidden", "启用自动入箱需要 Inbox 写入权限");
    if ("judgment" in patch && "function_key" in patch) throw new ActionError("actions.input_invalid", "请选择判断能力或兼容函数键，不要同时设置两者");
    if ("judgment" in patch) {
      next.judgment = patch.judgment ?? null;
      next.function_key = next.judgment?.provider_id === "system.functions" ? next.judgment.capability_id.replace(/^functions\.published\./, "") : null;
    } else if ("function_key" in patch) {
      next.judgment = next.function_key ? judgments?.legacyReference(next.function_key) ?? null : null;
      if (next.function_key && !next.judgment) throw new ActionError("actions.binding_invalid", "请选择已发布的判断规则");
    }
    if ((changed || (next.enabled && !current?.enabled)) && (next.judgment || next.function_key)) {
      if (!next.judgment || !judgments) throw new ActionError("actions.binding_invalid", "判断能力不可用，请重新选择");
      next.judgment = await judgments.validate(next.judgment, caller);
    }
    return next;
  };
  const checkSource = (sourceId?: string) => {
    if (sourceId?.trim() && !feed.snapshot(boardId).sources.some(source => source.source_id === sourceId.trim())) {
      throw new FeedStoreError("feed_invalid_transition", "请选择当前项目的来源");
    }
  };
  return [
    bind(feedRuleActions.recommendations, async (_args, caller) => judgments ? judgments.recommendations(caller) : { recommendations: [] }),
    bind(feedRuleActions.judgments, async (_args, caller) => judgments ? judgments.catalog(caller) : { choices: [], usages: [] }),
    bind(feedRuleActions.previewJudgment, async (args, caller) => {
      if (!judgments) throw new ActionError("actions.scene_missing", "捕捉判断服务未连接");
      const item = hydrate(feed.getFeedItem(boardId, args.item_id));
      return judgments.preview(args.judgment, feedCaptureContent(item), caller);
    }),
    bind(feedRuleActions.list, () => ({ rules: feed.listOutRules(boardId) })),
    bind(feedRuleActions.create, async (args, caller) => {
      checkSource(args.match.source_id);
      const next = await select(feed.prepareOutRuleCreate(boardId, args), args, caller);
      await caller.validate_authority?.({ ...feedRuleActions.create, provider_id: FEED_PLUGIN_ID });
      return { rule: feed.saveOutRuleCreate(next) };
    }),
    bind(feedRuleActions.update, async (args, caller) => {
      checkSource(args.patch.match?.source_id);
      const current = feed.listOutRules(boardId).find(rule => rule.rule_id === args.rule_id);
      const next = await select(feed.prepareOutRuleUpdate(boardId, args.rule_id, args.patch), args.patch, caller, current);
      await caller.validate_authority?.({ ...feedRuleActions.update, provider_id: FEED_PLUGIN_ID });
      return { rule: feed.saveOutRuleUpdate(next, current!.revision) };
    }),
    bind(feedRuleActions.delete, args => ({ rule: feed.deleteOutRule(boardId, args.rule_id) })),
    bind(feedRuleActions.evaluate, (args, caller) => feed.evaluateItems(boardId, args.item_ids, retainActionAuthority(caller, { ...feedRuleActions.evaluate, provider_id: FEED_PLUGIN_ID }))),
    bind(feedRuleActions.preview, args => {
      const snapshot = feed.snapshot(boardId);
      if (!snapshot.sources.some(source => source.source_id === args.source_id)) throw new FeedStoreError("feed_invalid_transition", "请选择当前项目的来源");
      const rule: FeedOutRuleRecord = { board_id: boardId, rule_id: "preview", name: "preview", enabled: true,
        match: { source_id: args.source_id, contains: args.contains?.trim() ?? "" }, function_key: null, admission: "suggest", created_at: "", updated_at: "" };
      return { samples: snapshot.feed_items.filter(item => item.source_id === args.source_id)
        .sort((a, b) => b.source_updated_at.localeCompare(a.source_updated_at)).slice(0, 5).map(item => {
          const original = hydrate(item);
          return { item_id: original.item_id, title: original.title, matched: feedOutRuleMatches(rule, original),
            input: [original.title, original.summary, original.body ?? ""].filter(Boolean).join("\n") };
        }) };
    }),
  ];
}
