import type { ActionView, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMcpServerView, AgentMcpToolRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantWorkConnection, AssistantWorkGit, AssistantWorkSurroundings } from "@molis-ai/molis-work-contracts/services/assistant";
import { workspaceReadActions, type WorkspaceGitResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { connectorManagementActions, type ManagedConnectorView } from "../connector-management-actions.js";
import { WorkExecutor } from "./assistant-executor.js";
import { agentActions } from "./assistant-directory.js";
import type { AssistantServicePorts } from "./assistant-service.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";

const RUNTIME = "prologue";
/** One answer serves the panel's redraws for this long, while the work stays at the same revision. */
const HOLD_MS = 15_000;
const HELD_WORKS = 32;
const UNAVAILABLE_SHOWN = 30;

/** Only the reads these groups need, as the person: the work's own discovery, its project's actions, the Home's, the project's name. */
export interface SurroundingsPorts extends Pick<AssistantServicePorts, "personActions" | "homeActions" | "projectTitle"> {
  authority(work: StoredWork): Promise<{ actions?(runtimeId: string): Promise<{ discover(): Promise<readonly ActionView[]> }> }>;
}

/**
 * Where a work runs and what it can reach and call (specs/visual-ui-experience VUX-08/09; the user's 2026-10-20 decision ②):
 * each part is read from its owner's own public read, as the person, when the panel asks, and kept nowhere.
 * - 工作环境: the work's scope; for a work a plugin carries, the session's directory (the executor's `state` and `session.read`) and
 *   that directory's repository (`projects.workspace.git.inspect`, a summary). A remote's address is shown as owner/name only.
 * - 连接: the person's connections (`connectors.connections.read`), each by its own status.
 * - 工具: what the work's executor can call now, the same discovery its rounds use, split as a round's directory splits it;
 *   for an executor plugin, the MCP tools chosen for its session (`session.read`), each live only while its server is on, connected
 *   and still offers it (`state`), the way the plugin's own run checks them.
 * A part that cannot be read says why; the others still answer.
 */
export function assistantSurroundings(store: AssistantStore, ports: SurroundingsPorts, actorId: string) {
  const held = new Map<string, { at: number; revision: number; value: Promise<AssistantWorkSurroundings> }>();
  return (workId: string): Promise<AssistantWorkSurroundings> => {
    const work = store.get(actorId, workId), hit = held.get(work.work_id), now = Date.now();
    if (hit && now - hit.at < HOLD_MS && hit.revision === work.revision) return hit.value;
    const value = read(work, ports);
    held.delete(work.work_id); held.set(work.work_id, { at: now, revision: work.revision, value });
    if (held.size > HELD_WORKS) held.delete(held.keys().next().value!);
    value.catch(() => held.delete(work.work_id));
    return value;
  };
}

const why = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim().slice(0, 200);

type ExecutorSetup = Awaited<ReturnType<WorkExecutor["setup"]>> & { actions: BoundActionClient };

async function read(work: StoredWork, ports: SurroundingsPorts): Promise<AssistantWorkSurroundings> {
  // An executor work's directory and its tools come from the same two reads of the executor, asked once for both groups.
  const setup = work.executor.kind === "plugin" && work.executor.session_id && ports.personActions ? executorSetup(work.executor.plugin_id, work.executor.session_id, ports.personActions(work)) : null;
  setup?.catch(() => undefined);
  const [environment, connections, tools] = await Promise.all([environmentOf(work, ports, setup), connectionsOf(ports), toolsOf(work, ports, setup)]);
  return { environment, ...connections, tools, read_at: new Date().toISOString() };
}

async function executorSetup(pluginId: string, sessionId: string, person: Promise<BoundActionClient>): Promise<ExecutorSetup> {
  const actions = await person;
  return { ...await (await WorkExecutor.bind(actions, pluginId)).setup(sessionId), actions };
}

async function environmentOf(work: StoredWork, ports: SurroundingsPorts, setup: Promise<ExecutorSetup> | null): Promise<AssistantWorkSurroundings["environment"]> {
  const scope: AssistantWorkSurroundings["environment"]["scope"] = work.scope.kind === "project"
    ? { kind: "project", project_id: work.scope.project_id, title: work.scope_title ?? await ports.projectTitle?.(work.scope.project_id).catch(() => null) ?? null } : { kind: "personal" };
  if (!setup) return { scope };
  try {
    const { workspace, actions } = await setup;
    return { scope, executor: { workspace: workspace && { name: workspace.name, path: workspace.path }, git: workspace ? await gitOf(actions, workspace.workspace_id) : null } };
  } catch (error) { return { scope, executor: { workspace: null, git: null, problem: why(error) } }; }
}

const available = (views: readonly ActionView[], reference: { capability_id: string; version: number }, provider?: string) =>
  views.find(view => view.capability_id === reference.capability_id && view.version === reference.version && (!provider || view.provider.provider_id === provider) && view.availability.available);

/** owner/name of a remote's address, never its credentials or a query after it: https://user:token@host/owner/name.git and git@host:owner/name both read owner/name. */
export const repositoryName = (url: string) => url.replace(/[?#].*$/, "").replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*\/?/i, "").replace(/^[^@/]+@[^:/]+:/, "").replace(/\.git\/?$/, "").split("/").filter(Boolean).slice(-2).join("/") || null;

async function gitOf(actions: BoundActionClient, workspaceId: string): Promise<AssistantWorkGit | null> {
  const view = available(await actions.discover(), workspaceReadActions.git);
  if (!view) return null;
  const result = await actions.invoke({ capability_id: view.capability_id, version: view.version, operation: view.operation, action: view.action, provider_id: view.provider.provider_id },
    { workspace_id: workspaceId, kind: "summary" }) as WorkspaceGitResult;
  if (result.outcome !== "summary") return null;
  const remote = result.remotes.find(one => one.name === "origin") ?? result.remotes[0];
  return { repository: remote ? repositoryName(remote.url) : null, branch: result.branch, ahead: result.ahead, behind: result.behind,
    changed: result.staged.length + result.unstaged, conflicted: result.conflicted.length };
}

const connectionState = (connection: ManagedConnectorView): AssistantWorkConnection["state"] => {
  const { configuration, connectivity, authorization } = connection.status;
  if (!connection.enabled || !configuration.enabled) return "off";
  if (configuration.state === "incomplete") return "incomplete";
  if (authorization.service.state === "required") return "needs-authorization";
  return connectivity.state === "unknown" ? "unchecked" : connectivity.state;
};

async function connectionsOf(ports: SurroundingsPorts): Promise<Pick<AssistantWorkSurroundings, "connections" | "connections_problem">> {
  if (!ports.homeActions) return { connections: [] };
  try {
    const actions = await ports.homeActions(), view = available(await actions.discover(), connectorManagementActions.list, "system.connectors");
    if (!view) return { connections: [] };
    const result = await actions.invoke({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, {}) as { connections: ManagedConnectorView[] };
    return { connections: result.connections.map(connection => ({ connection_id: connection.connection_id, title: connection.display_name, account: "account_label" in connection ? connection.account_label ?? null : null,
      state: connectionState(connection), tools: connection.status.capabilities.state })) };
  } catch (error) { return { connections: [], connections_problem: why(error) }; }
}

/**
 * Why a chosen MCP tool cannot be called now, or "" when it can: its server is gone, off, not connected, or no longer offers
 * it. In Chinese, the page translates it: the Host holds a read for a few seconds without a language.
 */
function mcpBlocked(ref: AgentMcpToolRef, servers: readonly AgentMcpServerView[]) {
  const server = servers.find(one => one.id === ref.server);
  if (!server) return "这个服务的配置已移除";
  if (!server.enabled) return "服务已关闭";
  if (server.health === "disconnected") return "服务未连接";
  if (server.health === "unavailable") return "服务连接不可用";
  if (server.health === "not-reattached") return "服务需要重新连接";
  return server.tools.some(tool => tool.tool === ref.tool && (!ref.version || tool.version === ref.version)) ? "" : "服务里已没有这个工具";
}

async function executorTools(setup: Promise<ExecutorSetup>): Promise<AssistantWorkSurroundings["tools"]> {
  try {
    const { mcp } = await setup, counts = new Map<string, number>(), unavailable: AssistantWorkSurroundings["tools"]["unavailable"] = [];
    for (const ref of mcp.chosen) {
      const provider = mcp.servers.find(one => one.id === ref.server)?.label ?? ref.server_label ?? ref.server, reason = mcpBlocked(ref, mcp.servers);
      if (reason) unavailable.push({ title: ref.tool, provider, reason });
      else counts.set(provider, (counts.get(provider) ?? 0) + 1);
    }
    return { executor: "plugin", callable: [...counts].map(([provider, count]) => ({ provider, count })), unavailable: unavailable.slice(0, UNAVAILABLE_SHOWN) };
  } catch (error) { return { executor: "plugin", callable: [], unavailable: [], problem: why(error) }; }
}

async function toolsOf(work: StoredWork, ports: SurroundingsPorts, setup: Promise<ExecutorSetup> | null): Promise<AssistantWorkSurroundings["tools"]> {
  if (work.executor.kind === "plugin") return setup ? executorTools(setup) : { executor: "plugin", callable: [], unavailable: [] };
  try {
    const authority = await ports.authority(work);
    const { offered, unavailable } = agentActions(authority.actions ? await (await authority.actions(RUNTIME)).discover() : [], Number.MAX_SAFE_INTEGER);
    const counts = new Map<string, number>();
    for (const view of offered) counts.set(view.provider.title, (counts.get(view.provider.title) ?? 0) + 1);
    return { executor: "assistant", callable: [...counts].map(([provider, count]) => ({ provider, count })),
      unavailable: unavailable.slice(0, UNAVAILABLE_SHOWN).map(view => ({ title: view.action.title, provider: view.provider.title, reason: view.availability.available ? "" : view.availability.reason })) };
  } catch (error) { return { executor: "assistant", callable: [], unavailable: [], problem: why(error) }; }
}
