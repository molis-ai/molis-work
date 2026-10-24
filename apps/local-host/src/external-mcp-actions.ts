import path from "node:path";
import { hostLog } from "./host-log.js";
import type { ActionDefinition, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMcpLibrary, AgentMcpToolDescriptor, AgentSkillOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import { createMcpVersionBook, createRegistrationSet, EXTERNAL_MCP_CAPABILITY_PREFIX, EXTERNAL_MCP_PERMISSION, mcpIdPart, mcpInputContract, mcpToolDescription, readJsonFile, writeJsonFile } from "./mcp-tool-actions.js";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import { observeConnectionCall } from "./connector-call-observation.js";
import { projectMcpProviderId, projectMcpRevision } from "./connector-project-status.js";

const OUTPUT: ActionSchema = { type: "object", properties: { text: { type: "string" }, truncated: { type: "boolean" } }, required: ["text", "truncated"], additionalProperties: false };
const VERSIONS_PATH = "config/external-mcp-actions.json";
/** What each project's connected servers offered, so a restart keeps the entries (shown unavailable until reconnected). No secrets. */
const SEEN_PATH = "config/external-mcp-tools.json";
type Place = { project_id: string; storage_key: string };
type Seen = Place & { plugin_id: string; runtime_id: string; tools: AgentMcpToolDescriptor[] };

/**
 * Tools of connected external MCP servers enter the same project directory as every plugin action.
 * The SDK keeps configuration provenance; the Host owns each server provider independently of its source plugin,
 * so its label groups its tools. A tool's version changes whenever the server's configuration or the tool's shape
 * does, so saved references never silently run a different tool.
 */
export function createExternalMcpDirectory(options: { localHost: MolisWorkLocalHost; homeDirectory?: string }) {
  const registered = new Map<string, ReturnType<typeof createRegistrationSet>>();
  /** A registration's handlers hold the library they were made with, so another library is another registration. */
  const libraries = new WeakMap<object, number>();
  let libraryCount = 0;
  const libraryId = (library: object) => { let id = libraries.get(library); if (id === undefined) libraries.set(library, id = ++libraryCount); return id; };
  /** Tools last seen per project and plugin: a saved server that disconnects keeps its entries, shown unavailable with the reason. */
  const lastSeen = new Map<string, AgentMcpToolDescriptor[]>();
  const versions = createMcpVersionBook(options.homeDirectory ? path.join(options.homeDirectory, VERSIONS_PATH) : undefined);
  const seenFile = options.homeDirectory ? path.join(options.homeDirectory, SEEN_PATH) : undefined;
  const readSeen = (): Record<string, Seen> => seenFile ? readJsonFile<Record<string, Seen>>(seenFile, {}) : {};
  const remember = (key: string, entry: Seen) => {
    if (!seenFile) return;
    const all = readSeen();
    if (entry.tools.length) all[key] = entry; else if (key in all) delete all[key]; else return;
    // The live directory is right; only the copy a restart reads is behind, which the log says.
    try { writeJsonFile(seenFile, all); } catch (error) { hostLog.warn("connections", "mcp_restart_copy_unwritten", error); }
  };
  const restoring = new Map<string, Promise<void>>();

  /**
   * Re-registers the tools of `owner`'s servers, and no one else's: an unchanged tool keeps its registration, so syncing twice
   * changes nothing. `check` (the call's final authority check) runs after the reads, before the directory or the copy is written.
   */
  async function sync(place: Place, runtimeId: string, library: AgentMcpLibrary, owner: AgentSkillOwner, check?: () => void): Promise<void> {
    if (!library.tools || !library.call || !library.live) return;
    const pluginId = owner.plugin_id, key = JSON.stringify([place.project_id, pluginId]);
    if (!lastSeen.has(key)) { const saved = readSeen()[key]; if (saved) lastSeen.set(key, saved.tools); }
    const live = await library.tools(owner);
    // A server still configured but not connected keeps what it offered, so references and the directory say why it cannot run.
    const servers = new Map((await library.list(owner)).map(server => [server.id, server]));
    const configured = new Set(servers.keys());
    const connected = new Set([...servers.values()].filter(server => server.health === "connected").map(server => server.id));
    const tools = [...live, ...(lastSeen.get(key) ?? []).filter(tool => configured.has(tool.server) && !connected.has(tool.server))];
    check?.();
    lastSeen.set(key, tools);
    remember(key, { ...place, plugin_id: pluginId, runtime_id: runtimeId, tools });
    const byServer = new Map<string, AgentMcpToolDescriptor[]>();
    for (const tool of tools) byServer.set(tool.server, [...byServer.get(tool.server) ?? [], tool]);
    const next: Array<{ server: string; label: string; entries: Array<{ definition: ActionDefinition; tool: AgentMcpToolDescriptor; contract: ReturnType<typeof mcpInputContract> }> }> = [];
    for (const [server, list] of byServer) {
      const entries = list.map(tool => { const contract = mcpInputContract(tool.input_schema); return { tool, contract, definition: {
        capability_id: `${EXTERNAL_MCP_CAPABILITY_PREFIX}${mcpIdPart(server)}.${mcpIdPart(tool.tool)}`,
        version: versions.versionOf(JSON.stringify([pluginId, server, tool.tool]), `${tool.configuration_version}:${tool.version}`), operation: "command" as const,
        action: { title: tool.tool, description: mcpToolDescription(tool.server_label, tool.description),
          // Every caller uses its own action authority; the source plugin does not lend its identity.
          kind: "operation" as const, scope: "project" as const, audiences: ["user", "workflow", "agent", "mcp", "plugin"] as const, permissions: [EXTERNAL_MCP_PERMISSION],
          scheduling: "concurrent" as const, execution: { cost: "unknown" as const },
          subject_kinds: [], input_schema: contract.schema, output_schema: OUTPUT, result_view: { summary: "服务已返回", text_pointer: "/text" } } } }; });
      next.push({ server, label: list[0]!.server_label, entries });
    }
    // The server's tools are registered one by one: a refresh that finds a tool unchanged leaves its registration alone, so a
    // call in flight on it is not withdrawn; a tool that changed or vanished is replaced or withdrawn.
    const set = registered.get(key) ?? createRegistrationSet();
    registered.set(key, set);
    set.retain(new Set(next.flatMap(({ entries }) => entries.map(entry => entry.definition.capability_id))));
    const registry = options.localHost.actionRegistry(place);
    for (const { server, label, entries } of next) for (const { definition, tool, contract } of entries) {
      set.ensure(definition.capability_id, JSON.stringify([label, definition, tool, servers.get(server)?.enabled, servers.get(server)?.version, owner, libraryId(library)]), () => registry.registerProvider({
        provider: { provider_id: projectMcpProviderId(owner, server), title: label, kind: "mcp", project_id: place.project_id },
        definitions: [definition],
        handlers: [{ capability_id: definition.capability_id, version: definition.version,
          availability: () => !contract.availability.available ? contract.availability
            : servers.get(server)?.enabled !== false && servers.get(server)?.version === tool.configuration_version ? { available: true }
            : { available: false, code: "actions.connection_unavailable", reason: `外部 MCP「${label}」已停用或配置已变化，请检查连接` },
          handle: async (caller, input) => {
            // Permission comes before any process/network start; the library reconnects and checks the exact live shape.
            await caller.beforeEffect();
            const call = (onBusinessDispatch?: () => void, onBusinessResult?: (outcome: "succeeded" | "failed" | "unknown") => void) =>
              library.call!(owner, tool, input as Record<string, unknown>, { signal: caller.signal, beforeDispatch: caller.beforeEffect, onBusinessDispatch, onBusinessResult });
            return options.homeDirectory ? observeConnectionCall(options.homeDirectory, server, { capability_id: definition.capability_id, version: definition.version, provider_id: projectMcpProviderId(owner, server) }, caller, async () => {
              const current = (await library.list(owner)).find(row => row.id === server);
              return current ? projectMcpRevision(options.homeDirectory!, current) : undefined;
            }, call) : call();
          } }],
      }));
    }
  }
  return {
    refresh(reference: Place, runtimeId: string, library: AgentMcpLibrary, owner: AgentSkillOwner) { return sync(reference, runtimeId, library, owner); },
    sync(runtime: MolisWorkProjectRuntime, runtimeId: string, library: AgentMcpLibrary, owner: AgentSkillOwner, check?: () => void) {
      return sync({ project_id: runtime.project_id, storage_key: runtime.store.path }, runtimeId, library, owner, check);
    },
    /**
     * After a restart (or a project reopening) the directory is empty until someone lists the servers again. The first
     * directory read brings back saved tools. It starts no process; an authorized invocation reconnects an enabled
     * configuration on demand, under the original project and the current caller’s authority.
     */
    async restore(reference: Place, libraryFor: (runtimeId: string) => Promise<AgentMcpLibrary | undefined>): Promise<void> {
      const pending = Object.entries(readSeen()).filter(([key, entry]) => entry.project_id === reference.project_id && entry.storage_key === reference.storage_key && !registered.has(key));
      await Promise.all(pending.map(([key, entry]) => {
        const run = restoring.get(key) ?? (async () => {
          try {
            const library = await libraryFor(entry.runtime_id);
            if (library && !registered.has(key)) await sync(entry, entry.runtime_id, library, { project_id: entry.project_id, plugin_id: entry.plugin_id });
          } catch (error) {
            // The directory stays as it is and the next list of the servers catches up; the failed restore is written.
            hostLog.warn("connections", "mcp_restore_failed", error, { runtime_id: entry.runtime_id });
          }
          finally { restoring.delete(key); }
        })();
        restoring.set(key, run);
        return run;
      }));
    },
    close() { for (const set of registered.values()) set.clear(); registered.clear(); },
  };
}
