import { instructed, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { LINGGUANG_CONVERSATION } from "./prompts.js";
import { ActionError, FRAGMENT_ANY_OBJECT, bindObjectCopyHandler, bindObjectMoveHandler, defineFragmentOffersAction, defineObjectCopyAction, defineObjectMoveAction, type FragmentActionOffer, type FragmentOfferChoice, type FragmentOffersInput, type ActionAvailability, type ActionCallContext, type ActionExecutionContext, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { LINGGUANG_BODY_LIMIT, type LingguangSpark } from "@molis-ai/molis-work-contracts/modules/lingguang";
import type { LingguangConversationState, LingguangStore } from "./store.js";
import { createLingguangSearchHandlers, lingguangSearchActions, revisionOf } from "./search.js";

const text = { type: "string" };
const id = { type: "string", minLength: 1 };
const ids = { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: id };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const spark = object({ id, project_id: id, title: text, body: text, source_kind: { const: "manual" }, status: { enum: ["inbox", "discarded"] }, created_at: text, updated_at: text });
const conversation = object({ id, project_id: id, spark_ids: { type: "array", items: id }, created_at: text, updated_at: text });
const message = object({ id, conversation_id: id, role: { enum: ["user", "assistant", "stub"] }, body: text, created_at: text });
const conversationState = object({ conversation, sparks: { type: "array", items: spark }, messages: { type: "array", items: message } });
const fields = { title: { type: "string", maxLength: 80 }, body: { type: "string", maxLength: LINGGUANG_BODY_LIMIT } };
const read = ["lingguang:read"], write = ["lingguang:write"];
const CONCURRENT = new Set(["conversation.message", "material.read", "source.read"]);
type MaterialUpload = { file_name: string; data_base64: string; allow_model_download?: boolean };
type MaterialSource = { url: string; allow_model_download?: boolean };
/** Text read from a file or a public page. Reading keeps no spark: the person keeps what they want from it. */
export interface LingguangMaterial { text: string; title?: string; file_name?: string; source_url?: string; partial?: boolean; issues?: string[] }
/** What the Host's reader returns; only the text and what it says about its coverage are kept. */
export interface LingguangHostMaterial { text: string; title?: string; file_name?: string; source_url?: string; coverage?: string | { status?: string; issues?: string[] } }
const material = object({ text, title: text, file_name: text, source_url: text, partial: { type: "boolean" }, issues: { type: "array", items: text } }, ["text"]);
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema,
  output: ActionSchema, permissions: readonly string[], execution?: ActionDefinition["action"]["execution"]): ActionDefinition<I, O> {
  return { capability_id: `lingguang.${name}`, version: 1, operation, action: { title, description, ...(execution ? { execution } : {}),
    kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "workflow", "agent", "mcp"],
    permissions, subject_kinds: ["lingguang_spark"], input_schema: input, output_schema: output,
    // A reply waits on a model, and reading a file or page on its source: neither holds the project's queue.
    ...(CONCURRENT.has(name) ? { scheduling: "concurrent" as const } : {}) } };
}
const undoable = <I, O>(definition: ActionDefinition<I, O>, undo: NonNullable<ActionDefinition["action"]["undo"]>): ActionDefinition<I, O> =>
  ({ ...definition, action: { ...definition.action, undo } });
/**
 * Noting part of anything down (specs/archive/contextual-interaction §10 P2): a word, a passage or several, from any object,
 * becomes a spark that waits in 灵光. It writes, so it is offered as a prepared card the person confirms.
 */
export const LINGGUANG_FRAGMENT_CHOICES: readonly FragmentOfferChoice[] = [
  { offer_id: "capture", title: "记下灵光", intent: "capture", apply: "record", hint: "把这个想法记到灵光，稍后再处理",
    action: { capability_id: "lingguang.create", version: 1 }, granularities: ["word", "range", "block", "blocks"] },
];

