import { QUESTION_REASK, questionDraftMaterial } from "@molis-ai/molis-work-plugin-sdk";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import type { AssistantMaterial } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantErrors } from "./assistant-errors.js";
import type { StoredWork } from "./assistant-store.js";

/** The round's words: the Host writes them, the page names only the question. */
export const reaskTask = (): string => QUESTION_REASK.task;

/**
 * 「请 AI 重新问」 on one of the Assistant's closed question cards (specs/ai-interaction-experience D5): the person's Send
 * names the question (`reask: { run_id, pending_id }`), and the round carries one material that states only facts: the
 * question, why it ended, and the draft the person wrote but did not send.
 * The page names only which question; the Host reads it from the work's own run, and the draft from the work, so a page
 * cannot hand the model words of its own as "the draft". Only a question that can no longer be answered is asked again:
 * an open one is answered, not re-asked. An executor plugin's work has questions of the plugin's own, asked again on its page.
 */
export async function reaskMaterial(work: StoredWork, reask: unknown, rounds: readonly { run_id: string | null }[],
  runtime: { read(ref: { session_id: string; run_id: string }): Promise<{ awaiting_input: readonly AgentPendingQuestion[] }> }): Promise<AssistantMaterial> {
  const { run_id: runId, pending_id: pendingId } = (reask && typeof reask === "object" ? reask : {}) as { run_id?: unknown; pending_id?: unknown };
  if (typeof runId !== "string" || typeof pendingId !== "string" || work.executor.kind === "plugin") throw assistantErrors.invalid("重新问需要这项工作里的原问题");
  if (!work.session_id || !rounds.some(round => round.run_id === runId)) throw assistantErrors.scope("这个问题不属于这项工作");
  const question = (await runtime.read({ session_id: work.session_id, run_id: runId })).awaiting_input.find(item => item.pending_id === pendingId);
  if (!question) throw assistantErrors.stale("这个问题已经不在了，不能重新问");
  if (question.answerable !== false) throw assistantErrors.state("这个问题还能回答，请直接回答");
  const { title, text } = questionDraftMaterial(question, work.question_drafts?.[pendingId]);
  return { material_id: `reask-${pendingId}`.slice(0, 80), kind: "text", title, explicit: true, text, draft: true };
}
