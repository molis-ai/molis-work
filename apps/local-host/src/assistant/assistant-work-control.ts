import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { isTerminalAgentPhase, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantControl } from "@molis-ai/molis-work-contracts/services/assistant";
import type { WorkExecutor } from "./assistant-executor.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import type { AssistantContinuations } from "./assistant-continuations.js";
import type { AssistantDelegations } from "./assistant-delegation.js";
import { assistantErrors } from "./assistant-errors.js";

/** Controls both a live round and a parked work. Stopping a wait does not pretend its already committed effects vanished. */
export async function controlAssistantWork(work: StoredWork, control: Exclude<AssistantControl, { kind: "withdraw" }>, ports: {
  actorId: string; store: AssistantStore; continuations: AssistantContinuations; delegations: AssistantDelegations;
  host(): Promise<AgentHost>; executor(work: StoredWork): Promise<WorkExecutor>;
  latest(host: AgentHost, work: StoredWork): Promise<AgentRunView | null>;
  cancelSetups?(sessionId: string): void;
  retainSetups?(sessionId: string): Promise<void>;
}): Promise<void> {
  if (!["pause", "resume", "stop"].includes(control?.kind)) throw assistantErrors.invalid("不支持的操作");
  if ("keep_connections" in control && (control.kind !== "stop" || typeof control.keep_connections !== "boolean")) throw assistantErrors.invalid("保留接入必须由停止操作明确选择");
  if (control.kind === "stop" && control.keep_connections && (work.executor.kind !== "assistant" || !ports.retainSetups)) throw assistantErrors.state("当前工作不支持停止后保留接入");
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
    if (!running && !wait?.wait && !activeChildren.length && !(control.kind === "stop" && ports.delegations.isHandingBack(work.work_id))) throw assistantErrors.state("这项工作当前没有在执行或等待的工作");
    ports.continuations.invalidateInput(work.work_id);
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
