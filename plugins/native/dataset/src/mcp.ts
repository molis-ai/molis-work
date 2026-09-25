import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginMcpExportDeclaration, PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { datasetActions } from "./actions.js";

/** Original names remain thin aliases; new capabilities are discovered from the shared directory. */
const legacy: Readonly<Record<string, ActionDefinition>> = {
  list: datasetActions.list, get: datasetActions.get, create: datasetActions.create, update: datasetActions.update,
  delete: datasetActions.delete, generate: datasetActions.generate, promote: datasetActions.promote,
  import: datasetActions.import, export: datasetActions.export, versions: datasetActions.versions,
  snapshot: datasetActions.snapshot, rollback: datasetActions.rollback,
};
export const DATASET_MCP_EXPORTS: readonly PluginMcpExportDeclaration[] = Object.entries(legacy).map(([tool_id, definition]) => ({
  tool_id, description: definition.action.description, input_schema: { ...definition.action.input_schema, type: "object" },
  required_actions: [definition].map(({ capability_id, version }) => ({ capability_id, version })),
  effect: definition.operation === "query" ? "read" : "write",
}));
export async function runDatasetMcpTool(actions: BoundActionClient, request: PluginMcpHandleRequest): Promise<string> {
  const definition = legacy[request.tool_id];
  if (!definition) throw new ActionError("mcp.tool_unknown", `未登记的 Dataset MCP：${request.tool_id}`);
  return JSON.stringify(await actions.invoke(definition, request.arguments));
}
