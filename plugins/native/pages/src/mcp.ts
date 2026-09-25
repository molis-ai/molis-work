import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginMcpExportDeclaration, PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pagesActions } from "./actions.js";

/** Existing public names are aliases of the shared business contracts. New clients use the action directory. */
const legacy: Readonly<Record<string, ActionDefinition>> = {
  list: pagesActions.list, get: pagesActions.get, create: pagesActions.create, update: pagesActions.update,
  delete: pagesActions.delete, promote: pagesActions.promote, extract: pagesActions.extract, ai: pagesActions.ai,
};
export const PAGES_MCP_EXPORTS: readonly PluginMcpExportDeclaration[] = Object.entries(legacy).map(([tool_id, definition]) => ({
  tool_id, description: definition.action.description, input_schema: { ...definition.action.input_schema, type: "object" },
  required_actions: (tool_id === "list" ? [definition, pagesActions.templates] : tool_id === "ai" ? [definition, pagesActions.get, pagesActions.create] : [definition]).map(({ capability_id, version }) => ({ capability_id, version })),
  effect: definition.operation === "query" ? "read" : "write",
}));

export async function runPagesMcpTool(actions: BoundActionClient, request: PluginMcpHandleRequest): Promise<string> {
  const definition = legacy[request.tool_id];
  if (!definition) throw new ActionError("mcp.tool_unknown", `未登记的 Pages MCP：${request.tool_id}`);
  const result = await actions.invoke(definition, request.arguments);
  // Legacy list included templates, and translate_new immediately created a document.
  // Compose the same actions to preserve these two response contracts without a second executor.
  if (request.tool_id === "list") return JSON.stringify({ ...result as object, ...await actions.invoke(pagesActions.templates, {}) });
  if (request.tool_id === "ai" && request.arguments.command === "translate_new") {
    const { document: current } = await actions.invoke(pagesActions.get, { id: request.arguments.id as string });
    const ai = result as { text: string };
    const created = await actions.invoke(pagesActions.create, { title: `${current.title} · 翻译`.slice(0, 80), folder_id: current.folder_id,
      body: { type: "doc", content: ai.text.split(/\n{2,}/).filter(part => part.trim()).map(part => ({ type: "paragraph", content: [{ type: "text", text: part.trim() }] })) } });
    return JSON.stringify({ ...result as object, ...created });
  }
  return JSON.stringify(result);
}
