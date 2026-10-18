import { isTerminalAgentPhase, type AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantFailure } from "./assistant-error.js";

/**
 * A question the Assistant asked before a restart, answered after it (specs/ai-interaction-experience §15.9, BL-156). A
 * normal shutdown parks the round on its question; the answer ends that round and waits in the session's queue, and the
 * next round takes it. These are the Assistant's words and rules for it; the service calls them where it answers and reads.
 */

/** The Host's words for the round that goes on after the answer; the answer itself comes with it from the queue. */
export const PARKED_ANSWER_TASK = "我回答了你在服务重启前问我的那个问题，回答附在后面；请接着完成这项工作。";

/** The phase a round has while its question takes an answer: waiting for it live, or parked at a restart. */
export const answerablePhase = (question: { parked?: true }) => question.parked ? "reconcile-required" : "awaiting-input";

/** What the person does about a session held for checking: answer the parked question it shows, or check the last round. */
export const recoveryAction = (runs: ReadonlyArray<{ awaiting_input: ReadonlyArray<{ parked?: true }> } | null>) =>
  runs.some(run => run?.awaiting_input.some(question => question.parked)) ? "回答上面的问题" : "核对上一轮的实际结果后再继续";

/** A work's problem from its session: held for checking, or an answer still waiting for the round that takes it. */
export function sessionProblem(recovery: AgentSessionView["recovery"], runs: Parameters<typeof recoveryAction>[0], session: AgentSessionView | null | undefined) {
  if (recovery) return { problem: { message: recovery.reason, action: recoveryAction(runs) } };
  const waiting = session?.queued_inputs?.some(input => input.key?.startsWith("answer.")) && (!session.latest_run || isTerminalAgentPhase(session.latest_run.phase));
  return waiting ? { problem: { message: "已回答，下一轮还没开始；回答留在排队里", action: "说“继续”接着做" } } : {};
}

/**
 * The next round after the answer, started by `start`. Refused, the answer stays queued and the reason is returned; the
 * person's next Send (「继续」) starts it. A session still busy is read once (`look`, which finishes handing the answer
 * over) and the round tried once more, never in a loop.
 */
export async function roundAfterParkedAnswer(start: () => Promise<unknown>, look: () => Promise<unknown>): Promise<string | undefined> {
  try { await start(); return undefined; } catch (error) {
    if ((error as { code?: unknown }).code !== "agent.session_busy") return assistantFailure(error).message;
  }
  await look().catch(() => undefined);
  try { await start(); return undefined; } catch (error) { return assistantFailure(error).message; }
}

/** The work after the answer (read once the next round was tried): it says so when that round did not start. */
export const afterParkedAnswer = (refused: string | undefined, view: AssistantWorkView): AssistantWorkView =>
  refused ? { ...view, problem: { message: `已回答，下一轮没能开始：${refused}`, action: "说“继续”接着做" } } : view;
