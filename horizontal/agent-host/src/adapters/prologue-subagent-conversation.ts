import { originalRunEvents } from "./prologue-original-inputs.js";
import { createHash } from "node:crypto";
import { projectInputReceipts, type Runtime, type SubagentHandle } from "@prologue/sdk";
import type { AgentRunRef, AgentSubagentConversation, AgentSubagentRequestResult, AgentSubagentsCapability } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import { applyRunEvent, emptyPrologueStreamState } from "./prologue-stream.js";
import type { PrologueSubagentHooks } from "./prologue-subagents.js";

/** A read-only projection of retained SDK scope; the SDK rechecks authority itself on send/continue. */
function unavailable(runtime: Runtime, child: SubagentHandle): string | undefined {
  try {
    const seen = new Set<string>();
    for (;;) {
      if (seen.has(child.ref.id) || !child.authority) return "原子任务授权不可核验";
      seen.add(child.ref.id);
      runtime.boards.assertScope(child.authority.board, child.authority);
      const owner = runtime.boards.get(child.authority.board).nodes.find(one => one.id === child.authority!.node)?.assignee;
      if (owner?.kind !== "session" || ![child.session.id, child.parentSession.id].includes(owner.id)) return "原任务已收回或交给其他执行者";
      const parent = runtime.subagents.list().find(one => one.session.id === child.parentSession.id && (one.attempts ?? [one.run]).some(run => run.id === child.parentRun.id));
      if (parent) { child = parent; continue; }
      const scope = runtime.boards.attemptOf(child.parentRun);
      if (!scope) return "原父任务授权不可核验";
      runtime.boards.assertScope(scope.board, scope);
      return undefined;
    }
  } catch { return "原任务范围已失效，请回到父任务处理"; }
}

const commandName = "molis.subagent.command";
const requestKey = (run: AgentRunRef, id: string, request: string, actor: string) => `molis-child-${createHash("sha256").update(JSON.stringify([run.session_id, run.run_id, id, actor, request])).digest("hex")}`;

