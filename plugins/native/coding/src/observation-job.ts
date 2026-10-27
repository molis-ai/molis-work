import { agentHostCapabilities as agent, isTerminalAgentPhase, type AgentSessionStatus } from "@molis-ai/molis-work-contracts/services/agent-host";
import { memoryLearningEnqueueAction } from "@molis-ai/molis-work-contracts/services/memory";
import { codingActions, type CodingBeforeWrite } from "./route-entry.js";
import type { CodingSessionRecord } from "./store.js";
import { setTimeout } from "node:timers/promises";
import type { CodingActivation } from "./route-activation.js";
import { readCodingSessions } from "./session-observation.js";

/** Independently refresh derived directory facts, even when no page polls Coding. Queries never keep this job. */
export function startCodingObservation(a: CodingActivation): void {
  const { context, execution, projectId } = a, api = context.services?.actions;
  if (!api || !context.services?.background) return;
  const job = context.services.background.keep("observe", async control => {
    const learning = codingLearningObservation(a);
    const beforeWrite = Object.assign(control.beforeEffect, { assert_current: control.assert_authority_current, signal: control.signal });
    while (!control.signal.aborted) {
      await setTimeout(5_000, undefined, { signal: control.signal, ref: false });
      try {
        await readCodingSessions(a, execution, beforeWrite, true, learning(beforeWrite));
        for (const runtimeId of new Set(execution.sessions.list(projectId).filter(record => record.runtime_session_id && !execution.sessions.lifecycle.pending(projectId, record.session_id)).map(record => record.runtime_id))) {
          a.waits.wakeLoop(api, execution, runtimeId);
        }
      } catch {
        // Leave the last recorded facts intact; a later observation can recover without a page reopening.
        if (control.signal.aborted) return;
      }
    }
  });
  void job.done.catch(() => {}); // The platform ends it on stop or withdrawal; there is no business failure record.
}

/** Activation-local progress only. A restart rechecks every canonical reference; the Host queue deduplicates first. */
export function codingLearningObservation(a: CodingActivation) {
  const sessions = new Map<string, { marker: string; checked: Set<string>; pending: string[] }>();
  return (beforeWrite: CodingBeforeWrite) => {
    let remaining = 16;
    const actions = codingActions(a.context, beforeWrite);
    return async (record: CodingSessionRecord, status: AgentSessionStatus) => {
      if (!record.runtime_session_id || status.recovery || status.checkpoint_busy || !status.latest_run_id) return;
      try { a.context.requireGrant("memory:write"); } catch { return; } // Optional learning never disables ordinary conversation/observation.
      const key = JSON.stringify([record.runtime_id, record.runtime_session_id]);
      const state = sessions.get(key) ?? { marker: "", checked: new Set<string>(), pending: [] };
      sessions.set(key, state);
      const marker = JSON.stringify([status.latest_run_id, status.latest_phase]);
      if (marker !== state.marker) {
        const view = await actions.invoke(agent.readSession, [{ runtime_id: record.runtime_id, session_id: record.runtime_session_id }]);
        beforeWrite.assert_current();
        const pending = new Set(state.pending);
        for (const ref of view.runs) if (!state.checked.has(ref.run_id)
          && (ref.run_id !== status.latest_run_id || status.latest_phase && isTerminalAgentPhase(status.latest_phase))) pending.add(ref.run_id);
        state.pending = [...pending]; state.marker = marker;
      }
      while (remaining > 0 && state.pending.length) {
        remaining--;
        const run_id = state.pending[0]!;
        // Pass refs only; the Host verifies one canonical original before finding its existing queue key.
        await actions.invoke(memoryLearningEnqueueAction, { business_session_id: record.session_id, runtime_id: record.runtime_id,
          session_id: record.runtime_session_id, run_id });
        beforeWrite.assert_current();
        state.checked.add(run_id); state.pending.shift();
      }
    };
  };
}
