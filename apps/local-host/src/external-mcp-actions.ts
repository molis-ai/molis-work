import path from "node:path";
import type { ActionDefinition, ActionHandlerBinding, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMcpLibrary, AgentMcpToolDescriptor, AgentSkillOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import { createMcpVersionBook, EXTERNAL_MCP_CAPABILITY_PREFIX, EXTERNAL_MCP_PERMISSION, mcpIdPart, mcpInputSchema, mcpToolDescription, readJsonFile, writeJsonFile } from "./mcp-tool-actions.js";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";

const OUTPUT: ActionSchema = { type: "object", properties: { text: { type: "string" }, truncated: { type: "boolean" } }, required: ["text", "truncated"], additionalProperties: false };
const VERSIONS_PATH = "config/external-mcp-actions.json";
/** What each project's connected servers offered, so a restart keeps the entries (shown unavailable until reconnected). No secrets. */
const SEEN_PATH = "config/external-mcp-tools.json";
type Place = { project_id: string; board_id: string; storage_key: string };
type Seen = Place & { plugin_id: string; runtime_id: string; tools: AgentMcpToolDescriptor[] };

/**
 * Tools of connected external MCP servers enter the same project directory as every plugin action.
 * The owner of the configuration (the plugin that connected it) stays the owner; each server is its own provider,
 * so its label groups its tools. A tool's version changes whenever the server's configuration or the tool's shape
 * does, so saved references never silently run a different tool.
 */
export function createExternalMcpDirectory(options: { localHost: MolisWorkLocalHost; homeDirectory?: string }) {
  const registered = new Map<string, Array<() => void>>();
  /** Tools last seen per project and plugin: a saved server that disconnects keeps its entries, shown unavailable with the reason. */
  const lastSeen = new Map<string, AgentMcpToolDescriptor[]>();
  const versions = createMcpVersionBook(options.homeDirectory ? path.join(options.homeDirectory, VERSIONS_PATH) : undefined);
  const seenFile = options.homeDirectory ? path.join(options.homeDirectory, SEEN_PATH) : undefined;
  const readSeen = (): Record<string, Seen> => seenFile ? readJsonFile<Record<string, Seen>>(seenFile, {}) : {};
  const remember = (key: string, entry: Seen) => {
    if (!seenFile) return;
    const all = readSeen();
    if (entry.tools.length) all[key] = entry; else if (key in all) delete all[key]; else return;
    try { writeJsonFile(seenFile, all); } catch { /* The live directory is right; only the restart copy is behind. */ }
  };
  const restoring = new Map<string, Promise<void>>();

  async function sync(place: Place, pluginId: string, runtimeId: string, library: AgentMcpLibrary, owner: AgentSkillOwner): Promise<void> {
    if (!library.tools || !library.call || !library.live) return;
    const key = JSON.stringify([place.project_id, pluginId]);
    if (!lastSeen.has(key)) { const saved = readSeen()[key]; if (saved) lastSeen.set(key, saved.tools); }
    const live = await library.tools(owner);
    // A server still configured but not connected keeps what it offered, so references and the directory say why it cannot run.
    const configured = new Set((await library.list(owner)).map(server => server.id));
    const connected = new Set(live.map(tool => tool.server));
    const tools = [...live, ...(lastSeen.get(key) ?? []).filter(tool => configured.has(tool.server) && !connected.has(tool.server))];
    lastSeen.set(key, tools);
    remember(key, { ...place, plugin_id: pluginId, runtime_id: runtimeId, tools });
    const byServer = new Map<string, AgentMcpToolDescriptor[]>();
    for (const tool of tools) byServer.set(tool.server, [...byServer.get(tool.server) ?? [], tool]);
    const next: Array<{ server: string; label: string; entries: Array<{ definition: ActionDefinition; tool: AgentMcpToolDescriptor }> }> = [];
    for (const [server, list] of byServer) {
      const entries = list.map(tool => ({ tool, definition: {
        capability_id: `${EXTERNAL_MCP_CAPABILITY_PREFIX}${mcpIdPart(server)}.${mcpIdPart(tool.tool)}`,
        version: versions.versionOf(JSON.stringify([pluginId, server, tool.tool]), `${tool.configuration_version}:${tool.version}`), operation: "command" as const,
        action: { title: tool.tool, description: mcpToolDescription(tool.server_label, tool.description),
          // Not offered to agents: the built-in Agent reaches these servers through its own MCP connection.
          kind: "operation" as const, scope: "project" as const, audiences: ["user", "workflow", "mcp", "plugin"] as const, permissions: [EXTERNAL_MCP_PERMISSION],
          // The upstream server owns its state; waiting on it must not hold the project's other operations in line.
          scheduling: "concurrent" as const,
          subject_kinds: [], input_schema: mcpInputSchema(tool.input_schema), output_schema: OUTPUT } } }));
      next.push({ server, label: list[0]!.server_label, entries });
    }
    for (const dispose of registered.get(key) ?? []) dispose();
    const registry = options.localHost.actionRegistry(place);
    registered.set(key, next.map(({ server, label, entries }) => registry.registerProvider({
      provider: { provider_id: `${pluginId}#mcp:${server}`, plugin_id: pluginId, title: label, kind: "plugin", project_id: place.project_id },
      definitions: entries.map(entry => entry.definition),
      handlers: entries.map(({ definition, tool }): ActionHandlerBinding => ({ capability_id: definition.capability_id, version: definition.version,
        availability: () => library.live!(tool) ? { available: true } : { available: false, code: "actions.connection_unavailable", reason: `外部 MCP「${label}」已断开或工具形状已变化，请重新连接后再用` },
        handle: async (caller, input) => {
          // beforeEffect rechecks the availability above; the library validates the tool against the live server again.
          await caller.beforeEffect();
          return library.call!(owner, tool, input as Record<string, unknown>, caller.signal ? { signal: caller.signal } : {});
        } })),
    })));
  }
  return {
    sync(runtime: MolisWorkProjectRuntime, pluginId: string, runtimeId: string, library: AgentMcpLibrary, owner: AgentSkillOwner) {
      return sync({ project_id: runtime.project_id, board_id: runtime.board_id, storage_key: runtime.store.path }, pluginId, runtimeId, library, owner);
    },
    /**
     * After a restart (or a project reopening) the directory is empty until someone lists the servers again. The first
     * directory read for the project brings back what its saved servers last offered; connections are not reopened on
     * their own — a server that was connected comes back unavailable with the reason, until the person reconnects it.
     */
    async restore(reference: Place, libraryFor: (runtimeId: string) => Promise<AgentMcpLibrary | undefined>): Promise<void> {
      const pending = Object.entries(readSeen()).filter(([key, entry]) => entry.project_id === reference.project_id && entry.storage_key === reference.storage_key && !registered.has(key));
      await Promise.all(pending.map(([key, entry]) => {
        const run = restoring.get(key) ?? (async () => {
          try {
            const library = await libraryFor(entry.runtime_id);
            if (library && !registered.has(key)) await sync(entry, entry.plugin_id, entry.runtime_id, library, { board_id: entry.board_id, plugin_id: entry.plugin_id });
          } catch { /* The directory stays as it is; the next list of the servers catches up. */ }
          finally { restoring.delete(key); }
        })();
        restoring.set(key, run);
        return run;
      }));
    },
    close() { for (const list of registered.values()) for (const dispose of list) dispose(); registered.clear(); },
  };
}
