import { INBOX_PLUGIN_ID } from "./identity.js";
import { retainActionAuthority, ActionError, defineSubjectOffersAction, type ActionCallContext, type ActionExecutionContext, type ActionDefinition, type ActionHandlerBinding, type ActionReference, type ActionSchema, type SubjectOffersInput, type SubjectActionOffer } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AttentionEntryRecord, AttentionStatus } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { INBOX_NEXT_SCENE_ID, type JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { PAGES_PLUGIN_ID, type PagesGenerationRecord, type PagesRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import type { InboxJudgmentState } from "./route-handlers.js";

const empty = { type: "object", properties: {}, additionalProperties: false };
const ids = { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 1 } };
const functionKey = { type: ["string", "null"] };
const text = { type: "string" };
const nullableText = { type: ["string", "null"] };
const strings = { type: "array", items: text };
const revision = { type: "integer", minimum: 1 };
const entryProperties = { entry_id: text, project_id: text, board_id: text,
  subject_type: { enum: ["feed_item", "goal_decision", "source_fault"] }, subject_id: text,
  reason: { enum: ["manual", "source_rule", "goal_decision", "source_fault", "artifact_out_failed"] },
  status: { enum: ["open", "in_progress", "done", "dismissed"] }, revision,
  detail: { type: "object" }, created_at: text, updated_at: text, completed_at: nullableText };
const entrySchema = { type: "object", properties: entryProperties, required: Object.keys(entryProperties) };
const generationProperties = { request_id: text, project_id: text, request_hash: text,
  status: { enum: ["running", "failed", "completed"] }, document_id: nullableText,
  instructions: text, title: text, error: nullableText, updated_at: text, entry_ids: strings };
const generationSchema = { type: "object", properties: generationProperties, required: Object.keys(generationProperties) };
const documentProperties = { id: text, project_id: text, title: text,
  body: { type: "object", properties: { type: { const: "doc" }, content: { type: "array" } }, required: ["type"] },
  folder_id: text, starred: { type: "boolean" }, goal_id: text, artifact_id: text,
  artifact_version: { type: "integer", minimum: 0 }, created_at: text, updated_at: text, version: revision };
const documentSchema = { type: "object", properties: documentProperties, required: Object.keys(documentProperties) };
const judgmentProperties = { judgment_id: text, function_key: text, function_version: { type: "integer", minimum: 0 },
  subject: { type: "object", properties: { kind: { enum: ["feed_item", "inbox_entry", "home_event", "source", "session", "mcp_invoke"] }, id: text, board_id: text }, required: ["kind", "id"] },
  scene_id: nullableText, outcome: { enum: ["ok", "needs_review"] }, suggested_behavior_ids: strings,
  error_code: nullableText, created_at: text };
const judgmentSchema = { type: "object", properties: judgmentProperties, required: Object.keys(judgmentProperties) };

export type InboxActionEntry = AttentionEntryRecord & { board_id: string };
export type InboxPagesResult = Omit<PagesGenerationRecord, "inputs"> & { entry_ids: string[] };
export interface InboxGeneratedPages { document: PagesRecord; replayed: boolean; request_id: string; entry_ids: string[] }

function action<Input, Output>(id: string, title: string, description: string, operation: "query" | "command",
  input: ActionSchema, output: ActionSchema, permissions: string[], requiredScene?: { scene_id: string; version: number }, requiredActions?: readonly ActionReference[]): ActionDefinition<Input, Output> {
  return { capability_id: id, version: 1, operation, action: { title, description,
    kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "agent", "workflow", "mcp"],
    permissions, ...(requiredScene ? { required_scene: requiredScene } : {}), ...(requiredActions ? { required_actions: requiredActions } : {}),
    subject_kinds: ["inbox_entry"], input_schema: input, output_schema: output } };
}

