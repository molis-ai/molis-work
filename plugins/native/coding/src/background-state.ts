import type { PluginActionClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodingBeforeEffect, CodingSessionRecord, CodingSessionStore } from "./store.js";

/** A failed observation never means the last observed commands stopped. */
export async function codingBackgroundState(actions: PluginActionClient, records: CodingSessionRecord[], sessions: CodingSessionStore, projectId: string, beforeEffect?: CodingBeforeEffect): Promise<Set<string>> {
  const unreadable = new Set<string>();
  for (const runtimeId of new Set(records.filter(record => record.runtime_session_id).map(record => record.runtime_id))) {
    let tasks;
    try { tasks = await actions.invoke(agent.readBackground, [runtimeId]); }
    catch { unreadable.add(runtimeId); continue; }
    for (const record of records.filter(record => record.runtime_id === runtimeId && record.runtime_session_id)) {
      const running = tasks.filter(task => task.session_id === record.runtime_session_id && task.state === "running")
        .map(({ task_id, summary, started_at_ms }) => ({ task_id, summary, started_at_ms }));
      const now = running.length ? running : null;
      if (beforeEffect && JSON.stringify(now) !== JSON.stringify(sessions.backgroundOf(projectId, record.session_id))) {
        await sessions.setBackground(async () => {
          await beforeEffect();
          const current = sessions.get(projectId, record.session_id);
          if (current.runtime_session_id !== record.runtime_session_id || current.updated_at !== record.updated_at) throw new Error("Session changed during observation");
        }, projectId, record.session_id, now);
      }
    }
  }
  return unreadable;
}
