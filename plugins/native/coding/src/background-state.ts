import type { PluginCapabilityClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodingSessionRecord, CodingSessionStore } from "./store.js";

/** A failed observation never means the last observed commands stopped. */
export async function codingBackgroundState(api: PluginCapabilityClient, records: CodingSessionRecord[], sessions: CodingSessionStore, projectId: string): Promise<Set<string>> {
  const unreadable = new Set<string>();
  for (const runtimeId of new Set(records.filter(record => record.runtime_session_id).map(record => record.runtime_id))) {
    let tasks;
    try { tasks = await api.invoke(agent.readBackground, [runtimeId]); }
    catch { unreadable.add(runtimeId); continue; }
    for (const record of records.filter(record => record.runtime_id === runtimeId && record.runtime_session_id)) {
      const running = tasks.filter(task => task.session_id === record.runtime_session_id && task.state === "running")
        .map(({ task_id, summary, started_at_ms }) => ({ task_id, summary, started_at_ms }));
      const now = running.length ? running : null;
      if (JSON.stringify(now) !== JSON.stringify(sessions.backgroundOf(projectId, record.session_id))) sessions.setBackground(projectId, record.session_id, now);
    }
  }
  return unreadable;
}
