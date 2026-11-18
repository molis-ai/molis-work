import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { isTerminalAgentPhase, type AgentActionReviewControl, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantControl, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { ExecutorControl, WorkExecutor } from "./assistant-executor.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import type { AssistantContinuations } from "./assistant-continuations.js";
import type { AssistantDelegations } from "./assistant-delegation.js";
import { assistantErrors } from "./assistant-errors.js";
import { assertSubtaskGraph, assertSubtaskRun, assertSubtaskWork } from "./assistant-subtask-binding.js";
import { assertAssistantSessionSettled, assistantEndControl, assistantWorkEnding, beginAssistantWorkEnds, inAssistantWorkEffect, stopOriginalRun } from "./assistant-work-permissions.js";
import { RUNTIME } from "./assistant-service-shared.js";

/** The original Work permission owner revokes admission before stopping or taking back its execution. */
export async function takeBackAssistantWork(child: StoredWork, parent: StoredWork | undefined, ports: {
  store: AssistantStore; actorId: string; host(): Promise<AgentHost>; latestRun(host: AgentHost, work: StoredWork): Promise<AgentRunView | null>;
  endOpen(work: StoredWork, control: AgentActionReviewControl): Promise<void>; read(workId: string): Promise<AssistantWorkView>;
}, caller?: AgentActionReviewControl): Promise<AssistantWorkView> {
  const { store, actorId } = ports;
  if (!child.delegated_by || !parent) throw assistantErrors.invalid("这不是一个子任务");
  const release = store.permissionTransitions.holdWorkPermissions([child.work_id]);
  try {
    const host = await ports.host(), ending = assistantWorkEnding(host, child), control = assistantEndControl(store, child, caller);
    assertAssistantSessionSettled(host, child);
    if (child.delegated_by.taken_back_at && (await ending?.read())?.lifecycle !== "ending") throw assistantErrors.invalid("这个子任务已经收回了");
    const finish = await ending?.begin("taken-back", control);
    await ports.endOpen(child, control);
    const latest = await ports.latestRun(host, child);
    if (latest && !isTerminalAgentPhase(latest.phase)) {
      if (ending) await stopOriginalRun(host.adapter(RUNTIME), latest.ref, control);
      else await inAssistantWorkEffect(host.adapter(RUNTIME), control, () => host.adapter(RUNTIME).control(latest.ref, { kind: "stop" }));
      host.reviews.cancelPending(latest.ref.run_id, "用户把这个子任务收回了");
    }
    await control.beforeEffect(); control.assertCurrent();
    store.update(actorId, child.work_id, null, { delegated_by: { ...child.delegated_by, taken_back_at: child.delegated_by.taken_back_at ?? new Date().toISOString() } }, false);
    await finish?.();
    return ports.read(parent.work_id);
  } finally { release(); }
}

/** Controls both a live round and a parked work. Stopping a wait does not pretend its already committed effects vanished. */
export async function controlAssistantWork(work: StoredWork, control: Exclude<AssistantControl, { kind: "withdraw" }>, ports: {
  actorId: string; store: AssistantStore; continuations: AssistantContinuations; delegations: AssistantDelegations;
  host(): Promise<AgentHost>; executor(work: StoredWork, control: ExecutorControl): Promise<WorkExecutor>;
  latest(host: AgentHost, work: StoredWork): Promise<AgentRunView | null>;
  cancelSetups?(sessionId: string): void;
  retainSetups?(sessionId: string, control: AgentActionReviewControl): Promise<void>;
}, caller?: AgentActionReviewControl, closeForDeletion?: (work: StoredWork, host: AgentHost, control: AgentActionReviewControl) => Promise<void>): Promise<void> {
  if (!["pause", "resume", "stop"].includes(control?.kind)) throw assistantErrors.invalid("不支持的操作");
  if ("keep_connections" in control && (control.kind !== "stop" || typeof control.keep_connections !== "boolean")) throw assistantErrors.invalid("保留接入必须由停止操作明确选择");
  if (control.kind === "stop" && control.keep_connections && (work.executor.kind !== "assistant" || !ports.retainSetups)) throw assistantErrors.state("当前工作不支持停止后保留接入");
  if (control.subtask) {
    if (control.kind !== "stop" || control.keep_connections) throw assistantErrors.invalid("子任务只停止绑定的原执行");
    const binding = control.subtask, endAccess = ports.store.permissionTransitions.holdWorkPermissions([work.work_id]);
    const release = ports.continuations.blockStart(work.work_id);
    let revision = work.revision;
    const current = () => {
      caller?.assertCurrent();
      const own = assertSubtaskWork(ports.store, ports.actorId, binding);
      if (own.revision !== revision) throw assistantErrors.stale("原工作在停止提交前已改变，请读取后再操作");
    };
    try {
      const host = await ports.host();
      let admitted = false;
      const beforeEffect = async () => {
        await caller?.beforeEffect(); current();
        await assertSubtaskGraph(host.adapter("prologue"), work, ports.store.get(ports.actorId, binding.parent_work_id));
        const latest = work.executor.kind === "plugin" ? (await (await ports.executor(work, { beforeEffect: async () => { await caller?.beforeEffect(); current(); }, assert_authority_current: current })).read(work.executor.session_id!, 1)).runs.at(-1)
          : await ports.latest(host, work);
        current(); assertSubtaskRun(binding, latest, admitted ? undefined : "send");
      };
      await beforeEffect();
      assertAssistantSessionSettled(host, work);
      const finish = await assistantWorkEnding(host, work)?.begin("stopped", { beforeEffect, assertCurrent: current });
      admitted = true;
      if (work.executor.kind === "plugin") {
        const executor = await ports.executor(work, { beforeEffect, assert_authority_current: current });
        await executor.control(work.executor.session_id!, binding.run.run_id, { kind: "stop" });
      } else {
        const adapter = host.adapter("prologue");
        if (!adapter.withEffect) throw assistantErrors.unsupported("当前运行时不能核对原执行的停止边界");
        // A later personal Send changes the Work revision before its first await. The old stop then fails at the SDK write.
        current();
        revision = ports.store.update(ports.actorId, work.work_id, revision, { continuation_hold: "stopped" }, false).revision;
        await adapter.withEffect({ beforeEffect, assert_current: current }, async () => { await beforeEffect(); current(); await stopOriginalRun(adapter, binding.run, { beforeEffect, assertCurrent: current }); });
        // The stop has already been admitted. Session-wide cleanup must still belong to this same input generation.
        if (ports.store.get(ports.actorId, work.work_id).revision === revision) {
          current(); if (work.session_id) ports.cancelSetups?.(work.session_id);
        }
        host.reviews.cancelPending(binding.run.run_id, "这一轮已停止");
      }
      await finish?.();
    } finally { release(); endAccess(); }
    return;
  }
  if (work.executor.kind === "plugin") {
    const session = work.executor.session_id;
    if (!session && closeForDeletion) return;
    const release = ports.store.permissionTransitions.holdWorkPermissions([work.work_id], control.kind === "stop");
    const effect = assistantEndControl(ports.store, work, caller);
    try {
      const executor = await ports.executor(work, { beforeEffect: async () => { await effect.beforeEffect(); }, assert_authority_current: effect.assertCurrent });
      const latest = session ? (await executor.read(session, 1)).runs.at(-1) : undefined;
      if (!latest || isTerminalAgentPhase(latest.phase)) {
        if (closeForDeletion) return;
        throw assistantErrors.state("这项工作当前没有在执行的一轮");
      }
      await executor.control(session!, latest.ref.run_id, { kind: control.kind });
    } finally { release(); }
    return;
  }
  // Prevent a prepared automatic start while validating; an invalid request changes no durable work or setup.
  const children = control.kind === "stop" ? ports.store.delegatedBy(ports.actorId, work, "any") : [];
  const endAccess = ports.store.permissionTransitions.holdWorkPermissions([work.work_id, ...children.map(child => child.work_id)], control.kind === "stop");
  const release = ports.continuations.blockStart(work.work_id);
  try {
    const host = await ports.host();
    for (const member of [work, ...children]) assertAssistantSessionSettled(host, member);
    const latest = await ports.latest(host, work);
    const wait = await ports.continuations.view(work);
    const rounds = await Promise.all(children.map(async child => ({ child, run: await ports.latest(host, child), wait: await ports.continuations.view(child) })));
    for (const member of [work, ...children]) assertAssistantSessionSettled(host, member);
    const running = latest && !isTerminalAgentPhase(latest.phase);
    const activeChildren = rounds.filter(item => item.wait?.wait || item.run && !isTerminalAgentPhase(item.run.phase));
    const ending = control.kind === "stop" ? assistantWorkEnding(host, work) : undefined;
    const retry = (await ending?.read())?.lifecycle === "ending";
    if (control.kind !== "stop") await assistantWorkEnding(host, work)?.read().then(state => {
      if (state?.lifecycle === "ending" || state?.lifecycle === "ended") throw assistantErrors.state("原工作已经停止，请先重新授权");
    });
    if (!closeForDeletion && !running && !wait?.wait && !activeChildren.length && !retry && !(control.kind === "stop" && (ports.delegations.isHandingBack(work.work_id) || work.step_gate))) throw assistantErrors.state("这项工作当前没有在执行或等待的工作");
    const finish = control.kind === "stop" ? await beginAssistantWorkEnds(host, ports.store, [work, ...children], closeForDeletion ? "deleted" : "stopped", caller) : undefined;
    const effect = assistantEndControl(ports.store, work, caller);
    await effect.beforeEffect(); effect.assertCurrent();
    ports.continuations.invalidateInput(work.work_id);
    // A stop also takes back the step held for the person's yes (PWA-156): nothing asks any more.
    if (control.kind === "stop" && work.step_gate) ports.store.update(ports.actorId, work.work_id, null, { step_gate: undefined }, false);
    if (running || wait?.wait) ports.store.update(ports.actorId, work.work_id, null, { continuation_hold: control.kind === "resume" ? undefined : control.kind === "pause" ? "paused" : "stopped" }, false);
    if (control.kind === "stop") {
      await ports.delegations.hold(work, effect);
      await effect.beforeEffect(); effect.assertCurrent();
      if (work.session_id && !control.keep_connections) ports.cancelSetups?.(work.session_id);
      if (wait?.wait) await ports.continuations.withdraw(work, "用户停止了这项工作", effect);
    }
    if (running) {
      if (control.kind === "stop" && ending) await stopOriginalRun(host.adapter(RUNTIME), latest.ref, effect);
      else { await effect.beforeEffect(); effect.assertCurrent(); await host.adapter(RUNTIME).control(latest.ref, { kind: control.kind }); }
      if (control.kind === "stop") host.reviews.cancelPending(latest.ref.run_id, "这一轮已停止");
    }
    for (const { child, run, wait: childWait } of activeChildren) {
      const childControl = assistantEndControl(ports.store, child, caller);
      await childControl.beforeEffect(); childControl.assertCurrent();
      ports.store.update(ports.actorId, child.work_id, null, { continuation_hold: "stopped" }, false);
      if (child.session_id && !(control.kind === "stop" && control.keep_connections)) ports.cancelSetups?.(child.session_id);
      if (childWait?.wait) await ports.continuations.withdraw(child, "委托它的工作已停止", childControl);
      if (run && !isTerminalAgentPhase(run.phase)) {
        if (assistantWorkEnding(host, child)) await stopOriginalRun(host.adapter(RUNTIME), run.ref, childControl);
        else { await childControl.beforeEffect(); childControl.assertCurrent(); await host.adapter(RUNTIME).control(run.ref, { kind: "stop" }); }
        host.reviews.cancelPending(run.ref.run_id, "委托它的工作已停止");
      }
    }
    if (control.kind === "stop" && control.keep_connections) for (const kept of [work, ...activeChildren.map(item => item.child)]) {
      if (kept.session_id) await ports.retainSetups?.(kept.session_id, assistantEndControl(ports.store, kept, caller));
    }
    if (closeForDeletion) {
      for (const member of [work, ...children]) await closeForDeletion(member, host, assistantEndControl(ports.store, member, caller));
    }
    for (const member of [work, ...children]) assertAssistantSessionSettled(host, member);
    await finish?.();
    if (control.kind === "resume") ports.continuations.attach();
  } finally { release(); endAccess(); }
}
