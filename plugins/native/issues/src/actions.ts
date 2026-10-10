import type { ActionDefinition, ActionHandlerBinding, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { Issue, IssueCreate, IssueDelete, IssueList, IssueListResult, IssueUpdate, IssueStore } from "./store.js";

const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const text = { type: "string" }, id = { type: "string", minLength: 1, maxLength: 100 }, version = { type: "integer", minimum: 1 };
const title = { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" }, type = { enum: ["bug", "experience", "feature"] };
const description = { type: "string", maxLength: 100000 }, supplement = { type: "string", maxLength: 10000 };
const cursor = object({ created_at: { type: "string", minLength: 1, maxLength: 40 }, id });
const issue = object({ id, title, type, description, submitter_id: text, entered_via: { enum: ["manual", "assistant", "mcp"] },
  created_at: text, updated_at: text, version,
  context: object({ recorded_at: text, page: { anyOf: [{ type: "null" }, object({ url: { type: ["string", "null"] }, title: { type: ["string", "null"] }, provenance: { enum: ["host_snapshot", "client_reported"] } })] },
    supplement: object({ text: supplement, provenance: { enum: ["client_reported", "user_edited"] } }), caller: object({ actor_id: text, audience: text }) }),
});
const rules = "个人 Home 的问题记录，切换项目不改变数据。保留用户原话与追问答复，不润色、分析或给解决办法；缺标题或类型时尽量两轮内澄清，由用户确认标题和类型后提交。只在用户明确要求时修改或删除；先读取当前版本。取消、冲突或提交结果未知时不自动重复写入。";
function action<Input, Output>(name: string, label: string, kind: "query" | "command", input_schema: ActionSchema, output_schema: ActionSchema): ActionDefinition<Input, Output> {
  return { capability_id: `issues.${name}`, version: 1, operation: kind,
    action: { kind: kind === "query" ? "query" : "operation", scope: "home", audiences: ["user", "agent", "mcp"], subject_kinds: ["issue"], title: label, description: rules,
      permissions: [kind === "query" ? "issues:read" : "issues:write"], input_schema, output_schema } };
}
export const issuesActions = {
  list: action<IssueList, IssueListResult>("list", "查看问题列表", "query", object({ type, limit: { type: "integer", minimum: 1, maximum: 100 }, cursor }, []),
    object({ items: { type: "array", items: issue, maxItems: 100 }, next_cursor: { anyOf: [{ type: "null" }, cursor] } })),
  read: action<{ id: string }, Issue>("read", "查看问题详情", "query", object({ id }), issue),
  create: action<IssueCreate, Issue>("create", "记录问题", "command", object({ title, type, description, supplement }, ["title", "type", "description"]), issue),
  update: action<IssueUpdate, Issue>("update", "修改问题", "command", object({ id, expected_version: version, title, type, description, supplement }, ["id", "expected_version"]), issue),
  delete: action<IssueDelete, { id: string; deleted: true }>("delete", "删除问题", "command", object({ id, expected_version: version }), object({ id, deleted: { const: true } })),
};
export const ISSUES_ACTIONS = Object.values(issuesActions);
export function issueActionHandlers(store: IssueStore): ActionHandlerBinding[] {
  return [
    { ...issuesActions.list, handle: (_caller, input) => store.list(input as IssueList) },
    { ...issuesActions.read, handle: (_caller, input) => store.read((input as { id: string }).id) },
    { ...issuesActions.create, handle: (caller, input) => store.create(input as IssueCreate, caller) },
    { ...issuesActions.update, handle: (caller, input) => store.update(input as IssueUpdate, caller) },
    { ...issuesActions.delete, handle: (caller, input) => store.delete(input as IssueDelete, caller) },
  ];
}
