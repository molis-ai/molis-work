import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginMcpExportDeclaration, PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { jellyActions } from "./actions.js";
import { jellyCommandActions } from "./command-actions.js";
import { JellyError } from "./error.js";

// Only public name/argument compatibility lives here. Schemas and execution belong to actions.
const aliases: Record<string, ActionDefinition> = {
  list_items: jellyActions.calendar, get_item: jellyActions.item, search: jellyActions.search, list_categories: jellyActions.categories,
  create_item: jellyCommandActions["item.create"], update_item: jellyCommandActions["item.update"], move_items: jellyCommandActions["item.move_many"],
  set_task_completed: jellyCommandActions["item.complete"], delete_item: jellyCommandActions["item.delete"], reorder_untimed_items: jellyCommandActions["item.reorder"],
  create_series: jellyCommandActions["series.create"], modify_series: jellyCommandActions["series.update"], undo: jellyCommandActions.undo,
};
export const JELLY_MCP_EXPORTS: readonly PluginMcpExportDeclaration[] = Object.entries(aliases).map(([tool_id, definition]) => {
  const schema = definition.action.input_schema;
  const properties = { ...schema.properties as Record<string, unknown> };
  let required = (schema.required as string[]).filter(field => field !== "expected_revision");
  if (tool_id === "set_task_completed") properties.original_date = (jellyCommandActions["series.complete"].action.input_schema.properties as Record<string, unknown>).original_date;
  if (tool_id === "modify_series") { properties.delete = { type: "boolean" }; required = required.filter(field => field !== "patch"); }
  const dependencies = [definition, ...(definition.operation === "command" ? [jellyActions.categories] : []),
    ...(tool_id === "set_task_completed" ? [jellyCommandActions["series.complete"]] : []),
    ...(tool_id === "modify_series" ? [jellyCommandActions["series.delete"]] : [])];
  return { required_actions: dependencies.map(({ capability_id, version }) => ({ capability_id, version })), tool_id, description: definition.action.description + (tool_id === "modify_series" ? " delete=true 删除，否则传入 patch 修改。" : tool_id === "set_task_completed" ? " 重复实例需提供 original_date。" : ""), effect: definition.operation === "query" ? "read" : "write", scope: "home", input_schema: { ...schema, type: "object", properties, required } };
});
function definitionFor(request: PluginMcpHandleRequest): ActionDefinition {
  const definition = aliases[request.tool_id];
  if (!Object.hasOwn(aliases, request.tool_id)) throw new JellyError("jelly.invalid", "未知 Jelly 工具");
  if (request.tool_id === "set_task_completed" && request.arguments?.original_date) return jellyCommandActions["series.complete"];
  if (request.tool_id === "modify_series" && request.arguments?.delete === true) return jellyCommandActions["series.delete"];
  return definition!;
}
export async function runJellyMcpTool(actions: BoundActionClient, request: PluginMcpHandleRequest): Promise<string> {
  const definition = definitionFor(request), input = { ...request.arguments };
  if (request.tool_id === "modify_series") { delete input.delete; if (definition === jellyCommandActions["series.delete"]) delete input.patch; }
  if (request.tool_id === "set_task_completed" && definition === jellyCommandActions["item.complete"]) delete input.original_date;
  // The historical MCP contract allows omitted revision; retain a CAS against a fresh read.
  if (definition.operation === "command" && input.expected_revision === undefined) input.expected_revision = (await actions.invoke(jellyActions.categories, {})).revision;
  return JSON.stringify(await actions.invoke(definition, input));
}
