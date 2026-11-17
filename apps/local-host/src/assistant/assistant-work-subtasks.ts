import { createHash } from "node:crypto";
import type { AssistantControl, AssistantSendResult, AssistantSubtaskAnswer, AssistantSubtaskBinding, AssistantSubtaskResumeAnswer, AssistantSubtaskReview, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import type { AssistantOutcomes } from "./assistant-outcomes.js";
import type { AssistantDispatch } from "./assistant-dispatch.js";
import { RUNTIME, sessionRef, type AssistantCaller, type AssistantServicePorts } from "./assistant-service-shared.js";
import { assistantFailure } from "./assistant-error.js";
import { subtaskInputSessions } from "./assistant-subtask-inputs.js";
import type { AssistantDelegations } from "./assistant-delegation.js";
import { assertSubtaskGraph, assertSubtaskNodes, assertSubtaskRun, assertSubtaskWork } from "./assistant-subtask-binding.js";
import { assistantErrors } from "./assistant-errors.js";
import { PARKED_ANSWER_TASK } from "./assistant-parked-answer.js";

type Links = Pick<AssistantDispatch, "dispatch" | "executorOf"> & Pick<AssistantDelegations, "parentOf"> & {
  outcomes: AssistantOutcomes;
  applyControl(work: StoredWork, control: Exclude<AssistantControl, { kind: "withdraw" }>): Promise<void>;
  read(workId: string): Promise<AssistantWorkView>;
};
// Only request identity is retained here; the original question owner keeps the answer.
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;

/** Work-origin child conversations and controls use the original owners and request ledger. No second task or question state. */
export class AssistantWorkSubtasks {
  constructor(private readonly store: AssistantStore, private readonly ports: AssistantServicePorts, private readonly actor: string, private readonly link: Links) {}

  private async latest(work: StoredWork) {
    if (work.executor.kind === "plugin") return work.executor.session_id
      ? (await (await this.link.executorOf(work)).read(work.executor.session_id, 1)).runs.at(-1) : undefined;
    return work.session_id ? (await (await this.ports.host()).adapter(RUNTIME).readSession(sessionRef(work))).latest_run : undefined;
  }

  async assert(binding: AssistantSubtaskBinding, operation?: "send" | "continue"): Promise<void> {
    const work = assertSubtaskWork(this.store, this.actor, binding);
    await assertSubtaskGraph((await this.ports.host()).adapter(RUNTIME), work, this.store.get(this.actor, binding.parent_work_id));
    const latest = await this.latest(work);
    assertSubtaskWork(this.store, this.actor, binding);
    assertSubtaskRun(binding, latest, operation);
  }

  async conversation(workId: string): Promise<{ view: AssistantWorkView; binding: AssistantSubtaskBinding | null; parent_subtask: boolean; input_unavailable?: string }> {
    const work = this.store.get(this.actor, workId), parent = this.link.parentOf(work);
    if (!work.delegated_by || !parent) throw assistantErrors.scope("This Work is not a delegated child");
    const view = await this.link.read(workId), latest = await this.latest(work);
    if (!latest) return { view, parent_subtask: Boolean(parent.delegated_by), binding: null, input_unavailable: "The original child execution is unavailable" };
    const binding: AssistantSubtaskBinding = { work_id: workId, parent_work_id: parent.work_id, graph_id: work.delegated_by.graph_id,
      node_id: work.delegated_by.node_id, run: { ...latest.ref }, executor: work.executor.kind === "plugin" ? { kind: "plugin", plugin_id: work.executor.plugin_id } : { kind: "assistant" },
      ...(work.executor.kind === "plugin" && work.executor.session_id ? { executor_session_id: work.executor.session_id } : {}) };
    try { await this.assert(binding); return { view, binding, parent_subtask: Boolean(parent.delegated_by) }; }
    catch (error) { return { view, binding, parent_subtask: Boolean(parent.delegated_by), input_unavailable: assistantFailure(error).message }; }
  }

  /** Read the original request even after its child advanced or was taken back. No replay or notification effect. */
  async checkRequest(workId: string, requestId: string) {
    const work = this.store.get(this.actor, workId);
    if (this.store.requests.workOf(this.actor, requestId) !== workId) return { state: "unknown" as const };
    const receipt = this.store.requests.read(this.actor, requestId);
    if (receipt.state === "sent") return { state: "applied" as const, result: receipt.result };
    const adapter = (await this.ports.host()).adapter(RUNTIME);
    const sessions = await subtaskInputSessions(work, { store: this.store, actorId: this.actor, adapter, personActions: this.ports.personActions, executor: (current, pluginId) => this.link.executorOf(current, pluginId) });
    for await (const inputSession of sessions) {
      const start = await adapter.readOriginalInput?.({ session_id: inputSession, input_id: requestId, version: 1 });
      if (start) return { state: "applied" as const, run: start.accepted_run };
      const input = await adapter.inputs?.findByKey?.(inputSession, `send.${requestId}`);
      if (input) return { state: "applied" as const, input_id: input.ref.input_id };
    }
    return { state: "unknown" as const };
  }

  async stop(workId: string, control: AssistantControl): Promise<AssistantWorkView> {
    const work = this.store.get(this.actor, workId);
    if (!control.subtask) throw assistantErrors.invalid("Missing original subtask binding");
    if (control.kind !== "stop" || control.subtask.work_id !== workId || !control.request_id) throw assistantErrors.invalid("Invalid subtask stop request");
    const claim = this.store.requests.claimStop(this.actor, control.request_id, workId);
    if (!claim.claimed) return this.link.read(workId);
    try { await this.assert(control.subtask, "send"); }
    catch (error) { this.store.requests.releaseRequest(this.actor, control.request_id); throw error; }
    // From this handoff onward a missing response stays unknown, including a failure while reading the final view.
    await this.link.applyControl(work, control);
    const view = await this.link.read(workId);
    this.store.requests.finishRequest(this.actor, control.request_id, { outcome: "stopped", work: view.work, run_id: control.subtask.run.run_id });
    return view;
  }

  private async scope(binding: AssistantSubtaskBinding, caller: AssistantCaller, queue?: { pending_id: string; queued_input_id: string }) {
    const work = assertSubtaskWork(this.store, this.actor, binding), revision = work.revision;
    const adapter = (await this.ports.host()).adapter("prologue");
    if (!adapter.collaboration?.works) throw assistantErrors.unsupported("原子任务归属不可核对");
    let changed = false, accepted = false, prepared = false;
    const parent = this.store.get(this.actor, binding.parent_work_id);
    const dispose = adapter.collaboration.works.watch(binding.graph_id, nodes => {
      if (!nodes) { changed = true; return; }
      try { assertSubtaskNodes(nodes, work, parent); } catch { changed = true; }
    });
    const current = () => {
      caller.assertBeforeStart?.();
      const current = assertSubtaskWork(this.store, this.actor, binding);
      if (changed || !accepted && current.revision !== revision) throw assistantErrors.stale("原子任务在提交前已改变，请读取后再操作");
    };
    const beforeEffect = async () => {
      await caller.beforeStart?.(); current();
      await assertSubtaskGraph(adapter, work, this.store.get(this.actor, binding.parent_work_id));
      current();
      // The original pending/queued-start owner validates its exact Run under its own lock.
      // Re-reading that Session from a storage callback would wait on the transaction invoking us.
      if (prepared) return;
      const latest = await this.latest(work); current(); assertSubtaskRun(binding, latest, queue ? "continue" : undefined);
      if (queue) {
        const queued = (await this.link.read(work.work_id)).queued_inputs?.some(input => input.input_id === queue.queued_input_id
          && input.key === `answer.${queue.pending_id}` && input.left_by?.run_id === binding.run.run_id && !input.left_by.applied);
        current(); if (!queued) throw assistantErrors.stale("原问题的已接受答案已不在此执行的队列中");
      }
    };
    try { await beforeEffect(); prepared = true; return { work, adapter, current, beforeEffect, dispose, accepted: () => { accepted = true; } }; } catch (error) { dispose(); throw error; }
  }

  async review(workId: string, input: AssistantSubtaskReview, caller: AssistantCaller): Promise<AssistantWorkView> {
    const frozen = structuredClone(input);
    if (frozen.subtask?.work_id !== workId) throw assistantErrors.invalid("原审批的子任务引用不完整");
    const scope = await this.scope(frozen.subtask, caller);
    try { return await this.link.outcomes.decide(workId, frozen, { beforeEffect: scope.beforeEffect, assert_current: scope.current, run: frozen.subtask.run }); }
    finally { scope.dispose(); }
  }

  async answer(workId: string, input: AssistantSubtaskAnswer, caller: AssistantCaller = {}): Promise<AssistantWorkView> {
    const frozen = structuredClone(input);
    return this.run(workId, frozen, "answer", caller, async (scope, handed, accepted) => {
      return this.link.outcomes.answer(workId, { ...frozen, run_id: frozen.subtask.run.run_id }, caller, {
        beforeEffect: scope.beforeEffect, assertCurrent: scope.current, handed, accepted,
      });
    });
  }

  async resume(workId: string, input: AssistantSubtaskResumeAnswer, caller: AssistantCaller = {}): Promise<AssistantWorkView> {
    const frozen = structuredClone(input);
    return this.run(workId, frozen, "resume-answer", caller, async (scope, handed, accepted) => {
      const result = await this.link.dispatch(scope.work, PARKED_ANSWER_TASK, [], null, undefined, "host", () => { scope.current(); return true; },
        scope.beforeEffect, scope.current, { byHost: true, subtask: { binding: frozen.subtask, operation: "continue" }, handed, draftCurrent: () => false,
          resume_answer: { run_id: frozen.subtask.run.run_id, pending_id: frozen.pending_id, queued_input_id: frozen.queued_input_id },
          ...(caller.reply_locale ? { reply_locale: caller.reply_locale } : {}) }, { assertCurrent: scope.current, accepted: scope.accepted });
      accepted(result);
      return this.link.read(workId);
    });
  }

  private async run(workId: string, input: AssistantSubtaskAnswer | AssistantSubtaskResumeAnswer, operation: "answer" | "resume-answer", caller: AssistantCaller,
    execute: (scope: Awaited<ReturnType<AssistantWorkSubtasks["scope"]>>, handed: () => void, accepted: (result?: AssistantSendResult) => void) => Promise<AssistantWorkView>) {
    if (input.subtask?.work_id !== workId || !input.pending_id || operation === "answer" && (!Number.isSafeInteger((input as AssistantSubtaskAnswer).pending_revision) || (input as AssistantSubtaskAnswer).pending_revision < 1)) throw assistantErrors.invalid("原问题的执行引用不完整");
    this.store.get(this.actor, workId);
    const question: NonNullable<AssistantSendResult["question_request"]> = { operation, binding: input.subtask, pending_id: input.pending_id,
      fingerprint: createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex") };
    const claim = this.store.requests.claimQuestion(this.actor, input.request_id, workId, question);
    if (!claim.claimed) return this.link.read(workId);
    let handed = false, accepted = false, scope: Awaited<ReturnType<AssistantWorkSubtasks["scope"]>> | undefined;
    try {
      scope = await this.scope(input.subtask, caller, operation === "resume-answer" ? input as AssistantSubtaskResumeAnswer : undefined);
      const before = await this.link.read(workId);
      const submit = () => execute(scope!, () => { handed = true; }, result => {
        this.store.requests.finishRequest(this.actor, input.request_id, { ...(result ?? { outcome: "answered", work: before.work, run_id: input.subtask.run.run_id }), question_request: question });
        accepted = true;
      });
      if (operation === "answer") return await submit();
      if (!scope.adapter.withEffect) throw assistantErrors.unsupported("当前运行时不能核对接续的提交边界");
      return await scope.adapter.withEffect({ beforeEffect: scope.beforeEffect, assert_current: scope.current }, submit);
    } catch (error) {
      const refused = (error as { code?: string }).code === "agent.answer_invalid" || (error as { code?: string; details?: { answer_accepted?: boolean } }).code === "assistant.state" && (error as { details?: { answer_accepted?: boolean } }).details?.answer_accepted === false;
      if (!handed || !accepted && refused) this.store.requests.releaseRequest(this.actor, input.request_id);
      if (handed && !accepted && !refused) throw assistantErrors.pending_request("原请求可能已受理，请先核对；回答和接续都未重复");
      throw error;
    } finally { scope?.dispose(); }
  }
}