export interface InboxStatusInput { entry_id: string; status: AttentionStatus; expected_revision: number }
export interface InboxPagesMaterialRef { entry_id: string; item_id: string; revision: number; content_digest: string }
export interface InboxPagesInput { request_id: string; entry_ids: string[]; title: string; instructions: string; expected_materials?: InboxPagesMaterialRef[] }
export const inboxActions = {
  offers: defineSubjectOffersAction("inbox.actions.prepare", ["inbox_entry"], "Inbox 可用动作", ["inbox:read"], [
    { offer_id: "inbox.done", title: "做完了", action: { capability_id: "inbox.entry.status", version: 1 } },
    { offer_id: "inbox.dismiss", title: "忽略", action: { capability_id: "inbox.entry.status", version: 1 } },
    { offer_id: "inbox.pages", title: "整理成文稿", action: { capability_id: "inbox.pages.generate", version: 1 } },
  ]),
  list: action<Record<string, never>, { entries: readonly InboxActionEntry[] }>("inbox.list", "待处理事项", "读取当前项目的 Inbox 事项与当前版本", "query",
    empty, { type: "object", properties: { entries: { type: "array", items: entrySchema } }, required: ["entries"] }, ["inbox:read"]),
  setStatus: action<InboxStatusInput, { entry: InboxActionEntry }>("inbox.entry.status", "更新事项状态", "按读取到的版本更新事项；版本过期时拒绝覆盖", "command", {
    type: "object", properties: { entry_id: { type: "string", minLength: 1 }, status: { enum: ["open", "in_progress", "done", "dismissed"] },
      expected_revision: { type: "integer", minimum: 1 } }, required: ["entry_id", "status", "expected_revision"], additionalProperties: false,
  }, { type: "object", properties: { entry: entrySchema }, required: ["entry"] }, ["inbox:write"]),
  pagesResults: action<Record<string, never>, { results: readonly InboxPagesResult[] }>("inbox.pages.results", "生成的文稿", "读取当前项目由 Inbox 材料生成的文稿和运行状态", "query",
    empty, { type: "object", properties: { results: { type: "array", items: generationSchema } }, required: ["results"] }, ["inbox:read", "pages:read"], undefined,
    [{ capability_id: "pages.generations.list", version: 1, provider_id: PAGES_PLUGIN_ID }]),
  generatePages: action<InboxPagesInput, InboxGeneratedPages>("inbox.pages.generate", "整理成文稿", "根据所选事项生成文稿；重试同一任务时保持 request_id 不变", "command", {
    type: "object", properties: { request_id: { type: "string", pattern: "^[a-zA-Z0-9:_-]{8,128}$" }, entry_ids: ids,
      title: { type: "string", minLength: 1, maxLength: 80 }, instructions: { type: "string", minLength: 1, maxLength: 4000 },
      expected_materials: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", properties: {
        entry_id: { type: "string", minLength: 1 }, item_id: { type: "string", minLength: 1 }, revision,
        content_digest: { type: "string", pattern: "^[a-f0-9]{64}$" },
      }, required: ["entry_id", "item_id", "revision", "content_digest"], additionalProperties: false } } },
    required: ["request_id", "entry_ids", "title", "instructions"], additionalProperties: false,
  }, { type: "object", properties: { document: documentSchema, replayed: { type: "boolean" }, request_id: text, entry_ids: strings },
    required: ["document", "replayed", "request_id", "entry_ids"] }, ["inbox:read", "pages:read", "pages:write", "model:invoke"], undefined,
    ["pages.generations.get", "pages.get", "pages.generate"].map(capability_id => ({ capability_id, version: 1, provider_id: PAGES_PLUGIN_ID }))),
  readJudgment: action<Record<string, never>, InboxJudgmentState>("inbox.judgment.read", "下一步判断规则", "读取绑定的判断规则及适用的已发布规则", "query", empty, {
    type: "object", properties: { summary: { type: "object", properties: { name: nullableText, enabled: { type: "boolean" }, available: { type: "boolean" }, reason: nullableText }, required: ["name", "enabled", "available", "reason"] }, function_key: functionKey, functions: { type: "array", items: { type: "object",
      properties: { function_key: { type: "string" }, name: { type: "string" } }, required: ["function_key", "name"] } } }, required: ["function_key", "functions"],
  }, ["inbox:read"]),
  recommendations: action<Record<string, never>, { judgments: readonly JudgmentRecord[] }>("inbox.judgment.recommendations", "当前下一步建议", "读取仍对应当前事项、绑定及授权的判断；旧记录保留在历史中", "query", empty,
    { type: "object", properties: { judgments: { type: "array", items: judgmentSchema } }, required: ["judgments"] }, ["inbox:read"]),
  writeJudgment: action<{ function_key: string | null }, { function_key: string | null }>("inbox.judgment.write", "设置下一步判断", "绑定一个已发布规则；传空值解除绑定", "command", {
    type: "object", properties: { function_key: functionKey }, required: ["function_key"], additionalProperties: false,
  }, { type: "object", properties: { function_key: functionKey }, required: ["function_key"] }, ["inbox:write"]),
  evaluateJudgment: action<{ entry_ids: string[] }, { judgments: readonly JudgmentRecord[] }>("inbox.judgment.evaluate", "判断下一步", "对选择的事项执行已绑定规则并保存判断结果", "command", {
    type: "object", properties: { entry_ids: ids }, required: ["entry_ids"], additionalProperties: false,
  }, { type: "object", properties: { judgments: { type: "array", items: judgmentSchema } }, required: ["judgments"] }, ["inbox:read", "model:invoke"], { scene_id: INBOX_NEXT_SCENE_ID, version: 1 }),
} as const;

