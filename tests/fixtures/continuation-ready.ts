import type { AgentCollaborationPort, AgentCollaborationSessionView, AgentContinuationStartRequest } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { runningProjectPlatform, type LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

const READY = ["eligible", "blocked", "needs-reconciliation"];

/**
 * The continuations of `project` that may go on (or are held for the person) within `timeoutMs`: what a test used to ask the
 * removed `awaitReady` for. The product hears of them from the runtime's start request (`serveStarts`); a test reads them back.
 */
export async function readyWithin(collaboration: Pick<AgentCollaborationPort, "read">, project: string, timeoutMs: number, exclude: readonly string[] = []): Promise<AgentCollaborationSessionView[]> {
  for (const deadline = Date.now() + timeoutMs; ;) {
    const found = (await collaboration.read(project)).filter(view => view.continuation && READY.includes(view.continuation.state) && !exclude.includes(view.continuation.request_key));
    if (found.length || Date.now() >= deadline) return found;
    await new Promise(resolve => setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now()))));
  }
}

/**
 * A project's continuation port, as the Home's starter serves it (apps/local-host/src/agent-continuation-starts.ts), for a test
 * whose task graph is a table: `tell` is what the runtime's start request does for a plugin's session that may go on now — the
 * Host tells the installation that owns it (`host.agent.continuation.ready@1`). False when that plugin is not running.
 */
export function continuationEvents(store: LocalProjectDatabase, projectId: string, pluginId = "io.molis.work.coding") {
  const listeners = new Set<(request: AgentContinuationStartRequest) => void>();
  return {
    observeContinuations: (listener: (request: AgentContinuationStartRequest) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async tell(view: Pick<AgentCollaborationSessionView, "session_id" | "wait" | "continuation">, runtimeId = "prologue"): Promise<boolean> {
      const install_id = (await runningProjectPlatform(store, projectId))?.supervisor.state(pluginId)?.install_id;
      if (!install_id || !view.wait || !view.continuation) return false;
      const request: AgentContinuationStartRequest = { runtime_id: runtimeId, project_id: projectId, session_id: view.session_id, owner: { plugin_id: pluginId, install_id },
        request_key: view.continuation.request_key, wait_id: view.wait.wait_id, graph_id: view.continuation.graph_id, node_id: view.continuation.node_id };
      for (const listener of [...listeners]) listener(request);
      return listeners.size > 0;
    },
  };
}
