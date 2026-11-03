import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, type AgentRunView, type AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import { questionDraftMaterial } from "@molis-ai/molis-work-plugin-sdk";
import type { CodingSessionRecord } from "./store.js";

export const codingReaskErrors = defineErrorCodes("coding", {
  reask_invalid: "invalid",
  reask_not_this_session: "forbidden",
  reask_question_open: "conflict",
  reask_question_gone: "not_found",
});

/**
 * 「请 AI 重新问」 on one of Coding's closed question cards (specs/ai-interaction-experience D5): a new round of this session
 * starts with the question and the person's draft as one marked material, built the same way as the Assistant's.
 *
 * The page names only which question (`reask: { run_id, pending_id }`); everything else the Host reads itself. The run
 * must be one of this session's (the session is the project's, picked by the route; the round is the caller's, from the
 * call context), and the question one that can no longer be answered: an open question is answered, not asked again.
 * The draft is the one the page kept for that question, never words the request carries.
 */
export async function reaskMaterial(context: PluginStartContext, record: CodingSessionRecord, reask: unknown, actions: PluginActionClient): Promise<AgentTextMaterial> {
  const { run_id: runId, pending_id: pendingId } = (reask && typeof reask === "object" && !Array.isArray(reask) ? reask : {}) as { run_id?: unknown; pending_id?: unknown };
  if (typeof runId !== "string" || !runId || runId.length > 200 || typeof pendingId !== "string" || !pendingId || pendingId.length > 200) {
    throw codingReaskErrors.reask_invalid("重新问需要原问题所在的轮次与问题");
  }
  if (!record.runtime_session_id) throw codingReaskErrors.reask_not_this_session("这个问题不属于这个会话");
  const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
  const runs = (await actions.invoke(agent.readSession, [session])).runs;
  if (!runs.some(ref => ref.run_id === runId)) throw codingReaskErrors.reask_not_this_session("这个问题不属于这个会话");
  const run: AgentRunView = await actions.invoke(agent.readRun, [session, { session_id: session.session_id, run_id: runId }]);
  const question = run.awaiting_input.find(item => item.pending_id === pendingId);
  if (!question) throw codingReaskErrors.reask_question_gone("这个问题已经不在了，不能重新问");
  if (question.answerable !== false) throw codingReaskErrors.reask_question_open("这个问题还能回答，请直接回答");
  const drafts = (() => { try { return JSON.parse(context.services?.storage?.get(`question-drafts:${record.session_id}`) ?? "{}") as Record<string, unknown>; } catch { return {}; } })();
  const { title, text } = questionDraftMaterial(question, drafts[JSON.stringify([runId, pendingId, question.pending_revision])]);
  return { material_id: `reask-${pendingId}`.slice(0, 240), title, text, source_artifact_id: `question:${pendingId}`.slice(0, 200), source_version: question.pending_revision ?? 1 };
}
