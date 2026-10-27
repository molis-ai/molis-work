import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentSessionLifecycleActions as lifecycle } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodingActivation } from "./route-activation.js";
import { codingActionControl, type CodingBeforeWrite } from "./route-entry.js";
import type { CodingExecution } from "./routes.js";
import type { CodingSessionRecord } from "./store.js";
import { sameLifecycleOriginal as same, type CodingLifecycleDecision, type CodingLifecycleObserved, type CodingLifecycleRecord } from "./session-lifecycle.js";
import { codingError } from "./words.js";
import { codingSubject } from "./subject.js";

export type CodingArchiveDecision = CodingLifecycleDecision;
const conflict = () => codingError(message => new ActionError("actions.conflict", message), "coding.server.archive-changed");
const observed = ({ session_id, title, state, archived, goal_id, updated_at }: CodingSessionRecord): CodingLifecycleObserved =>
  ({ session_id, title, state, archived, goal_id, updated_at });
const operation = (request: CodingLifecycleDecision) => request.mode === "runtime" ? request.decision.operation_id : request.operation_id;
const idle = (record: CodingSessionRecord) => {
  if (!["idle", "done", "failed", "stopped", "cancelled"].includes(record.state)) {
    throw codingError(message => Object.assign(new Error(message), { code: "agent.session_busy" }), "coding.server.stop-before-archive");
  }
};
const notSubmitting = (a: CodingActivation, record: CodingSessionRecord) => {
  if (a.busy.has(record.session_id)) throw codingError(message => Object.assign(new Error(message), { code: "agent.session_busy" }), "coding.server.busy-archive");
};
const matches = (request: CodingLifecycleDecision, current: CodingSessionRecord, saved?: CodingLifecycleRecord) => {
  const expected = saved?.completed ? { ...request.observed, archived: saved.archived,
    updated_at: saved.archived ? saved.at : request.observed.updated_at } : request.observed;
  if (!same(observed(current), expected) || (request.mode === "local"
    ? current.runtime_session_id !== null || current.runtime_id !== request.runtime_id
    : current.runtime_id !== request.binding.runtime_id || current.runtime_session_id !== request.binding.session_id)) throw conflict();
};
const actions = (a: CodingActivation) => {
  if (!a.context.services?.actions) throw codingError(message => new ActionError("actions.unredeemed", message), "coding.server.no-actions");
  return a.context.services.actions;
};

const runtimeCurrent = async (a: CodingActivation, input: CodingLifecycleDecision, beforeWrite: CodingBeforeWrite, archived: boolean) => {
  if (input.mode === "local") return;
  const view = await actions(a).invoke(lifecycle.read, { session: input.binding }, codingActionControl(beforeWrite));
  beforeWrite.assert_current();
  if (input.mode === "business") {
    if (archived || !same(view.session, input.binding) || view.state !== "active" || view.version !== input.expected_version
      || view.operation && !view.operation.completed) throw conflict();
    return;
  }
  if (!same(view.session, input.binding) || !(view.state === input.decision.expected_state && view.version === input.decision.expected_version
    && (!view.operation || view.operation.completed || same(view.operation.decision, input.decision))
    || view.state === (archived ? "archived" : "active") && view.version === input.decision.expected_version + 1
    && view.operation?.action === (archived ? "archive" : "unarchive") && same(view.operation.decision, input.decision))) throw conflict();
};

/** Pure preview: a durable pending decision is returned unchanged; reads never finish either owner's write. */
async function preview(a: CodingActivation, execution: CodingExecution, record: CodingSessionRecord, beforeWrite: CodingBeforeWrite,
  archived: boolean): Promise<CodingLifecycleDecision> {
  notSubmitting(a, record); idle(record);
  const saved = execution.sessions.lifecycle.current(a.projectId, record.session_id);
  if (saved && saved.archived === archived) {
    matches(saved.request, record, saved);
    await runtimeCurrent(a, saved.request, beforeWrite, archived);
    notSubmitting(a, record);
    if (!same(record, execution.sessions.get(a.projectId, record.session_id))) throw conflict();
    return structuredClone(saved.request);
  }
  if (saved && !saved.completed || record.archived === archived) throw conflict();
  const common = { observed: observed(record), previous_operation_id: saved ? operation(saved.request) : null };
  if (!record.runtime_session_id) return { ...common, mode: "local", runtime_id: record.runtime_id, operation_id: crypto.randomUUID() };
  const binding = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
  const view = await actions(a).invoke(lifecycle.read, { session: binding }, codingActionControl(beforeWrite));
  beforeWrite.assert_current(); notSubmitting(a, record);
  if (!same(record, execution.sessions.get(a.projectId, record.session_id))
    || !same(saved, execution.sessions.lifecycle.current(a.projectId, record.session_id))
    || view.session.runtime_id !== binding.runtime_id || view.session.session_id !== binding.session_id) throw conflict();
  const action = archived ? "archive" : "unarchive", expected_state = archived ? "active" : "archived";
  const original = view.operation;
  if (!archived && !saved && view.state === "active" && view.version !== null && (!original || original.completed)) {
    return { ...common, mode: "business", binding, operation_id: crypto.randomUUID(), expected_state: "active", expected_version: view.version };
  }
  if (original?.action === action) {
    if (original.decision.expected_state !== expected_state || !(view.state === (archived ? "archived" : "active")
      && view.version === original.decision.expected_version + 1 || !original.completed && view.state === expected_state
      && view.version === original.decision.expected_version)) throw conflict();
    return { ...common, mode: "runtime", binding, decision: structuredClone(original.decision) };
  }
  if (original && !original.completed || view.state !== expected_state || view.version === null) throw conflict();
  return { ...common, mode: "runtime", binding, decision: { operation_id: crypto.randomUUID(), expected_version: view.version, expected_state } };
}

