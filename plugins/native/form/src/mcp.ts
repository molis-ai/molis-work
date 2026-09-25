import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginMcpExportDeclaration, PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { formActions } from "./actions.js";

/** Original names remain thin aliases; new capabilities are discovered from the shared directory. */
const legacy: Readonly<Record<string, ActionDefinition>> = {
  list: formActions.list, get: formActions.get, create: formActions.create, update: formActions.update,
  delete: formActions.delete, generate: formActions.generate, promote: formActions.promote,
  publish: formActions.publish, submit: formActions.submit, results: formActions.results,
};
export const FORM_MCP_EXPORTS: readonly PluginMcpExportDeclaration[] = Object.entries(legacy).map(([tool_id, definition]) => ({
  tool_id, description: definition.action.description, input_schema: { ...definition.action.input_schema, type: "object" },
  required_actions: [definition].map(({ capability_id, version }) => ({ capability_id, version })),
  effect: definition.operation === "query" ? "read" : "write",
}));
export async function runFormMcpTool(actions: BoundActionClient, request: PluginMcpHandleRequest): Promise<string> {
  const definition = legacy[request.tool_id];
  if (!definition) throw new ActionError("mcp.tool_unknown", `未登记的 Forms MCP：${request.tool_id}`);
  return JSON.stringify(await actions.invoke(definition, request.arguments));
}
