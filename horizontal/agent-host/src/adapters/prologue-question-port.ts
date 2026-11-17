import type { Runtime, ExactRef, PendingAnswer, SubagentHandle } from "@prologue/sdk";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import type { RunDeps } from "./prologue-run.js";
import type { NodeHost } from "./prologue-node-kit.js";
import { sameRef } from "./prologue-node-kit.js";
import type { SessionIndex, SessionIndexStore } from "./prologue-session-index.js";
import type { PrologueAdapterOptions } from "./prologue.js";
import { answerProblems, ownedReferences, projectQuestion, questionUnavailable } from "./prologue-questions.js";
import { agentErrors } from "../errors.js";

type QuestionDeps = Pick<RunDeps, "runtime" | "state" | "index" | "options" | "effects"> & { host: NodeHost; readQuestion: ReturnType<typeof questionReader> };
interface QuestionScope { session: ExactRef<"session">; owner: SessionIndex["owner"] }

/** Missing child indexes are normal for read-only children; a damaged or mismatching index is never a fallback. */
export async function childQuestionScope(index: SessionIndexStore, parentRun: AgentRunRef, child: SubagentHandle): Promise<QuestionScope> {
  if (child.parentSession.id !== parentRun.session_id || child.parentRun.id !== parentRun.run_id) throw agentErrors.collaboration_unknown("问题不属于原父任务");
  const parent = await index.read(parentRun.session_id), saved = await index.read(child.session.id);
  if (!parent?.attempts.some(attempt => attempt.run_id === parentRun.run_id)) throw agentErrors.run_unknown("原父任务归属不可读取");
  if (saved && (saved.ref.id !== child.session.id || saved.parent_run?.session_id !== parentRun.session_id || saved.parent_run.run_id !== parentRun.run_id
    || (["project_id", "plugin_id", "install_id", "actor_id"] as const).some(key => saved.owner[key] !== parent.owner[key]))) throw agentErrors.collaboration_unknown("原子会话归属不一致");
  return { session: child.session, owner: parent.owner };
}

export async function readPendingQuestion(deps: QuestionDeps, run: AgentRunRef, id: string, revision: number, scope?: QuestionScope): Promise<AgentPendingQuestion | null> {
  const pending = await deps.readQuestion(run, id, revision);
  if (pending.state === "settled") return null;
  const live = Boolean(deps.state.activeRuns.get(run.run_id)?.live() && deps.runtime.effects.pendings.hasLiveWaiter(pending.ref));
  const parked = !live && pending.state === "open" ? await parkedOn(deps.runtime, deps.index, run, pending.ref, scope?.session) : undefined;
  const unavailable = questionUnavailable(pending, (await deps.host.readClock()).monotonicMs, live || parked !== undefined);
  return { pending_id: pending.ref.id, pending_revision: pending.ref.revision, kind: pending.kind,
    prompt: pending.why, options: [], allows_free_text: pending.kind === "text",
    ...(pending.kind === "questionnaire" ? { questions: pending.questions.map(projectQuestion) } : {}), answerable: unavailable === undefined,
    ...(parked && !unavailable ? { parked: true as const } : {}), ...(unavailable ? { unavailable_reason: unavailable } : {}) };
}

/** A question the round asked, read for its own run only (text or questionnaire). */
export function questionReader(runtime: Runtime) {
  return async (run: AgentRunRef, id: string, revision: number) => {
    const pending = await runtime.effects.pendings.read({ kind: "pending", id, revision });
    if (!pending || pending.origin?.session !== run.session_id || pending.origin.run !== run.run_id
      || !["text", "questionnaire"].includes(pending.kind)) {
      throw agentErrors.pending_not_open("原问题不属于本轮执行，不能提交答案");
    }
    return pending;
  };
}

/**
 * The round's parked view, when a normal shutdown parked it on exactly this question and the runtime says it can be answered
 * now (prologue#40). A crash orphan has no marker and is never answerable.
 */
async function parkedOn(runtime: Runtime, index: SessionIndexStore, run: AgentRunRef, pending: ExactRef<"pending">, session?: ExactRef<"session">) {
  const ref = session ?? (await index.read(run.session_id))?.ref;
  const report = ref && await runtime.sessions.inspectRecovery(ref);
  const view = report?.runs.find(entry => entry.ref.id === run.run_id && entry.parked && sameRef(entry.parked.pending, pending));
  return ref && view?.canAnswer ? { session: ref, view } : undefined;
}

/**
 * The adapter's answer path: the original question, still open, answered in its own kind. A live run takes the answer at
 * once (`delivered`). A run parked at a normal shutdown ends with the question answered and the answer queued as the
 * person's input for the session's next round, which the caller opens (`queued`); the runtime settles it under this call's
 * own final authority check, the gateway's, at the moment it writes (S-33).
 */
export function answerPending(deps: QuestionDeps, scope?: QuestionScope): NonNullable<PrologueAdapterOptions["answerPending"]> {
  return async (run, answer) => {
    const { runtime } = deps;
    if (!Number.isInteger(answer.pending_revision) || answer.pending_revision! < 1) {
      throw agentErrors.pending_not_open("原问题缺少精确版本，不能提交答案");
    }
    const pending = await deps.readQuestion(run, answer.pending_id, answer.pending_revision!);
    const now = await deps.host.readClock();
    const live = Boolean(deps.state.activeRuns.get(run.run_id)?.live() && runtime.effects.pendings.hasLiveWaiter(pending.ref));
    const parked = !live && pending.state === "open" ? await parkedOn(runtime, deps.index, run, pending.ref, scope?.session) : undefined;
    const unavailable = questionUnavailable(pending, now.monotonicMs, live || parked !== undefined);
    if (unavailable) throw agentErrors.pending_not_open(unavailable);
    let reply: PendingAnswer;
    if (pending.kind === "text") {
      if (typeof answer.text !== "string" || !answer.text.trim() || answer.answers !== undefined) throw agentErrors.answer_invalid("请填写原问题的文字回答");
      reply = { kind: "text", text: answer.text };
    } else {
      if (!answer.answers || answer.text !== undefined) throw agentErrors.answer_invalid("请按原问卷逐题回答");
      // A picked object is used only while its owner still hands it to the session's owner, under the owner's label (S-26).
      const owned = await ownedReferences(deps.options.readReferences, scope?.owner ?? (await deps.index.read(run.session_id))?.owner, pending.questions, answer.answers);
      const problems = answerProblems(pending.questions, owned.answers);
      if (problems.length) throw Object.assign(agentErrors.answer_invalid(`有 ${problems.length} 道题的回答不能提交`, { problems }), { problems });
      if (owned.refused.length) throw Object.assign(agentErrors.answer_invalid("选的对象现在不能用，请重新选择", { problems: owned.refused }), { problems: owned.refused });
      reply = { kind: "questionnaire", answers: owned.answers };
    }
    if (!parked) { await runtime.effects.pendings.answer(pending.ref, reply, now, { assertBeforeAnswer: deps.effects.assertCurrent }); return "delivered"; }
    await runtime.sessions.answerInterrupted(parked.session, parked.view.ref, parked.view.version, pending.ref, reply, { assertBeforeAnswer: deps.effects.assertCurrent });
    return "queued";
  };
}

