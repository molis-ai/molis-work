import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities as agent, isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodingActivation } from "./route-activation.js";
import type { CodingExecution } from "./routes.js";
import type { CodingBeforeWrite } from "./route-entry.js";
import { codingActions } from "./route-entry.js";
import type { CodingSessionRecord } from "./store.js";
import { codingStoreErrors } from "./store-errors.js";
import { codingError } from "./words.js";

const errors = defineErrorCodes("coding", { lifecycle_conflict: "conflict", lifecycle_incomplete: "conflict" });

/** One Coding owner command: keep its original mapping and busy guard through both existing writers. */
export async function changeCodingSessionLifecycle(a: CodingActivation, execution: CodingExecution, record: CodingSessionRecord,
  archived: boolean, beforeWrite: CodingBeforeWrite): Promise<CodingSessionRecord> {
  const { projectId, busy } = a, api = codingActions(a.context, beforeWrite);
  let expected = record;
  const current = () => {
    beforeWrite.assert_current();
    const now = execution.sessions.get(projectId, record.session_id);
    if (busy.has(record.session_id) || now.runtime_id !== expected.runtime_id || now.runtime_session_id !== expected.runtime_session_id
      || now.updated_at !== expected.updated_at || now.archived !== expected.archived || now.state !== expected.state) {
      throw codingError(errors.lifecycle_conflict, "coding.session.lifecycle-conflict");
    }
  };
  current();
  const session = record.runtime_session_id ? { runtime_id: record.runtime_id, session_id: record.runtime_session_id } : undefined;
  let executionArchived: boolean | undefined;
  if (session) {
    const view = await api.invoke(agent.readSession, [session]);
    if (view.checkpoint_busy || view.recovery || view.latest_run && !isTerminalAgentPhase(view.latest_run.phase)) {
      throw codingError(errors.lifecycle_conflict, "coding.server.stop-before-archive");
    }
    executionArchived = (await api.invoke(agent.readSessionLifecycle, [session])).state === "archived";
    current();
  }
  // Both halves already there (or no execution session to change): a repeat is refused, as the store refuses it, never a silent success.
  // Only a change left half done gets through, so a later request can finish the other half.
  if (record.archived === archived && (!session || executionArchived === archived)) throw codingStoreErrors.session_unknown(archived ? "会话已归档" : "会话没有归档");
  try {
    const control = { beforeEffect: async () => { await beforeWrite(); current(); }, assert_authority_current: current };
    if (archived && session) await api.invoke(agent.archiveSession, [session], control);
    current();
    // A later request finishing the other half finds the business record already there; the store refuses a repeat write.
    if (expected.archived !== archived) expected = await execution.sessions.archive(beforeWrite, projectId, record.session_id, new Date().toISOString(), current, archived);
    a.context.services?.ui.invalidate();
    if (!archived && session) await api.invoke(agent.unarchiveSession, [session], control);
    current();
    return expected;
  } catch (error) {
    // Keep both durable facts. A later explicit request may finish either action; there is no inverse write here.
    if (error instanceof ActionError && ["actions.cancelled", "actions.forbidden", "plugin.grant_denied"].includes(error.code)) throw error;
    const business = execution.sessions.get(projectId, record.session_id).archived;
    const sdk = session ? await api.invoke(agent.readSessionLifecycle, [session]).catch(() => null) : null;
    if (session && (sdk === null || business !== (sdk.state === "archived"))) {
      throw codingError(message => errors.lifecycle_incomplete(message, { lifecycle: { business: business ? "archived" : "active", execution: sdk?.state ?? null } }),
        archived ? "coding.session.archive-incomplete" : "coding.session.restore-incomplete");
    }
    throw error;
  }
}
