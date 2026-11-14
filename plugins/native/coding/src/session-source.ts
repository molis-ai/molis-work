import { defineErrorCodes, searchRevisionOf, subjectContext, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { type CodingActivation, selected } from "./route-activation.js";
import { codingActions, type CodingBeforeWrite } from "./route-entry.js";
import { sessionTitleFor } from "./session-title.js";
import type { CodingSessionRecord } from "./store.js";
import type { CodingExecution } from "./routes.js";

const sourceErrors = defineErrorCodes("coding", { subject_archived: "unavailable", subject_changed: "conflict" });

/** The owner's existing listing material; updated_at/state retain their original Search invalidation meaning. */
export function codingSessionEntry(record: CodingSessionRecord, goalTitle?: string): SearchEntry {
  const title = sessionTitleFor(record.title), summary = record.goal_id ? `关联目标：${goalTitle ?? record.goal_id}` : "";
  return { subject: { kind: "coding_session", id: record.session_id },
    revision: `${record.updated_at}:${record.state}`, title, summary, updated_at: record.updated_at,
    content: "context", open: { surface: "coding", id: record.session_id } };
}

/** The current bounded material, shared by references and Search; the caller's original Action control remains in force. */
export async function codingSessionSubject(a: CodingActivation, request: PluginRouteRequest, execution: CodingExecution, beforeWrite: CodingBeforeWrite) {
  const record = selected(a, request, execution);
  const current = () => {
    const now = execution.sessions.get(a.projectId, record.session_id);
    if (now.archived) throw sourceErrors.subject_archived("已归档会话不供任务读取；本人可在会话详情查看历史");
    if (now.runtime_id !== record.runtime_id || now.runtime_session_id !== record.runtime_session_id || now.updated_at !== record.updated_at) {
      throw sourceErrors.subject_changed("会话在读取时发生变化，请重试");
    }
  };
  current();
  if (record.goal_id) await execution.goalTitles.read([record.goal_id], beforeWrite);
  const saved = a.context.services?.storage?.get(`configuration:${record.session_id}`);
  const intent = typeof saved === "string" ? (JSON.parse(saved) as { intent?: string }).intent : undefined;
  const entry = codingSessionEntry(record, record.goal_id ? execution.goalTitles.known(record.goal_id) : undefined), summary = entry.summary;
  const lines = [`状态：${record.state}${intent ? `；下一轮方式：${intent}` : ""}`, summary];
  if (record.runtime_session_id) {
    const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id }, actions = codingActions(a.context, beforeWrite);
    const snapshot = await actions.invoke(agent.readSession, [session]);
    const runs = await Promise.all(snapshot.runs.slice(-3).map(ref => actions.invoke(agent.readRun, [session, ref])));
    for (const run of runs) {
      const task = run.turns.find(turn => turn.kind === "user")?.text ?? "";
      const reply = [...run.turns].reverse().find(turn => turn.kind === "assistant")?.text ?? "";
      const changed = [...new Set(run.activity.filter(item => ["write", "edit", "edit-file"].includes(item.name) && item.state === "completed").map(item => item.target))];
      lines.push("", `一轮（${run.phase}）：${task.slice(0, 600)}`, ...(changed.length ? [`改动的文件：${changed.join("、")}`] : []), ...(reply ? [`结果：${reply.slice(0, 1200)}`] : []));
    }
  }
  current();
  const context = subjectContext({ subject: { kind: "coding_session", id: record.session_id }, revision: "pending", title: entry.title,
    content: lines.filter((line, index) => line || index > 1).join("\n"), goal_ids: record.goal_id ? [record.goal_id] : [], open: { surface: "coding", id: record.session_id } });
  return { ...context, revision: `content-v1:${searchRevisionOf([context.title, summary.slice(0, 4000), context.content])}` };
}
