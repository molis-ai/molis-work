import { defineErrorCodes, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMcpLibrary, AgentSkillOwner, AgentMcpServerView } from "@molis-ai/molis-work-contracts/services/agent-host";

export interface ProjectMcpManagementPort {
  library(): Promise<AgentMcpLibrary | undefined>;
  refresh(owner: AgentSkillOwner): Promise<void>;
}
export const noProjectMcp: ProjectMcpManagementPort = { library: async () => undefined, refresh: async () => { throw new Error("项目 MCP 运行服务未装配"); } };
const errors = defineErrorCodes("connector.project_mcp", { unknown: "not_found", changed: "conflict" });
/** The Home's inventory contains provenance, never argv, environment, working-directory content or credentials. */
const view = (owner: AgentSkillOwner, server: AgentMcpServerView) => ({
  connection_id: server.id, service_id: "mcp-bearer", display_name: server.label, source: "project_mcp",
  project_id: owner.project_id, source_plugin_id: owner.plugin_id, revision: String(server.version), enabled: server.enabled,
  transport: server.transport, state: server.health, credential: server.credential, ...(server.endpoint ? { endpoint: server.endpoint } : {}),
  tools: server.tools.map(tool => ({ tool: tool.tool, version: tool.version })),
});
export async function listProjectMcpConnections(port: ProjectMcpManagementPort) {
  const library = await port.library();
  return (await library?.catalog?.() ?? []).map(entry => view(entry.owner, entry.server));
}
export async function manageProjectMcp(port: ProjectMcpManagementPort, caller: Parameters<ActionHandlerBinding["handle"]>[0],
  input: { connection_id: string; action: "check" | "enable" | "disable" | "remove"; expected_revision?: string }) {
  const library = await port.library();
  const entry = (await library?.catalog?.() ?? []).find(entry => entry.server.id === input.connection_id);
  if (!library || !entry) throw errors.unknown("没有这条项目 MCP 连接");
  const { owner, server } = entry;
  if (input.expected_revision !== undefined && input.expected_revision !== String(server.version)) throw errors.changed("连接已变化，请重新读取后操作");
  await caller.beforeEffect();
  if (input.action === "remove") await library.control(owner, server.id, "remove", { expected_version: server.version, signal: caller.signal, beforeDispatch: caller.beforeEffect });
  else if (input.action === "check") {
    await library.control(owner, server.id, server.health === "connected" ? "refresh" : "connect", { expected_version: server.version, signal: caller.signal, beforeDispatch: caller.beforeEffect });
  } else await library.save(owner, {
    id: server.id, expected_version: server.version, label: server.label, enabled: input.action === "enable", timeout_ms: server.timeout_ms,
    transport: server.transport, ...(server.transport === "stdio" ? { directory: server.directory, executable: server.executable, argv: server.argv }
      : { endpoint: server.endpoint, auth: { kind: server.credential === "present" ? "keep-existing" : "none" } }),
  });
  let verification: { available: boolean; reason?: string } | undefined;
  if (input.action === "enable") {
    try { await library.control(owner, server.id, "connect", { expected_version: server.version + 1, signal: caller.signal, beforeDispatch: caller.beforeEffect }); verification = { available: true }; }
    catch { verification = { available: false, reason: "连接已启用，但检查失败；请查看连接状态后重试" }; }
  }
  await port.refresh(owner);
  const current = (await library.list(owner)).find(row => row.id === server.id);
  return { connection_id: server.id, connection: current ? view(owner, current) : null, removed: !current, ...(verification ? { verification } : {}), service_authorization_revoked: false };
}
