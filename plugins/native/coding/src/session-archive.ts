import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentSessionLifecycleActions as lifecycle, type AgentSessionDecision, type AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodingActivation } from "./route-activation.js";
import { codingActionControl, type CodingBeforeWrite } from "./route-entry.js";
import type { CodingExecution } from "./routes.js";
import type { CodingSessionRecord } from "./store.js";
import { codingError } from "./words.js";

export type CodingArchiveDecision = { mode: "local" } | { mode: "runtime"; binding: AgentSessionRef; decision: AgentSessionDecision };
const conflict = () => codingError(message => new ActionError("actions.conflict", message), "coding.server.archive-changed");
const idle = (record: CodingSessionRecord) => {
  if (!["idle", "done", "failed", "stopped", "cancelled"].includes(record.state)) {
    throw codingError(message => Object.assign(new Error(message), { code: "agent.session_busy" }), "coding.server.stop-before-archive");
  }
};
const notSubmitting = (a: CodingActivation, record: CodingSessionRecord) => {
  if (a.busy.has(record.session_id)) throw codingError(message => Object.assign(new Error(message), { code: "agent.session_busy" }), "coding.server.busy-archive");
};
const unchanged = (before: CodingSessionRecord, current: CodingSessionRecord) => {
  if (current.runtime_id !== before.runtime_id || current.runtime_session_id !== before.runtime_session_id
    || current.updated_at !== before.updated_at || current.archived !== before.archived || current.state !== before.state || current.title !== before.title) throw conflict();
};
const actions = (a: CodingActivation) => {
  if (!a.context.services?.actions) throw codingError(message => new ActionError("actions.unredeemed", message), "coding.server.no-actions");
  return a.context.services.actions;
};

/** Only observes the current business binding and the runtime owner's original operation; never repairs either. */
export async function previewCodingArchive(a: CodingActivation, execution: CodingExecution, record: CodingSessionRecord,
  beforeWrite: CodingBeforeWrite): Promise<{ archive_decision: CodingArchiveDecision }> {
  notSubmitting(a, record); idle(record);
  if (!record.runtime_session_id) return { archive_decision: { mode: "local" } };
  const binding = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
  const view = await actions(a).invoke(lifecycle.read, { session: binding }, codingActionControl(beforeWrite));
  beforeWrite.assert_current(); notSubmitting(a, record); unchanged(record, execution.sessions.get(a.projectId, record.session_id));
  if (view.session.runtime_id !== binding.runtime_id || view.session.session_id !== binding.session_id) throw conflict();
  const original = view.operation;
  if (original && !(original.action === "unarchive" && original.completed && view.state === "active"
    && view.version === original.decision.expected_version + 1 && !record.archived)) {
    if (original.action !== "archive" || original.decision.expected_state !== "active"
      || !(view.state === "archived" && view.version === original.decision.expected_version + 1
        || !original.completed && view.state === "active" && view.version === original.decision.expected_version)) throw conflict();
    return { archive_decision: { mode: "runtime", binding, decision: structuredClone(original.decision) } };
  }
  if (view.state !== "active" || view.version === null || record.archived) throw conflict();
  return { archive_decision: { mode: "runtime", binding, decision: { operation_id: crypto.randomUUID(), expected_version: view.version, expected_state: "active" } } };
}

/** SDK archive first, then Coding's guarded projection. A failure never undoes the runtime owner's accepted decision. */
export async function archiveCodingSession(a: CodingActivation, execution: CodingExecution, record: CodingSessionRecord,
  input: CodingArchiveDecision | undefined, beforeWrite: CodingBeforeWrite) {
  if (!input) throw conflict();
  notSubmitting(a, record); idle(record);
  if (input.mode === "local" ? record.runtime_session_id !== null
    : input.mode !== "runtime" || !record.runtime_session_id || input.binding.runtime_id !== record.runtime_id || input.binding.session_id !== record.runtime_session_id) throw conflict();
  a.busy.add(record.session_id);
  try {
    if (input.mode === "runtime") {
      // The submitted binding is a precondition only. The current business row selects the actual target.
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id! };
      const receipt = await actions(a).invoke(lifecycle.archive, { session, decision: input.decision }, codingActionControl(beforeWrite));
      beforeWrite.assert_current();
      if (receipt.scope !== "agent-host-session" || receipt.action !== "archive" || receipt.state !== "archived"
        || receipt.session.runtime_id !== session.runtime_id || receipt.session.session_id !== session.session_id
        || receipt.operation_id !== input.decision.operation_id || receipt.version !== input.decision.expected_version + 1) throw conflict();
    }
    return { session: await execution.sessions.archive(beforeWrite, a.projectId, record.session_id, new Date().toISOString(), current => {
      beforeWrite.assert_current(); unchanged(record, current); idle(current);
    }, { allowAlreadyArchived: true }) };
  } finally { a.busy.delete(record.session_id); }
}