export const lingguangActions = {
  list: define<Record<string, never>, { sparks: LingguangSpark[] }>("list", "灵光列表", "读取当前项目尚未丢弃的全部灵光", "query", object({}), object({ sparks: { type: "array", items: spark } }), read),
  get: define<{ id: string }, { spark: LingguangSpark }>("get", "读取灵光", "读取当前项目的一条灵光，包括已丢弃记录", "query", object({ id }), object({ spark }), read),
  // Noting a spark is taken back by discarding it (kept as a discarded record, not erased): the Assistant may note one
  // when asked without a confirmation, and the person can undo it.
  create: undoable(define<{ title?: string; body?: string; request_id?: string }, { spark: LingguangSpark }>("create", "记下灵光", "在当前项目保存一条灵光；带同一 request_id 重试同样的内容时返回第一次保存的那条，同一 request_id 换了内容会被拒绝", "command",
    object({ ...fields, request_id: { type: "string", minLength: 1, maxLength: 160 } }, []), object({ spark }), write), { capability_id: "lingguang.discard", version: 1, input: { ids: ["spark.id"] } }),
  update: define<{ id: string; title?: string; body?: string; expected_updated_at?: string }, { spark: LingguangSpark }>("update", "修改灵光", "修改当前项目灵光；提供读取时的 updated_at 可防止覆盖其他编辑", "command",
    object({ id, ...fields, expected_updated_at: text }, ["id"]), object({ spark }), write),
  discard: define<{ ids: string[] }, { ok: true }>("discard", "丢弃灵光", "全部对象校验通过后将所选灵光移出列表，保留原数据", "command", object({ ids }), object({ ok: { const: true } }), write),
  openConversation: define<{ spark_ids: string[] }, LingguangConversationState>("conversation.open", "打开灵光对话", "为所选灵光打开或恢复原有对话与历史，不调用模型", "command", object({ spark_ids: ids }), conversationState, [...read, ...write]),
  getConversation: define<{ id: string }, LingguangConversationState>("conversation.get", "读取灵光对话", "读取当前项目的一场对话、关联灵光和历史消息", "query", object({ id }), conversationState, read),
  message: define<{ id: string; body: string }, LingguangConversationState>("conversation.message", "继续灵光对话", "结合所选灵光和历史生成回复；需要文字模型，失败保留原会话且不生成占位回复", "command",
    object({ id, body: { type: "string", minLength: 1, maxLength: 2000, pattern: "\\S" } }), conversationState, [...read, ...write, "model:invoke"], { cost: "metered" }),
  searchEntries: lingguangSearchActions.entries,
  subject: lingguangSearchActions.subject,
  move: defineObjectMoveAction("lingguang.placement.move", ["lingguang_spark"], "灵光", [...read, ...write]),
  copy: defineObjectCopyAction("lingguang.placement.copy", ["lingguang_spark"], "灵光", [...read, ...write]),
  readFile: define<MaterialUpload, LingguangMaterial>("material.read", "读取文件内容", "提取上传文件的文字（含图片识别与音视频转写），不保存灵光；需要下载本机识别模型时先得到同意", "command",
    object({ file_name: { type: "string", minLength: 1, maxLength: 240 }, data_base64: { type: "string", minLength: 1 }, allow_model_download: { type: "boolean" } }, ["file_name", "data_base64"]), material, write),
  readSource: define<MaterialSource, LingguangMaterial>("source.read", "读取链接内容", "读取公开网页、视频字幕或播客音频的文字，不保存灵光；遵守原来源的边界", "command",
    object({ url: { type: "string", minLength: 1, maxLength: 2000 }, allow_model_download: { type: "boolean" } }, ["url"]), material, write),
  fragmentOffers: defineFragmentOffersAction("lingguang.fragment.offers", [FRAGMENT_ANY_OBJECT], "选中的内容可以记下", read, LINGGUANG_FRAGMENT_CHOICES),
};
/** The complete `lingguang.create` input for a fragment; pure. The same request id saves it once. */
export function prepareLingguangFragmentOffers(input: FragmentOffersInput): FragmentActionOffer[] {
  const text = input.fragment.targets.map(target => target.text.trim()).filter(Boolean).join("\n\n");
  if (!text) return [];
  const first = text.split("\n")[0]!.trim();
  const title = first.length > 40 ? first.slice(0, 39) + "…" : first;
  const from = input.fragment.object.title ? `\n\n出自：${input.fragment.object.title}` : "";
  const body = (text + from).slice(0, LINGGUANG_BODY_LIMIT);
  return [{ offer_id: "capture", title: "记下灵光", action: { capability_id: "lingguang.create", version: 1 },
    input: { title, body, request_id: input.request_id.slice(0, 160) }, summary: `在灵光里记下一条：「${title}」`, editable: ["title", "body"] }];
}

export const LINGGUANG_ACTIONS: readonly ActionDefinition[] = Object.values(lingguangActions);
export const LINGGUANG_ACTION_PERMISSIONS = [...new Set(LINGGUANG_ACTIONS.flatMap(definition => definition.action.permissions))];
export interface LingguangActionPorts {
  withStore<T>(run: (store: LingguangStore) => T): T;
  /** Reading files and public pages, where this machine can. */
  readFile?(input: MaterialUpload, caller: ActionExecutionContext): Promise<LingguangHostMaterial>;
  readSource?(input: MaterialSource, caller: ActionExecutionContext): Promise<LingguangHostMaterial>;
  completeText?(prompt: InstructedPrompt, options: { signal?: AbortSignal }): Promise<string>;
  modelAvailability(): ActionAvailability;
}

