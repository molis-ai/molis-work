import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { isTerminalAgentPhase, type AgentActionReviewControl, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantControl } from "@molis-ai/molis-work-contracts/services/assistant";
import type { WorkExecutor } from "./assistant-executor.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import type { AssistantContinuations } from "./assistant-continuations.js";
import type { AssistantDelegations } from "./assistant-delegation.js";
import { assistantErrors } from "./assistant-errors.js";
import { assistantEndControl, assistantWorkEnding, beginAssistantWorkEnds, stopOriginalRun } from "./assistant-work-permissions.js";
import { RUNTIME } from "./assistant-service-shared.js";

/** Controls both a live round and a parked work. Stopping a wait does not pretend its already committed effects vanished. */
export async function controlAssistantWork(work: StoredWork, control: Exclude<AssistantControl, { kind: "withdraw" }>, ports: {
  actorId: string; store: AssistantStore; continuations: AssistantContinuations; delegations: AssistantDelegations;
  host(): Promise<AgentHost>; executor(work: StoredWork): Promise<WorkExecutor>;
  latest(host: AgentHost, work: StoredWork): Promise<AgentRunView | null>;
  cancelSetups?(sessionId: string): void;
  retainSetups?(sessionId: string): Promise<void>;
}, caller?: AgentActionReviewControl): Promise<void> {
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
  const children = control.kind === "stop" ? ports.store.delegatedBy(ports.actorId, work, "any") : [];
  const endAccess = ports.store.holdWorkPermissions([work.work_id, ...children.map(child => child.work_id)]);
  const release = ports.continuations.blockStart(work.work_id);
  try {
    const host = await ports.host(), latest = await ports.latest(host, work);
    const wait = await ports.continuations.view(work);
    const rounds = await Promise.all(children.map(async child => ({ child, run: await ports.latest(host, child), wait: await ports.continuations.view(child) })));
    const running = latest && !isTerminalAgentPhase(latest.phase);
    const activeChildren = rounds.filter(item => item.wait?.wait || item.run && !isTerminalAgentPhase(item.run.phase));
    const ending = control.kind === "stop" ? assistantWorkEnding(host, work) : undefined;
    const retry = (await ending?.read())?.lifecycle === "ending";
    if (!running && !wait?.wait && !activeChildren.length && !retry && !(control.kind === "stop" && ports.delegations.isHandingBack(work.work_id))) throw assistantErrors.state("这项工作当前没有在执行或等待的工作");
    const finish = control.kind === "stop" ? await beginAssistantWorkEnds(host, ports.store, [work, ...children], "stopped", caller) : undefined;
    const effect = assistantEndControl(ports.store, work, caller);
    await effect.beforeEffect(); effect.assertCurrent();
    ports.continuations.invalidateInput(work.work_id);
    if (running || wait?.wait || ending) ports.store.update(ports.actorId, work.work_id, null, { continuation_hold: control.kind === "resume" ? undefined : control.kind === "pause" ? "paused" : "stopped" }, false);
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
      await effect.beforeEffect(); effect.assertCurrent();
      if (kept.session_id) await ports.retainSetups?.(kept.session_id);
    }
    await finish?.();
    if (control.kind === "resume") ports.continuations.attach();
  } finally { release(); endAccess(); }
}
