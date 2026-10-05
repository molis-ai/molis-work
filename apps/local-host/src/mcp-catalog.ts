import {
  actionMcpToolDefinition,
  isRuntimeContextMcpTool,
  MCP_TOOLS,
  RUNTIME_MCP_TOOLS,
  type McpToolDefinition,
} from "@molis-ai/molis-work-app-mcp";
import type { ActionReference, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * One MCP catalog: the platform tools this audience may call (connecting to a project, and the trusted management
 * entry's own), and every action the authenticated client is granted and can use now. Nothing else lists a tool.
 */
export interface AssembledMcpTool {
  readonly definition: McpToolDefinition;
  readonly source: "platform" | "action";
  readonly scope: "home" | "project" | "platform";
  /** The action a tool of source `action` invokes. */
  readonly action?: ActionView;
}

export interface AssembleMcpCatalogInput {
  readonly audience: "runtime" | "management";
  /** Already filtered by the common service for this authenticated caller. */
  readonly actions?: readonly ActionView[];
  readonly actionToolName?: (reference: ActionReference) => string;
  /** Exact references already accepted by the authenticated client's grant resolver. */
  readonly authorized_actions?: readonly ActionReference[];
}

export interface AssembledMcpCatalog {
  readonly tools: McpToolDefinition[];
  readonly entries: AssembledMcpTool[];
  readonly home_scoped_names: ReadonlySet<string>;
  readonly known_names: ReadonlySet<string>;
}

export function findAssembledMcpTool(catalog: AssembledMcpCatalog, name: string): AssembledMcpTool | undefined {
  return catalog.entries.find((entry) => entry.definition.name === name);
}

const sameAction = (left: ActionReference, right: ActionReference) =>
  left.capability_id === right.capability_id && left.version === right.version && left.provider_id === right.provider_id;

export function assembleMcpCatalog(input: AssembleMcpCatalogInput): AssembledMcpCatalog {
  const platformTools = input.audience === "management" ? MCP_TOOLS : RUNTIME_MCP_TOOLS;
  const entries: AssembledMcpTool[] = platformTools.map(definition => ({ definition, source: "platform", scope: "platform" }));
  const known = new Set<string>(MCP_TOOLS.map(tool => tool.name));
  for (const action of input.actions ?? []) {
    const definition = actionMcpToolDefinition(action, input.actionToolName?.(action));
    if (known.has(definition.name)) throw new Error(`MCP 名称重复：${definition.name}`);
    known.add(definition.name);
    const reference = { capability_id: action.capability_id, version: action.version, provider_id: action.provider.provider_id };
    if (!action.availability.available || !(input.authorized_actions ?? []).some(granted => sameAction(granted, reference))) continue;
    entries.push({ definition, source: "action", scope: action.action.scope, action });
  }
  const homeScoped = new Set<string>(entries
    .filter((entry) => entry.scope === "home" || isRuntimeContextMcpTool(entry.definition.name))
    .map((entry) => entry.definition.name));
  return { tools: entries.map((entry) => entry.definition), entries, home_scoped_names: homeScoped, known_names: known };
}