export const INBOX_ACTIONS: readonly ActionDefinition[] = Object.values(inboxActions);
export const INBOX_ACTION_PERMISSIONS = ["inbox:read", "inbox:write", "pages:read", "pages:write", "model:invoke", "functions:invoke"] as const;

export interface InboxActionPorts {
  listEntries(): readonly InboxActionEntry[];
  setStatus(entryId: string, status: AttentionStatus, revision: number): InboxActionEntry;
  pagesResults?(caller: ActionCallContext): readonly InboxPagesResult[] | Promise<readonly InboxPagesResult[]>;
  preparePages?(input: SubjectOffersInput, caller: ActionCallContext): Promise<InboxPagesInput | null>;
  generatePages?(input: InboxPagesInput, caller: ActionExecutionContext): Promise<InboxGeneratedPages>;
  readJudgment?(caller: ActionCallContext): InboxJudgmentState | Promise<InboxJudgmentState>;
  recommendations?(caller: ActionCallContext): Promise<{ judgments: readonly JudgmentRecord[] }>;
  writeJudgment?(key: string | null, caller: ActionCallContext): { function_key: string | null } | Promise<{ function_key: string | null }>;
  evaluateJudgment?(ids: readonly string[], caller: ActionCallContext): Promise<{ judgments: readonly JudgmentRecord[] }>;
}

/** Business ports are supplied once at activation; every consumer calls these registered handlers. */
export function createInboxActionHandlers(ports: InboxActionPorts): ActionHandlerBinding[] {
  const unavailable = { available: false as const, code: "actions.connection_required", reason: "此能力需要已配置的个人服务" };
  const bind = <Input, Output>(definition: ActionDefinition<Input, Output>, handle: (input: Input, caller: ActionExecutionContext) => Output | Promise<Output>, enabled = true): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version,
    availability: () => enabled ? { available: true } : unavailable,
    handle: (_caller, input) => { if (!enabled) throw new ActionError(unavailable.code, unavailable.reason); return handle(input as Input, _caller); },
  });
  return [
    bind(inboxActions.offers, async (input, caller) => {
      if (input.subject.kind !== "inbox_entry") throw new ActionError("actions.subject_mismatch", "此查询只接受 Inbox 事项");
      const entry = ports.listEntries().find(row => row.entry_id === input.subject.id);
      if (!entry) throw new ActionError("actions.subject_unavailable", "Inbox 事项已不存在");
      if (entry.status !== "open" && entry.status !== "in_progress") return { offers: [] };
      const offers: SubjectActionOffer[] = ([['done', '做完了'], ['dismissed', '忽略']] as const).map(([status, title]) => ({
        offer_id: status === "done" ? "inbox.done" : "inbox.dismiss", title,
        action: { capability_id: inboxActions.setStatus.capability_id, version: inboxActions.setStatus.version },
        input: { entry_id: entry.entry_id, status, expected_revision: entry.revision },
      }));
      if (entry.subject_type === "feed_item" && ports.preparePages && ports.generatePages) {
        const pages = await ports.preparePages(input, caller);
        if (pages) offers.push({ offer_id: "inbox.pages", title: "整理成文稿",
          action: { capability_id: inboxActions.generatePages.capability_id, version: inboxActions.generatePages.version }, input: pages });
      }
      return { offers };
    }),
    bind(inboxActions.list, () => ({ entries: ports.listEntries() })),
    bind(inboxActions.setStatus, input => ({ entry: ports.setStatus(input.entry_id, input.status, input.expected_revision) })),
    bind(inboxActions.pagesResults, async (_input, caller) => ({ results: await ports.pagesResults!(caller) }), !!ports.pagesResults),
    bind(inboxActions.generatePages, (input, caller) => ports.generatePages!(input, caller), !!ports.generatePages),
    bind(inboxActions.readJudgment, (_input, caller) => ports.readJudgment!(caller), !!ports.readJudgment),
    bind(inboxActions.recommendations, (_input, caller) => ports.recommendations!(caller), !!ports.recommendations),
    bind(inboxActions.writeJudgment, (input, caller) => ports.writeJudgment!(input.function_key?.trim() || null, caller), !!ports.writeJudgment),
    bind(inboxActions.evaluateJudgment, (input, caller) => ports.evaluateJudgment!(input.entry_ids, retainActionAuthority(caller, { ...inboxActions.evaluateJudgment, provider_id: INBOX_PLUGIN_ID })), !!ports.evaluateJudgment),
  ];
}