/** SAI-03/04/05/08/09: no Host message ledger, no speculative retry and no selection-dependent late writes. */
export function subagentConversation(
  runtime: Runtime,
  owned: (run: AgentRunRef, id: string) => SubagentHandle,
  list: AgentSubagentsCapability["list"],
  hooks: PrologueSubagentHooks,
): Pick<AgentSubagentsCapability, "conversation" | "command" | "checkRequest"> {
  const conversation: NonNullable<AgentSubagentsCapability["conversation"]> = async (run, id) => {
    const child = owned(run, id), view = (await list(run)).find(one => one.subagent_id === id);
    if (!view) throw agentErrors.collaboration_unknown("子任务不属于这一轮执行");
    const session = await runtime.sessions.open(child.session);
    if (!session) throw agentErrors.session_unknown("子任务原始会话不可读取");
    const messages: AgentSubagentConversation["messages"] = [];
    let latest = emptyPrologueStreamState();
    for (const attempt of child.attempts ?? [child.run]) {
      latest = emptyPrologueStreamState();
      for (const event of await originalRunEvents(session, attempt)) applyRunEvent(latest, event, null);
      const ref = { session_id: child.session.id, run_id: attempt.id };
      for (const turn of latest.turns) {
        if (turn.kind === "system") continue;
        messages.push({ ...turn, turn_id: `${attempt.id}:${turn.turn_id}`, run: ref });
      }
      if (latest.streaming) messages.push({ turn_id: `${attempt.id}:assistant-${latest.turns.length + 1}`, kind: "assistant", text: latest.streaming, at: latest.streaming_at, run: ref });
    }
    const reason = unavailable(runtime, child)
      ?? (view.state === "reconcile-required" ? "这次执行有未核对的结果，请先在原恢复入口核对" : undefined)
      ?? (view.state !== "running" && view.budget && view.budget.attempt >= view.budget.max_attempts ? "尝试额度已用完，请先增加额度" : undefined);
    const pending = new Map((await runtime.effects.pendings.readByOrigin({ session: child.session.id, run: child.run.id }))
      .filter(one => one.state === "open").map(one => [one.ref.id, one.ref.revision]));
    return { child: view, messages, phase: latest.phase,
      questions: latest.awaiting_input.filter(one => pending.has(one.pending_id)).map(one => ({ ...one, pending_revision: pending.get(one.pending_id)! })),
      approvals: latest.awaiting_approval.filter(one => pending.has(one.pending_id)).map(({ pending_id }) => ({ pending_id, pending_revision: pending.get(pending_id)! })),
      ...(reason ? { input_unavailable: reason } : {}) };
  };
  return {
    conversation,
    async checkRequest(run, id, request, actor) {
      const child = owned(run, id), key = requestKey(run, id, request, actor);
      const result = await runtime.inspectIdempotent<AgentSubagentRequestResult>({ command: commandName, key });
      if (result.state === "completed") return result.value;
      // The input may have been durably accepted before its notice or the outer command receipt failed. Read its
      // original Run ledger; a retained InputRef proves acceptance even when the command owner still says pending.
      const session = await runtime.sessions.open(child.session);
      if (session) for (const attempt of child.attempts ?? [child.run]) {
        const receipt = projectInputReceipts(await originalRunEvents(session, attempt)).find(one => one.key === key);
        if (receipt) return { state: "applied", run: { session_id: child.session.id, run_id: attempt.id }, input_id: receipt.steerId };
      }
      // An absent SDK claim cannot prove that the original transport is no longer preparing it.
      return { state: "unknown" };
    },
    async command(run, id, submitted, control) {
      const input = structuredClone(submitted), child = owned(run, id);
      const key = requestKey(run, id, input.request_id, control.actor_id);
      if ((input.kind === "send" || input.kind === "continue") && (!input.text.trim() || input.text !== control.original_text)) {
        throw agentErrors.capability_unavailable("缺少这次子任务输入的本人原件证明");
      }
      await control.execution.beforeStart?.(); control.execution.assertBeforeStart?.();
      const result = await runtime.idempotent<AgentSubagentRequestResult>({ command: commandName, key,
        fingerprint: createHash("sha256").update(JSON.stringify([input.kind, input.child_run.session_id, input.child_run.run_id,
          "text" in input ? input.text : null, "attempts" in input ? input.attempts : null,
          input.kind === "retry" ? input.source ?? "user-requested" : null, input.kind === "retry" ? input.reason ?? null : null])).digest("hex") }, async () => {
        const current = owned(run, id);
        if (current.session.id !== input.child_run.session_id || current.run.id !== input.child_run.run_id) return { state: "not-applied", reason: "原子任务执行已改变，未发送或启动" };
        const reason = unavailable(runtime, current);
        if (reason) return { state: "not-applied", reason };
        await control.execution.beforeStart?.(); control.execution.assertBeforeStart?.();
        if (owned(run, id).run.id !== current.run.id) return { state: "not-applied", reason: "原子任务执行已改变" };
        if (input.kind === "stop") {
          await runtime.subagents.cancel(current.ref);
          return { state: "applied", run: input.child_run };
        }
        if (input.kind === "extend-budget") {
          if (!hooks.extendBudget || !Number.isSafeInteger(input.attempts) || input.attempts < 1 || input.attempts > 10) return { state: "not-applied", reason: "不能增加这份尝试额度" };
          await hooks.extendBudget(run, id, input.attempts);
          return { state: "applied", run: input.child_run };
        }
        if (input.kind === "send") {
          if (current.state !== "running") return { state: "not-applied", reason: "原执行已经结束，请明确继续子任务" };
          const receipt = await runtime.subagents.send({ child: child.ref, parent: { session: child.parentSession, run: child.parentRun }, expectedRun: current.run,
            key, text: input.text, original: { text: input.text, source: "person" } });
          return { state: "applied", run: input.child_run, input_id: receipt.inputId };
        }
        const view = (await list(run)).find(one => one.subagent_id === id);
        if (!view || current.state === "running" || current.state === "reconcile-required") return { state: "not-applied", reason: "当前子任务不能开始新尝试" };
        if (!hooks.continueChild || view.continuation_task?.status !== "available") return { state: "not-applied", reason: "原子任务开场不可核验" };
        if (view.budget && view.budget.attempt >= view.budget.max_attempts) return { state: "not-applied", reason: "尝试额度已用完" };
        const next = await hooks.continueChild({ parentRun: run, child: current, baseTask: view.continuation_task.text,
          source: input.kind === "retry" ? input.source ?? "user-requested" : "user-requested", actorId: control.actor_id,
          ...(input.kind === "retry" ? { reason: input.reason } : { text: input.text }),
          attemptNumber: (view.budget?.attempt ?? 1) + 1, requestKey: key, execution: control.execution });
        if (!next) throw agentErrors.control_failed("接续执行缺少原始回执");
        return { state: "applied", run: next };
      });
      return result.value;
    },
  };
}
