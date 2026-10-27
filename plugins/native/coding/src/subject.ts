import { ActionError, searchRevisionOf, subjectContext, type ActionSubjectContext, type ActionSubjectRetention } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodingActivation } from "./route-activation.js";
import { codingActions, type CodingBeforeWrite } from "./route-entry.js";
import type { CodingExecution } from "./routes.js";
import type { CodingSessionRecord } from "./store.js";
import { sameLifecycleOriginal } from "./session-lifecycle.js";
import { codingStoreErrors } from "./store-errors.js";

const changed = () => new ActionError("actions.conflict", "会话内容或生命周期已变化，请重新读取");

/** The ordinary source and archive freeze use exactly the same bounded Run selection and complete source facts. */
export async function codingSubject(a: CodingActivation, execution: CodingExecution, record: CodingSessionRecord, beforeWrite: CodingBeforeWrite):
  Promise<{ context: ActionSubjectContext; assertCurrent(): void }> {
  if (record.archived) throw codingStoreErrors.session_unknown("会话已归档；请从本人归档历史入口查看");
  execution.sessions.lifecycle.assertWritable(a.projectId, record.session_id);
  const { context } = a;
  const configurationKey = `configuration:${record.session_id}`;
  const configuration = context.services?.storage?.get(configurationKey);
  const intent = typeof configuration === "string" ? (JSON.parse(configuration) as { intent?: string }).intent : undefined;
  if (record.goal_id) await execution.goalTitles.read([record.goal_id], beforeWrite);
  const goalTitle = record.goal_id ? execution.goalTitles.known(record.goal_id) ?? record.goal_id : null;
  const lines = [`状态：${record.state}${intent ? `；下一轮方式：${intent}` : ""}`, record.goal_id ? `关联目标：${goalTitle}` : ""];
  const facts: string[] = [record.title, record.state, intent ?? "", record.goal_id ?? "", goalTitle ?? ""];
  if (record.runtime_session_id) {
    const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
    const snapshot = await codingActions(context, beforeWrite).invoke(agent.readSession, [session]);
    const runs = await Promise.all(snapshot.runs.slice(-3).map(ref => codingActions(context, beforeWrite).invoke(agent.readRun, [session, ref])));
    facts.push(String(snapshot.runs.length));
    for (const run of runs) {
      const task = run.turns.find(turn => turn.kind === "user")?.text ?? "";
      const reply = [...run.turns].reverse().find(turn => turn.kind === "assistant")?.text ?? "";
      const files = [...new Set(run.activity.filter(item => ["write", "edit", "edit-file"].includes(item.name) && item.state === "completed").map(item => item.target))];
      // Hash the already-read full relevant words before cutting the presentation. Lifecycle timestamps are not content.
      facts.push(JSON.stringify({ ref: run.ref, phase: run.phase, turns: run.turns.filter(turn => turn.kind === "user" || turn.kind === "assistant")
        .map(turn => ({ kind: turn.kind, text: turn.text })), files }));
      lines.push("", `一轮（${run.phase}）：${task.slice(0, 600)}`, ...(files.length ? [`改动的文件：${files.join("、")}`] : []), ...(reply ? [`结果：${reply.slice(0, 1200)}`] : []));
    }
  }
  const assertCurrent = () => {
    beforeWrite.assert_current();
    execution.sessions.lifecycle.assertWritable(a.projectId, record.session_id);
    if (!sameLifecycleOriginal(record, execution.sessions.get(a.projectId, record.session_id))
      || context.services?.storage?.get(configurationKey) !== configuration
      || (record.goal_id ? execution.goalTitles.known(record.goal_id) ?? record.goal_id : null) !== goalTitle) throw changed();
  };
  assertCurrent();
  return { context: subjectContext({ subject: { kind: "coding_session", id: record.session_id }, revision: searchRevisionOf(facts), title: record.title || "编码会话",
    content: lines.filter((line, index) => line || index > 1).join("\n"), goal_ids: record.goal_id ? [record.goal_id] : [], open: { surface: "coding", id: record.session_id } }), assertCurrent };
}

/** A body-free read of Coding's current durable lifecycle original; no Runtime or Goal reads. */
export function codingSubjectRetention(a: CodingActivation, execution: CodingExecution, sessionId: string, beforeWrite: CodingBeforeWrite): ActionSubjectRetention {
  beforeWrite.assert_current();
  let record: CodingSessionRecord;
  try { record = execution.sessions.get(a.projectId, sessionId); }
  catch (error) {
    if (!(error instanceof ActionError) || error.code !== "coding.session_unknown") throw error;
    // Only this exact SELECT's absence is authoritative; failed authority or storage reads are never absence.
    beforeWrite.assert_current();
    return { subject: { kind: "coding_session", id: sessionId }, state: "deleted", retained: null };
  }
  const original = execution.sessions.lifecycle.current(a.projectId, record.session_id);
  beforeWrite.assert_current();
  if (original && (!original.completed || original.archived !== record.archived)) throw changed();
  const subject = { kind: "coding_session", id: record.session_id };
  if (!original) {
    if (record.archived) return { subject, state: "temporarily_archived", retained: { content_revision: null, restoration_operation_id: null } };
    return { subject, state: "active", retained: null };
  }
  if (record.archived) return { subject, state: "temporarily_archived", retained: { content_revision: original.content_revision, restoration_operation_id: null } };
  const request = original.request;
  return { subject, state: "active", retained: { content_revision: original.content_revision,
    restoration_operation_id: request.mode === "runtime" ? request.decision.operation_id : request.operation_id } };
}
