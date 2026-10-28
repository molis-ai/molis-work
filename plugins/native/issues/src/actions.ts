import { ActionError, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginModelClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { Issue, IssueCreate, IssueDelete, IssueList, IssueListResult, IssueUpdate, IssueStore } from "./store.js";
import { IssueCaptures, type IssueDraft, type IssueCapture, type IssueNamed } from "./capture.js";
import { ISSUE_IMAGE_BYTES, ISSUE_IMAGE_LIMIT, validateIssueImages } from "./images.js";
import { nameIssue, type IssueNaming, type IssueNamingInput } from "./naming.js";

const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const text = { type: "string" }, id = { type: "string", minLength: 1, maxLength: 100 }, version = { type: "integer", minimum: 1 };
const title = { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" }, type = { enum: ["bug", "experience", "feature"] };
const description = { type: "string", maxLength: 100000 };
const images = { type: "array", maxItems: ISSUE_IMAGE_LIMIT, items: object({ name: { type: "string", minLength: 1, maxLength: 200 },
  data_url: { type: "string", maxLength: Math.ceil(ISSUE_IMAGE_BYTES / 3) * 4 + 32, pattern: "^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$" } }) };
const cursor = object({ created_at: { type: "string", minLength: 1, maxLength: 40 }, id });
const properties = { id, title, type, description, image_count: { type: "integer", minimum: 0, maximum: ISSUE_IMAGE_LIMIT }, submitter_id: text, entered_via: { enum: ["manual", "assistant", "mcp"] },
  created_at: text, updated_at: text, version,
  context: object({ recorded_at: text, page: { anyOf: [{ type: "null" }, object({ url: { type: ["string", "null"] }, title: { type: ["string", "null"] }, provenance: { enum: ["host_snapshot", "client_reported"] } })] },
    caller: object({ actor_id: text, audience: text }) }),
};
const issue = object({ ...properties, images });
const rules = "个人 Home 的问题记录，切换项目不改变数据。保留用户原话与追问答复，不润色、分析或给解决办法；按描述和截图起简洁标题，类型为 Bug、体验问题或功能需求。新记录可撤销，之后可在详情里修改。只在用户明确要求时修改或删除；先读取当前版本。取消、冲突或提交结果未知时不自动重复写入。";
function action<Input, Output>(name: string, label: string, effect: "read" | "write" | "irreversible", input_schema: ActionSchema, output_schema: ActionSchema, contractVersion = 2,
  audiences: ActionDefinition<Input, Output>["action"]["audiences"] = ["user", "agent", "mcp"], extra: Partial<ActionDefinition<Input, Output>["action"]> = {}): ActionDefinition<Input, Output> {
  return { capability_id: `issues.${name}`, version: contractVersion, operation: effect === "read" ? "query" : "command",
    action: { effect, kind: effect === "read" ? "query" : "operation", scope: "home", audiences, subject_kinds: ["issue"], title: label, description: rules,
      permissions: [effect === "read" ? "issues:read" : "issues:write"], input_schema, output_schema, ...extra } };
}
// A new record can be taken back while nobody has changed it, so an Assistant asked to record one may save it directly.
const undo = { capability_id: "issues.discard", version: 1, input: { id: "id", expected_version: "version" } };
const page = object({ url: { type: ["string", "null"], maxLength: 500 }, title: { type: ["string", "null"], maxLength: 200 } });
const prepare = action<IssueDraft, { draft_id: string }>("prepare", "准备问题草稿", "write", object({ draft_id: id, description, images, page }, ["draft_id", "description"]), object({ draft_id: id }), 3, ["user"]);
const cancel = action<{ draft_id: string }, { saved_id: string | null }>("cancel_capture", "取消问题草稿", "write", object({ draft_id: id }), object({ saved_id: { type: ["string", "null"] } }), 1, ["user"]);
// The page's own naming (ISSUE-50, ISSUE-51): one bounded call to the Host's text model, made inside the action.
const naming = (permission: string) => ({ permissions: [permission, "model:invoke"], scheduling: "concurrent" as const, execution: { cost: "metered" as const } });
const question = object({ status: { const: "needs_input" }, question: { type: "string", minLength: 1, maxLength: 200 } });
const nameDraft = action<{ draft_id: string }, IssueNamed>("name_draft", "整理并保存录入的问题", "write", object({ draft_id: id }),
  { anyOf: [object({ status: { const: "saved" }, issue }), question] }, 1, ["user"],
  { ...naming("issues:write"), description: "按 Issue 的规则给页面录入的草稿起标题、判类型，并一次存成新记录（可撤销）；依据不足时只返回一句追问，不写入。调用当前文字模型。" });
// Writes nothing, but a metered model call is not a query that may be replayed or run where no cost is allowed: a command whose effect is read, as pages.ai is.
const asCommand = <I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> => ({ ...definition, operation: "command", action: { ...definition.action, kind: "operation" } });
const suggestName = asCommand(action<IssueNamingInput, IssueNaming>("suggest_name", "重新整理标题和类型", "read", object({ description, images, page }, ["description"]),
  { anyOf: [object({ status: { const: "named" }, title, type }), question] }, 1, ["user"],
  { ...naming("issues:read"), description: "按 Issue 的规则给编辑中的问题描述和截图建议标题与类型，不写入；依据不足时只返回一句追问。调用当前文字模型。" }));

export const issuesActions = {
  prepare, cancel, nameDraft, suggestName,
  // Saves a page's draft as a new record named by the person on that page.
  capture: action<IssueCapture, Issue>("capture", "保存录入的问题", "write", object({ draft_id: { ...id, title: "录入草稿" }, title: { ...title, title: "标题" }, type: { ...type, title: "问题类型" } }), issue, 1,
    ["user"], { undo }),
  discard: action<IssueDelete, { id: string; discarded: true }>("discard", "撤销记录", "write", object({ id, expected_version: version }), object({ id, discarded: { const: true } }), 1, ["user", "agent"],
    { description: "撤回刚记录的 Issue：只在记录后没有改过时删除；改过就不删并说明。" }),
  list: action<IssueList, IssueListResult>("list", "查看问题列表", "read", object({ type, limit: { type: "integer", minimum: 1, maximum: 100 }, cursor }, []),
    object({ items: { type: "array", items: object(properties), maxItems: 100 }, next_cursor: { anyOf: [{ type: "null" }, cursor] } })),
  read: action<{ id: string }, Issue>("read", "查看问题详情", "read", object({ id }), issue),
  create: action<IssueCreate, Issue>("create", "记录问题", "write", object({ title, type, description, images }, ["title", "type", "description"]), issue, 2, undefined, { undo }),
  update: action<IssueUpdate, Issue>("update", "修改问题", "write", object({ id, expected_version: version, title, type, description, images }, ["id", "expected_version"]), issue),
  delete: action<IssueDelete, { id: string; deleted: true }>("delete", "删除问题", "irreversible", object({ id, expected_version: version }), object({ id, deleted: { const: true } }), 1),
};
export const ISSUES_ACTIONS = Object.values(issuesActions);
/** Words and screenshots being edited on a saved record, checked as a capture's are; nothing about them is kept. */
function editing(input: IssueNamingInput): IssueNamingInput {
  if (typeof input.description !== "string" || [...input.description].length > 100000 || !input.description.trim() && !input.images?.length) throw new ActionError("actions.input_invalid", "请描述问题或添加图片");
  validateIssueImages([...input.images ?? []]);
  return input;
}
export function issueActionHandlers(store: IssueStore, model?: PluginModelClient): ActionHandlerBinding[] {
  const captures = new IssueCaptures(store);
  return [
    { ...issuesActions.prepare, handle: (caller, input) => captures.prepare(input as IssueDraft, caller) },
    { ...issuesActions.cancel, handle: (caller, input) => captures.cancel((input as { draft_id: string }).draft_id, caller) },
    { ...issuesActions.nameDraft, handle: (caller, input) => captures.name((input as { draft_id: string }).draft_id, caller, model) },
    { ...issuesActions.suggestName, handle: async (caller, input) => (await nameIssue(model, editing(input as IssueNamingInput), caller.signal)).naming },
    { ...issuesActions.capture, handle: (caller, input) => captures.capture(input as IssueCapture, caller) },
    { ...issuesActions.discard, handle: (caller, input) => store.discard(input as IssueDelete, caller) },
    { ...issuesActions.list, handle: (_caller, input) => store.list(input as IssueList) },
    { ...issuesActions.read, handle: (_caller, input) => store.read((input as { id: string }).id) },
    { ...issuesActions.create, handle: (caller, input) => store.create(input as IssueCreate, caller) },
    { ...issuesActions.update, handle: (caller, input) => store.update(input as IssueUpdate, caller) },
    { ...issuesActions.delete, handle: (caller, input) => store.delete(input as IssueDelete, caller) },
  ];
}