export async function previewCodingArchive(a: CodingActivation, execution: CodingExecution, record: CodingSessionRecord, beforeWrite: CodingBeforeWrite) {
  return { archive_decision: await preview(a, execution, record, beforeWrite, true) };
}
export async function previewCodingUnarchive(a: CodingActivation, execution: CodingExecution, record: CodingSessionRecord, beforeWrite: CodingBeforeWrite) {
  return { unarchive_decision: await preview(a, execution, record, beforeWrite, false) };
}

/** Coding prepares the fixed original, the runtime finishes it, then availability and completion commit together. */
async function apply(a: CodingActivation, execution: CodingExecution, record: CodingSessionRecord,
  input: CodingLifecycleDecision | undefined, beforeWrite: CodingBeforeWrite, archived: boolean) {
  if (!input) throw conflict();
  notSubmitting(a, record); idle(record); beforeWrite.assert_current();
  const store = execution.sessions.lifecycle;
  let saved = store.current(a.projectId, record.session_id);
  const continuing = saved && operation(saved.request) === operation(input);
  if (continuing) {
    if (saved!.archived !== archived || !same(saved!.request, input)) throw conflict();
    matches(input, record, saved!);
  } else {
    if (input.mode === "business" && (archived || saved) || saved && !saved.completed || input.previous_operation_id !== (saved ? operation(saved.request) : null)
      || input.observed.archived === archived) throw conflict();
    matches(input, record);
  }
  a.busy.add(record.session_id);
  try {
    await runtimeCurrent(a, input, beforeWrite, archived);
    if (!continuing) {
      const source = archived ? await codingSubject(a, execution, record, beforeWrite) : null;
      if (!archived && saved && (!saved.completed || !saved.archived)) throw conflict();
      const content_revision = source ? source.context.revision : saved?.content_revision ?? null;
      const next: CodingLifecycleRecord = { archived, request: structuredClone(input), at: new Date().toISOString(), completed: false, content_revision };
      const prepare = input.mode === "business" ? Object.assign(async () => {
        await beforeWrite(); await runtimeCurrent(a, input, beforeWrite, archived);
      }, { assert_current: beforeWrite.assert_current }) : beforeWrite;
      await store.prepare(prepare, a.projectId, record.session_id, saved, next, current => {
        beforeWrite.assert_current(); source?.assertCurrent(); matches(input, current); idle(current);
      });
      saved = next;
    }
    if (input.mode === "runtime") {
      if (input.decision.expected_state !== (archived ? "active" : "archived")) throw conflict();
      // The current business row selects the actual target; the submitted binding is only a precondition.
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id! };
      const receipt = await actions(a).invoke(archived ? lifecycle.archive : lifecycle.unarchive,
        { session, decision: input.decision }, codingActionControl(beforeWrite));
      beforeWrite.assert_current();
      if (receipt.scope !== "agent-host-session" || receipt.action !== (archived ? "archive" : "unarchive")
        || receipt.state !== (archived ? "archived" : "active") || !same(receipt.session, session)
        || receipt.operation_id !== input.decision.operation_id || receipt.version !== input.decision.expected_version + 1) throw conflict();
    }
    const complete = input.mode === "business" ? Object.assign(async () => {
      await beforeWrite(); await runtimeCurrent(a, input, beforeWrite, archived);
    }, { assert_current: beforeWrite.assert_current }) : beforeWrite;
    return { session: await store.complete(complete, a.projectId, record.session_id, saved!, current => {
      beforeWrite.assert_current(); matches(input, current, saved!); idle(current);
    }) };
  } finally { a.busy.delete(record.session_id); }
}
export const archiveCodingSession = (a: CodingActivation, execution: CodingExecution, record: CodingSessionRecord,
  input: CodingLifecycleDecision | undefined, beforeWrite: CodingBeforeWrite) => apply(a, execution, record, input, beforeWrite, true);
export const unarchiveCodingSession = (a: CodingActivation, execution: CodingExecution, record: CodingSessionRecord,
  input: CodingLifecycleDecision | undefined, beforeWrite: CodingBeforeWrite) => apply(a, execution, record, input, beforeWrite, false);
