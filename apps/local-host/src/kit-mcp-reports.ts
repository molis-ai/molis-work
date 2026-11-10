import path from "node:path";
import { bindActionHandler, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { externalTool, type ExternalToolId } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { defineKitReportAction, type KitReport, type KitReportedEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { AgentMcpLibrary } from "@molis-ai/molis-work-contracts/services/agent-host";
import { KIT_AGENT_MCP_PROVIDER_ID, KIT_MCP_ACCESS_PROVIDER_ID, KIT_READ_PERMISSION } from "@molis-ai/molis-work-contracts/services/kit";
import { withConnectorConnections } from "./connector-connection-store.js";
import { CONNECTOR_MCP_SEEN_PATH, type ConnectorMcpSeen } from "./connector-mcp-actions.js";
import { readMcpToolPreference } from "./mcp-settings-store.js";
import { readJsonFile } from "./mcp-tool-actions.js";
import { PRODUCT_VERSION } from "./product-version.js";
import type { ProjectPluginHost } from "./project-plugin-ports.js";
import { scopeInstallations, type ScopeInstallation } from "./scope-installations.js";
import { isTaskGrantSubject } from "./task-grant-subjects.js";

// MCP as AI kit entries (specs/capability-pack/contract-design.md §4.8, §5.3): each owner reports what it already keeps — the Agent
// Host's MCP library its safe view, the connections what their servers last listed, the outbound access its grants. Listing the kit
// connects no server, calls no tool and refreshes no credential (S-kit-catalog #9). A tool's calls are in the diagnostic call log, whose
// one cap over every command is neither rows per key nor days, so a tool's usage is `not_counted`.

type Health = "connected" | "disconnected" | "unavailable" | "not-reattached";
const words = (english: boolean) => english
  ? { config: (n: number) => `config v${n}`, connections: "Connections", access: "Outside access", server: "Molis Work MCP server", serverAbout: "The tools Molis Work opens to this client.", prologue: "Built-in Agent (Prologue)" }
  : { config: (n: number) => `配置第 ${n} 版`, connections: "服务连接", access: "对外接入", server: "Molis Work 的 MCP 服务器", serverAbout: "Molis Work 开给这个客户端的工具。", prologue: "内置 Agent（Prologue）" };
const NONE = { tools: [], permissions: [], connector_categories: [] };

/** One server and each tool it listed, in one pack; the server's switch and health, each tool's own 「能调」. */
function serverEntries(server: { owner: "project" | "connection"; id: string; label: string; version: number; label_version: string; enabled: boolean; health: Health; where: string },
  tools: ReadonlyArray<{ name: string; description: string; live: boolean }>, placed: { pack: string; scope: "home" | "project"; manage: { href: string; label: string } }): KitReportedEntry[] {
  const source = { kind: "mcp_server" as const, owner: server.owner, server_id: server.id, label: server.label.slice(0, 200) };
  const usable = server.enabled && server.health === "connected";
  const common = { declares: NONE, scope: placed.scope, where: [server.where.slice(0, 200)], usage: { kind: "not_counted" as const }, manage: placed.manage, export: "reference" as const, source, pack: placed.pack };
  const id = `${placed.pack}/${server.id}`;
  return [
    { ...common, kind: "mcp", entry_id: id, name: source.label, description: "", version: { label: server.label_version },
      availability: usable ? { available: true } : { available: false, reason: server.enabled ? server.health : "server_disabled" },
      ref: { part: "server", owner: server.owner, server_id: server.id, configuration_version: server.version }, mcp: { server_enabled: server.enabled, health: server.health } },
    ...tools.map((tool): KitReportedEntry => ({ ...common, kind: "mcp", entry_id: `${id}/tool:${tool.name}`, name: tool.name.slice(0, 200), description: tool.description.slice(0, 2000),
      version: { label: server.label_version }, availability: usable && tool.live ? { available: true } : { available: false, reason: usable ? "tool_unavailable" : server.enabled ? server.health : "server_disabled" },
      ref: { part: "tool", server_id: server.id, name: tool.name }, mcp: { action_available: usable && tool.live } })),
  ];
}

export const agentMcpKitReport = defineKitReportAction("agent.mcp.kit.report", /* @version action.agent.mcp.kit.report */ 1, "项目 MCP 的能力包条目", [KIT_READ_PERMISSION]);

/** The calling project's MCP servers, each in its owner plugin's pack, from the library's safe view (never `list`, `control` or `call`). */
export async function agentMcpKitEntries(library: AgentMcpLibrary | undefined, reach: () => Promise<readonly ScopeInstallation[]>, caller: ActionCallContext): Promise<KitReport> {
  if (!caller.project_id || !library?.catalog) return { entries: [] };
  const servers = (await library.catalog()).filter(({ owner }) => owner.project_id === caller.project_id);
  if (!servers.length) return { entries: [] };
  const say = words(caller.locale === "en"), installations = await reach();
  const entries = servers.flatMap(({ owner, server }) => {
    const install = installations.find(row => row.record.plugin_id === owner.plugin_id && row.scope === "project") ?? installations.find(row => row.record.plugin_id === owner.plugin_id);
    if (!install) return [];
    return serverEntries({ owner: "project", id: server.id, label: server.label, version: server.version, label_version: say.config(server.version), enabled: server.enabled, health: server.health,
      where: install.manifest?.name ?? owner.plugin_id }, server.tools.map(tool => ({ name: tool.tool, description: tool.description, live: library.live?.(tool) ?? false })),
    { pack: `plugin:${install.record.install_id}`, scope: install.scope, manage: { href: "/capabilities/connections", label: say.connections } });
  });
  return { entries };
}

export function agentMcpKitProvider(library: () => Promise<AgentMcpLibrary | undefined>, source: ProjectPluginHost): ActionProviderRegistration {
  return { provider: { provider_id: KIT_AGENT_MCP_PROVIDER_ID, title: "项目 MCP", kind: "system" }, definitions: [agentMcpKitReport],
    handlers: [bindActionHandler(agentMcpKitReport, async (_input, caller) => agentMcpKitEntries(await library(), async () => (await scopeInstallations(source, caller)).installations, caller))] };
}

export const connectorsKitReport = defineKitReportAction("connectors.kit.report", /* @version action.connectors.kit.report */ 1, "连接 MCP 的能力包条目", [KIT_READ_PERMISSION]);

/**
 * The Home's MCP connections and the tools their servers last listed (what the directory registered), in the pack of the plugin that
 * declared the connection when it is in the call's scope, else Molis Work's own. Read from the store and the remembered list.
 */
export async function connectorsKitEntries(home: string, source: ProjectPluginHost, caller: ActionCallContext): Promise<KitReport> {
  const say = words(caller.locale === "en"), seen = readJsonFile<ConnectorMcpSeen>(path.join(home, CONNECTOR_MCP_SEEN_PATH), {});
  const connections = withConnectorConnections(home, store => store.list().filter(row => row.auth_method === "mcp").map(row => ({ row, state: store.state(row), declarer: store.view(row).declared_by })));
  if (!connections.length) return { entries: [] };
  const { installations } = await scopeInstallations(source, caller);
  return { entries: connections.flatMap(({ row, state, declarer: by }) => {
    const declarer = by && installations.find(install => install.record.plugin_id === by.plugin_id);
    const health: Health = state === "connected" ? "connected" : state === "disconnected" ? "disconnected" : "unavailable";
    // A connection's configuration has no number of its own: its version is when it last changed.
    const changed = Date.parse(row.updated_at);
    return serverEntries({ owner: "connection", id: row.connection_id, label: row.display_name, version: Number.isFinite(changed) ? Math.floor(changed / 1000) : 0,
      label_version: row.updated_at.slice(0, 10), enabled: row.enabled, health, where: row.display_name },
      (seen[row.connection_id]?.tools ?? []).map(tool => ({ name: tool.name, description: tool.description, live: true })),
      { pack: declarer ? `plugin:${declarer.record.install_id}` : "system:builtin", scope: declarer ? declarer.scope : "home", manage: { href: "/capabilities/connections", label: say.connections } });
  }) };
}

/** The connectors' provider with its kit report beside its other actions: the connections are its own. */
export function withConnectorsKitReport(registration: ActionProviderRegistration, home: string, source: ProjectPluginHost): ActionProviderRegistration {
  return { ...registration, definitions: [...registration.definitions, connectorsKitReport],
    handlers: [...registration.handlers, bindActionHandler(connectorsKitReport, (_input, caller) => connectorsKitEntries(home, source, caller))] };
}

export const mcpAccessKitReport = defineKitReportAction("mcp.access.kit.report", /* @version action.mcp.access.kit.report */ 1, "对外接入的能力包条目", [KIT_READ_PERMISSION]);

/**
 * Molis Work's own MCP server as each client it is open to sees it: one entry per client with an enabled grant, a known Runtime by its
 * external tool. Task grants are the person's per task and are not listed here (as on the access page).
 */
export async function mcpAccessKitEntries(home: string, caller: ActionCallContext): Promise<KitReport> {
  const say = words(caller.locale === "en"), preference = await readMcpToolPreference(home);
  const open = [...new Set(preference.action_grants.filter(grant => grant.enabled && !isTaskGrantSubject(grant.client_id)).map(grant => grant.client_id))];
  return { entries: open.map((clientId): KitReportedEntry => {
    const runtime = clientId.startsWith("runtime:") ? clientId.slice("runtime:".length) as ExternalToolId : undefined;
    const known = runtime ? externalTool(runtime) as ReturnType<typeof externalTool> | undefined : undefined;
    const title = (known?.display_name ?? (clientId === "agent:prologue" ? say.prologue : clientId)).slice(0, 200);
    return { kind: "mcp", entry_id: `outbound/${clientId}`, name: `${say.server} → ${title}`.slice(0, 200), description: say.serverAbout, version: { label: PRODUCT_VERSION },
      declares: NONE, scope: "home", where: [title], availability: { available: true }, usage: { kind: "none" }, manage: { href: `/capabilities/access?client=${encodeURIComponent(clientId)}`, label: say.access },
      export: "none", ref: { part: "outbound", client_id: clientId },
      mcp: { granted_to: [{ client_id: clientId, title, ...(known ? { external_tool: known.id } : {}) }] },
      source: { kind: "outbound", title: say.server }, pack: "system:builtin" };
  }) };
}

export function mcpAccessKitProvider(home: string): ActionProviderRegistration {
  return { provider: { provider_id: KIT_MCP_ACCESS_PROVIDER_ID, title: "对外接入", kind: "system" }, definitions: [mcpAccessKitReport],
    handlers: [bindActionHandler(mcpAccessKitReport, (_input, caller) => mcpAccessKitEntries(home, caller))] };
}
