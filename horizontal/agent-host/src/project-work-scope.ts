import { agentErrors } from "./errors.js";
import type { AgentProjectWork, AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Whose work a plugin may see and give up: the sessions its installation started for this person. */
export interface ProjectWorkCaller { readonly plugin_id: string; readonly install_id: string; readonly actor_id: string }

/**
 * The project's work as one plugin caller may use it (R8 rules 3 and 4, coordinator 10-23): only rounds of the caller's own sessions.
 * Another plugin's work is neither read nor released by a plugin; giving up someone else's stuck round would be the person's or the
 * platform's action. Each session's owner is read once per call.
 */
export function projectWorkScope(adapter: AgentRuntimeAdapter, runtimeId: string, project: string, caller: ProjectWorkCaller) {
  const owners = new Map<string, Promise<boolean>>();
  const owns = (session_id: string) => {
    let found = owners.get(session_id);
    if (!found) {
      const session = { runtime_id: runtimeId, session_id };
      found = (adapter.readSessionStatus ? adapter.readSessionStatus(session) : adapter.readSession(session)).then(({ owner }) => owner?.project_id === project
        && owner.plugin_id === caller.plugin_id && owner.install_id === caller.install_id && owner.actor_id === caller.actor_id, () => false);
      owners.set(session_id, found);
    }
    return found;
  };
  const mine = async <T>(entries: readonly T[], work: (entry: T) => AgentProjectWork) => {
    const kept = await Promise.all(entries.map(entry => owns(work(entry).session_id)));
    return entries.filter((_, index) => kept[index]);
  };
  return {
    /** The caller's own work, and where it overlaps a round the caller is about to start in one of its own sessions. */
    async read(probe?: { session_id?: string; directory: string; text: string }) {
      if (probe?.session_id && !(await owns(probe.session_id))) throw agentErrors.session_unknown("当前项目找不到这条会话");
      const { items, overlaps } = await adapter.projectWork!.read(project, probe);
      return { items: await mine(items, item => item), overlaps: await mine(overlaps, overlap => overlap.work) };
    },
    /** Refuses, as not found, work that is not there or that a session of someone else's is doing. */
    async requireOwn(workId: string) {
      const { items } = await adapter.projectWork!.read(project);
      const work = items.find(item => item.work_id === workId);
      if (!work || !(await owns(work.session_id))) throw agentErrors.session_unknown("当前项目找不到这项工作");
    },
  };
}
