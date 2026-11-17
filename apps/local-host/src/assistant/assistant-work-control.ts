import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { isTerminalAgentPhase, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantControl, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { WorkExecutor, ExecutorControl } from "./assistant-executor.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import type { AssistantContinuations } from "./assistant-continuations.js";
import type { AssistantDelegations } from "./assistant-delegation.js";
import { assistantErrors } from "./assistant-errors.js";
import { assertSubtaskGraph, assertSubtaskRun, assertSubtaskWork } from "./assistant-subtask-binding.js";

/** Taking back a delegation revokes admission before any graph or Run await; its produced results remain. */
export async function takeBackAssistantWork(child: StoredWork, parent: StoredWork | undefined, ports: {
  store: AssistantStore; actorId: string; host(): Promise<AgentHost>; latestRun(host: AgentHost, work: StoredWork): Promise<AgentRunView | null>;
  endOpen(work: StoredWork): Promise<void>; read(workId: string): Promise<AssistantWorkView>;
}): Promise<AssistantWorkView> {
  if (!child.delegated_by || !parent) throw assistantErrors.invalid("这不是一个子任务");
  if (child.delegated_by.taken_back_at) throw assistantErrors.invalid("这个子任务已经收回了");
  ports.store.update(ports.actorId, child.work_id, null, { delegated_by: { ...child.delegated_by, taken_back_at: new Date().toISOString() } }, false);
  await ports.endOpen(child);
  const host = await ports.host(), latest = await ports.latestRun(host, child);
  if (latest && !isTerminalAgentPhase(latest.phase)) {
    await host.adapter("prologue").control(latest.ref, { kind: "stop" });
    host.reviews.cancelPending(latest.ref.run_id, "用户把这个子任务收回了");
  }
  return ports.read(parent.work_id);
}

/** Controls both a live round and a parked work. Stopping a wait does not pretend its already committed effects vanished. */
export async function controlAssistantWork(work: StoredWork, control: Exclude<AssistantControl, { kind: "withdraw" }>, ports: {
  actorId: string; store: AssistantStore; continuations: AssistantContinuations; delegations: AssistantDelegations;
  host(): Promise<AgentHost>; executor(work: StoredWork, control?: ExecutorControl): Promise<WorkExecutor>;
  latest(host: AgentHost, work: StoredWork): Promise<AgentRunView | null>;
  cancelSetups?(sessionId: string): void;
  retainSetups?(sessionId: string): Promise<void>;
}): Promise<void> {
  if (!["pause", "resume", "stop"].includes(control?.kind)) throw assistantErrors.invalid("不支持的操作");
  if ("keep_connections" in control && (control.kind !== "stop" || typeof control.keep_connections !== "boolean")) throw assistantErrors.invalid("保留接入必须由停止操作明确选择");
  if (control.kind === "stop" && control.keep_connections && (work.executor.kind !== "assistant" || !ports.retainSetups)) throw assistantErrors.state("当前工作不支持停止后保留接入");
  if (control.subtask) {
    if (control.kind !== "stop" || control.keep_connections) throw assistantErrors.invalid("子任务只停止绑定的原执行");
    const binding = control.subtask, release = ports.continuations.blockStart(work.work_id);
    let revision = work.revision;
    const current = () => {
      const own = assertSubtaskWork(ports.store, ports.actorId, binding);
      if (own.revision !== revision) throw assistantErrors.stale("原工作在停止提交前已改变，请读取后再操作");
    };
    try {
      const host = await ports.host();
      const beforeEffect = async () => {
        current();
        await assertSubtaskGraph(host.adapter("prologue"), work, ports.store.get(ports.actorId, binding.parent_work_id));
        const latest = work.executor.kind === "plugin" ? (await (await ports.executor(work)).read(work.executor.session_id!, 1)).runs.at(-1)
          : await ports.latest(host, work);
        current(); assertSubtaskRun(binding, latest, "send");
      };
      await beforeEffect();
      if (work.executor.kind === "plugin") {
        const executor = await ports.executor(work, { beforeEffect, assert_authority_current: current });
        await executor.control(work.executor.session_id!, binding.run.run_id, { kind: "stop" });
      } else {
        const adapter = host.adapter("prologue");
        if (!adapter.withEffect) throw assistantErrors.unsupported("当前运行时不能核对原执行的停止边界");
        // A later personal Send changes the Work revision before its first await. The old stop then fails at the SDK write.
        current();
        revision = ports.store.update(ports.actorId, work.work_id, revision, { continuation_hold: "stopped" }, false).revision;
        await adapter.withEffect({ beforeEffect, assert_current: current }, async () => { await beforeEffect(); current(); await adapter.control(binding.run, { kind: "stop" }); });
        // The stop has already been admitted. Session-wide cleanup must still belong to this same input generation.
        if (ports.store.get(ports.actorId, work.work_id).revision === revision) {
          current(); if (work.session_id) ports.cancelSetups?.(work.session_id);
        }
        host.reviews.cancelPending(binding.run.run_id, "这一轮已停止");
      }
    } finally { release(); }
    return;
  }
  if (work.executor.kind === "plugin") {
    const executor = await ports.executor(work);
    const latest = work.executor.session_id ? (await executor.read(work.executor.session_id, 1)).runs.at(-1) : undefined;
    if (!latest || isTerminalAgentPhase(latest.phase)) throw assistantErrors.state("这项工作当前没有在执行的一轮");
    await executor.control(work.executor.session_id!, latest.ref.run_id, { kind: control.kind }); return;
  }
  // Prevent a prepared automatic start while validating; an invalid request changes no durable work or setup.
  const release = ports.continuations.blockStart(work.work_id);
  try {
    const host = await ports.host(), latest = await ports.latest(host, work);
    const wait = await ports.continuations.view(work);
    const children = control.kind === "stop" ? await Promise.all(ports.store.delegatedBy(ports.actorId, work, "any")
      .map(async child => ({ child, run: await ports.latest(host, child).catch(() => null), wait: await ports.continuations.view(child) }))) : [];
    const running = latest && !isTerminalAgentPhase(latest.phase);
    const activeChildren = children.filter(item => item.wait?.wait || item.run && !isTerminalAgentPhase(item.run.phase));
    if (!running && !wait?.wait && !activeChildren.length && !(control.kind === "stop" && (ports.delegations.isHandingBack(work.work_id) || work.step_gate))) throw assistantErrors.state("这项工作当前没有在执行或等待的工作");
    ports.continuations.invalidateInput(work.work_id);
    // A stop also takes back the step held for the person's yes (PWA-156): nothing asks any more.
    if (control.kind === "stop" && work.step_gate) ports.store.update(ports.actorId, work.work_id, null, { step_gate: undefined }, false);
    if (running || wait?.wait) ports.store.update(ports.actorId, work.work_id, null, { continuation_hold: control.kind === "resume" ? undefined : control.kind === "pause" ? "paused" : "stopped" }, false);
    if (control.kind === "stop") {
      await ports.delegations.hold(work);
      if (work.session_id && !control.keep_connections) ports.cancelSetups?.(work.session_id);
      if (wait?.wait) await ports.continuations.withdraw(work, "用户停止了这项工作");
    }
    if (running) {
      await host.adapter("prologue").control(latest.ref, { kind: control.kind });
      if (control.kind === "stop") host.reviews.cancelPending(latest.ref.run_id, "这一轮已停止");
    }
    for (const { child, run, wait: childWait } of activeChildren) {
      ports.store.update(ports.actorId, child.work_id, null, { continuation_hold: "stopped" }, false);
      if (child.session_id && !(control.kind === "stop" && control.keep_connections)) ports.cancelSetups?.(child.session_id);
      if (childWait?.wait) await ports.continuations.withdraw(child, "委托它的工作已停止");
      if (run && !isTerminalAgentPhase(run.phase)) {
        await host.adapter("prologue").control(run.ref, { kind: "stop" }).catch(() => undefined);
        host.reviews.cancelPending(run.ref.run_id, "委托它的工作已停止");
      }
    }
    if (control.kind === "stop" && control.keep_connections) for (const kept of [work, ...activeChildren.map(item => item.child)]) {
      if (kept.session_id) await ports.retainSetups?.(kept.session_id);
    }
    if (control.kind === "resume") ports.continuations.attach();
  } finally { release(); }
}
