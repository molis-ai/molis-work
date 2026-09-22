import type { PluginMcpExportDeclaration, PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { JellyCommand } from "@molis-ai/molis-work-contracts/modules/jelly";
import { jellyOccurrences } from "./calendar.js";
import { JellyError } from "./error.js";
import type { JellyStore } from "./store.js";
const string = { type: "string" };
const stringArray = { type: "array", items: string };
const object = { type: "object" };
function tool(tool_id: string, description: string, effect: "read" | "write", properties: Record<string, unknown>, required: string[] = []): PluginMcpExportDeclaration {
  return { tool_id, description, effect, scope: "home", input_schema: { type: "object", properties: effect === "write" ? { ...properties, expected_revision: { type: "integer" } } : properties, required, additionalProperties: false } };
}
export const JELLY_MCP_EXPORTS: readonly PluginMcpExportDeclaration[] = [
  tool("list_items", "读取本机 Jelly 指定日期范围的事项、重复实例和当前 revision。日期为 YYYY-MM-DD。", "read", { start: string, end: string }, ["start", "end"]),
  tool("get_item", "读取已有事项或重复系列。id 必须来自 list_items。", "read", { id: string }, ["id"]),
  tool("search", "搜索 Jelly 事项、笔记和灵感。不会修改数据。", "read", { query: string }, ["query"]),
  tool("list_categories", "读取 Jelly 分类与当前版本。", "read", {}),
  tool("create_item", "按用户要求新建事项。item 包含 title/start_date/end_date、可选 start_time/end_time（本地分钟），category_id/priority/pinned。", "write", { item: object }, ["item"]),
  tool("update_item", "更新一个现有事项。patch 仅含要改字段；不能把事项完成误作 Goal 验收。", "write", { id: string, patch: object }, ["id", "patch"]),
  tool("move_items", "按用户要求把一次性事项移到指定日期，保留跨日长度和时刻。", "write", { ids: stringArray, date: string }, ["ids", "date"]),
  tool("set_task_completed", "完成或重新打开事项；重复实例须提供原始 original_date（改期也不改变它）。", "write", { id: string, original_date: string, completed: { type: "boolean" }, completion_description: string }, ["id", "completed"]),
  tool("delete_item", "按用户明确要求删除一次性事项，可撤销。重复事项用 modify_series 的 delete。", "write", { id: string }, ["id"]),
  tool("reorder_untimed_items", "为某日全部单日无时事项排序，ids必须包含该日全部合资格记录。", "write", { date: string, ids: stringArray }, ["date", "ids"]),
  tool("create_series", "新建每周重复系列。series 含事项字段、weekdays（周一1至周日7）、可选until。", "write", { series: object }, ["series"]),
  tool("modify_series", "修改或删除某次及后续。scope为onlyThis或thisAndFuture，original_date是原始发生日；delete=true才删除。", "write", { id: string, original_date: string, scope: { type: "string", enum: ["onlyThis", "thisAndFuture"] }, patch: object, delete: { type: "boolean" } }, ["id", "original_date", "scope"]),
  tool("undo", "按用户要求撤销最近一次 Jelly 写入；不影响原 Jelly App 数据。", "write", {}),
];
export function runJellyMcpTool(store: JellyStore, request: PluginMcpHandleRequest): string {
  const args = request.arguments ?? {};
  const state = store.read();
  const result = (data: unknown) => JSON.stringify(data);
  if (request.tool_id === "list_items") return result({ revision: state.revision, items: jellyOccurrences(state, String(args.start ?? ""), String(args.end ?? "")) });
  if (request.tool_id === "list_categories") return result({ revision: state.revision, categories: state.categories });
  if (request.tool_id === "get_item") {
    const item = state.items.find((i) => i.id === args.id) ?? state.series.find((i) => i.id === args.id);
    if (!item) throw new JellyError("jelly.not_found", "事项不存在");
    return result({ revision: state.revision, item });
  }
  if (request.tool_id === "search") {
    const query = String(args.query ?? "").trim().toLocaleLowerCase();
    if (!query) throw new JellyError("jelly.invalid", "请输入搜索词");
    const matches = (text: string) => text.toLocaleLowerCase().includes(query);
    return result({ revision: state.revision, items: [...state.items, ...state.series].filter((i) => matches(i.title + "\n" + i.notes)), notes: state.notes.filter((i) => !i.archived_at && matches(i.title + "\n" + i.blocks.map((b) => b.text).join("\n"))), inspirations: state.inspirations.filter((i) => !i.archived_at && matches(i.title + "\n" + i.raw_text + "\n" + (i.url ?? ""))) });
  }
  let command: JellyCommand;
  switch (request.tool_id) {
    case "create_item": command = { type: "item.create", item: args.item }; break;
    case "update_item": command = { type: "item.update", id: args.id, patch: args.patch }; break;
    case "move_items": command = { type: "item.move_many", ids: args.ids, date: args.date }; break;
    case "set_task_completed": command = { type: args.original_date ? "series.complete" : "item.complete", id: args.id, original_date: args.original_date, completed: args.completed, completion_description: args.completion_description }; break;
    case "delete_item": command = { type: "item.delete", id: args.id }; break;
    case "reorder_untimed_items": command = { type: "item.reorder", date: args.date, ids: args.ids }; break;
    case "create_series": command = { type: "series.create", series: args.series }; break;
    case "modify_series": command = { type: args.delete === true ? "series.delete" : "series.update", id: args.id, original_date: args.original_date, scope: args.scope, patch: args.patch }; break;
    case "undo": command = { type: "undo" }; break;
    default: throw new JellyError("jelly.invalid", "未知 Jelly 工具");
  }
  if (args.expected_revision !== undefined && !Number.isSafeInteger(args.expected_revision)) throw new JellyError("jelly.invalid", "版本必须为整数");
  return result({ state: store.execute(command, args.expected_revision as number | undefined ?? state.revision) });
}
