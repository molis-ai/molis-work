import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { memoryLearningActions, type MemoryLearningOwnedSource } from "@molis-ai/molis-work-contracts/services/memory";
import type { CodingActivation } from "./route-activation.js";
import type { CodingBeforeWrite } from "./route-entry.js";
import type { CodingExecution } from "./routes.js";

/** Coding alone owns business archival and the current mapping to a Runtime Session. The platform learns only from the Runtime that
 * ran the round, so the session id it names is matched to Coding's own record; Coding never spells a Runtime's id (RAC-453). */
export function codingMemorySources(execution: CodingExecution, projectId: string, beforeWrite: CodingBeforeWrite) {
  return (sources: readonly MemoryLearningOwnedSource[]): void => {
    beforeWrite.assert_current();
    for (const sessionId of new Set(sources.map(source => source.session_id))) {
      const record = execution.sessions.byRuntimeSession(projectId, sessionId);
      if (!record || record.archived || record.project_id !== projectId || record.runtime_session_id !== sessionId)
        throw new ActionError("actions.forbidden", "记忆来源会话已归档或不再属于当前项目");
    }
    beforeWrite.assert_current();
  };
}

/** This Action remains open until formation, promotion and ledger settlement have all returned. */
export function codingMemoryLearning(activation: CodingActivation): void {
  activation.route.action(memoryLearningActions.run, async (input, call) => {
    const check = codingMemorySources(call.execution, activation.projectId, call.beforeWrite);
    check([{ event_id: "", version: "1", session_id: input.session_id }]);
    return await call.api.invoke(memoryLearningActions.form, input, { assert_memory_sources_current: check,
      beforeEffect: call.beforeWrite, assert_authority_current: call.beforeWrite.assert_current, signal: call.beforeWrite.signal });
  });
}