export function createLingguangActionHandlers(ports: LingguangActionPorts): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => {
    if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目");
    return caller.project_id;
  };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionExecutionContext) => O | Promise<O>, availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller), ...(availability ? { availability } : {}),
  });
  return [
    bindObjectMoveHandler(lingguangActions.move, input => ports.withStore(store => {
      const moved = store.relocate(input.subject.id, input.from_project_id, input.to_project_id);
      return { subject: { kind: "lingguang_spark", id: moved.id }, project_id: moved.project_id, revision: revisionOf(moved) };
    })),
    bindObjectCopyHandler(lingguangActions.copy, input => ports.withStore(store => {
      const copy = store.duplicate(input.subject.id, input.from_project_id, input.to_project_id, input.request_id);
      return { subject: { kind: "lingguang_spark", id: copy.id }, project_id: copy.project_id, revision: revisionOf(copy) };
    })),
    bind(lingguangActions.list, (_, caller) => ports.withStore(store => ({ sparks: store.list(project(caller)) }))),
    bind(lingguangActions.get, (input, caller) => ports.withStore(store => ({ spark: store.get(input.id, project(caller)) }))),
    bind(lingguangActions.fragmentOffers, input => ({ offers: prepareLingguangFragmentOffers(input) })),
    bind(lingguangActions.readFile, async (input, caller) => keptMaterial(await ports.readFile!(input, caller)), () => reading(ports.readFile)),
    bind(lingguangActions.readSource, async (input, caller) => keptMaterial(await ports.readSource!(input, caller)), () => reading(ports.readSource)),
    bind(lingguangActions.create, (input, caller) => ports.withStore(store => ({ spark: store.create({ ...input, project_id: project(caller) }) }))),
    bind(lingguangActions.update, (input, caller) => ports.withStore(store => ({ spark: store.update(input.id, input, project(caller)) }))),
    bind(lingguangActions.discard, (input, caller) => ports.withStore(store => { store.discard(input.ids, project(caller)); return { ok: true }; })),
    bind(lingguangActions.openConversation, (input, caller) => ports.withStore(store => store.openConversation(input.spark_ids, project(caller)))),
    bind(lingguangActions.getConversation, (input, caller) => ports.withStore(store => store.conversation(input.id, project(caller)))),
    bind(lingguangActions.message, async (input, caller) => {
      const projectId = project(caller);
      const snapshot = ports.withStore(store => store.conversation(input.id, projectId));
      if (snapshot.sparks.some(spark => spark.status !== "inbox")) throw new ActionError("lingguang.invalid", "关联灵光已丢弃，不能继续这场对话");
      if (!ports.completeText) throw new ActionError("actions.connection_required", "请先配置文字模型，再继续对话");
      const prompt = conversationPrompt(snapshot, input.body);
      caller.signal?.throwIfAborted();
      const reply = (await ports.completeText(prompt, { signal: caller.signal })).trim();
      caller.signal?.throwIfAborted();
      if (!reply) throw new ActionError("lingguang.empty_reply", "模型没有返回正文，输入已保留，可重试");
      await caller.beforeEffect();
      return ports.withStore(store => store.addReply(input.id, input.body, reply, projectId, snapshot));
    }, () => ports.modelAvailability()),
    ...createLingguangSearchHandlers(ports.withStore),
  ];
}

const reading = (port: unknown): ActionAvailability => port ? { available: true } : { available: false, code: "actions.connection_required", reason: "这里不能读取文件或链接" };
/** What a spark can hold of a reading: all of it up to the limit, and it says when it is not all. */
function keptMaterial(read: LingguangHostMaterial): LingguangMaterial {
  const coverage = typeof read.coverage === "string" ? { status: read.coverage, issues: [] as string[] } : { status: read.coverage?.status, issues: read.coverage?.issues ?? [] };
  const room = LINGGUANG_BODY_LIMIT - 2_000;
  const issues = [...coverage.issues, ...(read.text.length > room ? [`内容较长，只保留了前 ${room} 字`] : [])];
  return { text: read.text.slice(0, room), ...(read.title ? { title: read.title.slice(0, 200) } : {}), ...(read.file_name ? { file_name: read.file_name } : {}),
    ...(read.source_url ? { source_url: read.source_url } : {}), ...(coverage.status && coverage.status !== "sufficient" || read.text.length > room ? { partial: true } : {}), ...(issues.length ? { issues } : {}) };
}
const SPARK_IN_PROMPT = 12_000;
function conversationPrompt(state: LingguangConversationState, body: string): InstructedPrompt {
  // JSON keeps source text visibly separate from the instruction; all values remain untrusted material.
  // A spark read from a file or page can be long: the conversation gets its opening part, said so.
  const material = { sparks: state.sparks.map(({ title, body }) => ({ title, body: body.length > SPARK_IN_PROMPT ? body.slice(0, SPARK_IN_PROMPT) + "\n（以下省略）" : body })),
    history: state.messages.filter(message => message.role !== "stub").map(({ role, body }) => ({ role, body })), message: body };
  const data = JSON.stringify(material);
  if (data.length > 180_000) throw new ActionError("lingguang.context_too_large", "这场对话的材料过长，请减少所选灵光后开启对话");
  return instructed(LINGGUANG_CONVERSATION, data);
}
