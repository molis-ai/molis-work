import type { AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { executorProviders, type WorkExecutor } from "./assistant-executor.js";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { identity } from "./assistant-relations.js";
import { ownerOf } from "./assistant-round-start.js";
import { assistantErrors } from "./assistant-errors.js";

/** Original Session relations survive handovers. The public mapping locates a Session; its Host owner authorizes the read. */
export async function* subtaskInputSessions(work: StoredWork, ports: {
  store: AssistantStore; actorId: string; adapter: AgentRuntimeAdapter | Promise<AgentRuntimeAdapter>;
  personActions?: (work: StoredWork) => Promise<{ discover(): Promise<readonly ActionView[]> }>;
  executor(work: StoredWork, pluginId?: string): Promise<WorkExecutor>;
}): AsyncGenerator<string> {
  const adapter = await ports.adapter;
  const sessions = new Set<string>();
  const accept = async (sessionId: string, pluginId: string, installId: string | undefined) => {
    const owner = (await adapter.sessionLifecycle?.read({ runtime_id: "prologue", session_id: sessionId }))?.owner;
    if (!installId || !owner || owner.actor_id !== ports.actorId || owner.project_id !== ownerOf(work)
      || owner.plugin_id !== pluginId || owner.install_id !== installId) throw assistantErrors.scope("原输入会话不属于这项工作的当前授权主人");
    sessions.add(sessionId);
  };
  if (work.session_id) { await accept(work.session_id, ASSISTANT_PLUGIN_ID, ASSISTANT_INSTALL_ID); yield work.session_id; }
  const links = ports.store.relations.forWork(identity(work)).filter(row => row.relation === "session");
  const providers = ports.personActions && work.project_ref ? executorProviders(await (await ports.personActions(work)).discover()) : [];
  const candidates = providers.flatMap(provider => links.filter(row => row.object.kind === provider.session_kind).map(row => ({ pluginId: provider.plugin_id, sessionId: row.object.id })));
  if (work.executor.kind === "plugin" && work.executor.session_id) candidates.push({ pluginId: work.executor.plugin_id, sessionId: work.executor.session_id });
  const checked = new Set<string>();
  for (const candidate of candidates) {
    const key = JSON.stringify(candidate); if (checked.has(key)) continue; checked.add(key);
    // An unavailable historical installation cannot hide an original input held by another still-authorized owner.
    let executor: WorkExecutor, read: Awaited<ReturnType<WorkExecutor["read"]>>;
    try { executor = await ports.executor(work, candidate.pluginId); read = await executor.read(candidate.sessionId, 1); }
    catch { continue; }
    if (read.runtime_session_id && !sessions.has(read.runtime_session_id)) {
      await accept(read.runtime_session_id, candidate.pluginId, executor.provider.roles["session.read"].provider.plugin_install_id);
      yield read.runtime_session_id;
    }
  }
}
