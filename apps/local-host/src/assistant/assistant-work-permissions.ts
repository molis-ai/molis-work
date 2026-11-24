import { isDeepStrictEqual } from "node:util";
import { isTerminalAgentPhase, type AgentActionReviewControl, type AgentRunRef, type AgentRunView, type AgentRuntimeAdapter, type AgentStartExecution } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { requireSynchronous, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { ASSISTANT_DELEGATED_ROLE_ID, ASSISTANT_MAIN_ROLE_ID, ASSISTANT_ROLE_ID } from "./assistant-agent.js";
import { ownerOf } from "./assistant-round-start.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { assistantErrors } from "./assistant-errors.js";
import { RUNTIME, sessionRef } from "./assistant-service-shared.js";

/** The Assistant is a Host service with a fixed built-in identity. Plugin executors keep their own installation owner. */
export function assistantWorkPermission(work: StoredWork): AgentStartExecution["delegation"] {
  if (work.executor.kind !== "assistant" || work.reply_target) return undefined;
  return {
    session_owner_id: ownerOf(work),
    subject: { kind: "work", work: { owner_id: ASSISTANT_PLUGIN_ID, id: work.work_id }, actor_id: work.actor_id,
      project_id: work.project_ref?.project_id ?? null, executor: { plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID,
        installation_generation: ASSISTANT_INSTALL_ID, role_id: work.delegated_by ? ASSISTANT_DELEGATED_ROLE_ID : work.main ? ASSISTANT_MAIN_ROLE_ID : ASSISTANT_ROLE_ID } },
  };
}

export function assistantWorkEnding(host: AgentHost, work: StoredWork) {
  const subject = assistantWorkPermission(work)?.subject, store = host.workDelegations?.(RUNTIME);
  if (!subject || !store) return undefined;
  return {
    read: () => store.read(subject),
    finish: (epoch: string, control: AgentActionReviewControl) => store.finishEnd(subject, epoch, control),
    async begin(reason: string, control: AgentActionReviewControl) {
      const current = await store.read(subject);
      const ending = await store.beginEnd(subject, current?.epoch ?? null, reason, control);
      return (finishControl: AgentActionReviewControl = control) => store.finishEnd(subject, ending.epoch, finishControl);
    },
  };
}

/** Refuse before the Assistant records a new draft/send or offers input to an old Run. The runtime also checks at acceptance. */
export async function holdAssistantWorkLifetime(host: AgentHost, work: StoredWork): Promise<(() => void) | undefined> {
  const subject = assistantWorkPermission(work)?.subject, store = host.workDelegations?.(RUNTIME);
  return subject && store ? store.holdWorkLifetime(subject) : undefined;
}

export function assertAssistantSessionSettled(host: AgentHost, work: StoredWork): void {
  if (work.executor.kind === "assistant" && work.session_id && host.adapter(RUNTIME).sessionTransitionPending?.(sessionRef(work))) {
    throw assistantErrors.state("原轮仍在保存启动或恢复结果，请稍后重试");
  }
}

/** The runtime's final pending/SDK commit still checks this call after asynchronous reference reads. */
export async function inAssistantWorkEffect<T>(adapter: AgentRuntimeAdapter, control: AgentActionReviewControl, operation: () => Promise<T>): Promise<T> {
  await control.beforeEffect(); control.assertCurrent();
  if (adapter.withEffect) return adapter.withEffect({ beforeEffect: async () => { await control.beforeEffect(); }, assert_current: control.assertCurrent }, operation);
  return operation();
}

/** The first failed child leaves a durable ending to resume, with no other child still writing in the background. */
export async function beginAssistantWorkEnds(host: AgentHost, store: AssistantStore, works: readonly StoredWork[], reason: string, caller?: AgentActionReviewControl) {
  const endings: Array<{ readonly work: StoredWork; readonly finish: (control?: AgentActionReviewControl) => Promise<unknown> }> = [];
  for (const work of works) {
    const finish = await assistantWorkEnding(host, work)?.begin(reason, assistantEndControl(store, work, caller));
    if (finish) endings.push({ work, finish });
  }
  return async (withCaller = true) => {
    for (const { work, finish } of endings) {
      await finish(withCaller ? undefined : assistantEndControl(store, work));
    }
  };
}

export function assistantEndControl(store: Pick<AssistantStore, "get">, work: StoredWork, caller?: AgentActionReviewControl): AgentActionReviewControl {
  const assertCurrent = () => {
    caller?.assertCurrent();
    const current = store.get(work.actor_id, work.work_id);
    if (!isDeepStrictEqual(current.executor, work.executor) || ownerOf(current) !== ownerOf(work)
      || current.session_id !== work.session_id || current.delegated_by?.graph_id !== work.delegated_by?.graph_id
      || current.delegated_by?.node_id !== work.delegated_by?.node_id) throw assistantErrors.state("原工作的执行方已经变化");
  };
  return { assertCurrent, beforeEffect: async () => { await caller?.beforeEffect(); assertCurrent(); } };
}

export function assistantPermissionCaller(caller: ActionExecutionContext, page?: AgentActionReviewControl): AgentActionReviewControl {
  return { beforeEffect: async () => { await caller.beforeEffect(); await page?.beforeEffect(); },
    assertCurrent: () => { caller.signal?.throwIfAborted(); requireSynchronous(caller.assert_authority_current?.()); page?.assertCurrent(); } };
}

const originalRunEnded = (view: AgentRunView): boolean =>
  isTerminalAgentPhase(view.phase) || (view.phase === "reconcile-required" && view.ended_at !== null);

/**
 * Stops an original Run and waits for its terminal receipt.
 * When `deferRunningSettlement` is true and the Run was actively executing (`phase === "running"`, e.g. unwinding an
 * in-flight tool), returns `false` after `runningWaitMs` instead of blocking the HTTP stop call for 10s, while keeping
 * its observer attached to call `onSettled` once the Run reaches a terminal phase; callers MUST NOT call `finishEnd`
 * before settlement.
 */
export async function stopOriginalRunWithSettlement(
  adapter: AgentRuntimeAdapter,
  run: AgentRunRef,
  control: AgentActionReviewControl,
  options: { readonly timeoutMs?: number; readonly deferRunningSettlement?: boolean; readonly runningWaitMs?: number; readonly onSettled?: () => void } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const deferRunning = options.deferRunningSettlement === true;
  const runningWaitMs = options.runningWaitMs ?? 50;
  const before = await adapter.read(run);
  if (originalRunEnded(before)) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  let deferred = false;
  let settledByEvent = false;
  try {
    let settle!: (completed: boolean) => void;
    let fail!: (error: Error) => void;
    let done = false;
    const notifySettled = () => {
      if (settledByEvent) return;
      settledByEvent = true;
      unsubscribe?.();
      unsubscribe = undefined;
      if (deferred) options.onSettled?.();
      else settle(true);
    };
    const waiting = new Promise<boolean>((resolve, reject) => {
      settle = (completed: boolean) => {
        if (done) return;
        done = true;
        resolve(completed);
      };
      fail = (error: Error) => {
        if (done) return;
        done = true;
        reject(error);
      };
      unsubscribe = adapter.observe(run, view => { if (originalRunEnded(view)) notifySettled(); });
    });
    await inAssistantWorkEffect(adapter, control, () => adapter.control(run, { kind: "stop" }));
    if (originalRunEnded(await adapter.read(run))) {
      notifySettled();
    } else if (!done) {
      if (deferRunning && before.phase === "running") {
        timer = setTimeout(() => {
          if (done || settledByEvent) return;
          deferred = true;
          settle(false);
        }, runningWaitMs);
      } else {
        timer = setTimeout(() => fail(assistantErrors.state("原轮停止回执尚未到达，请重试停止")), timeoutMs);
      }
    }
    const settled = await waiting;
    if (!settled && !settledByEvent && originalRunEnded(await adapter.read(run))) {
      settledByEvent = true;
      unsubscribe?.();
      unsubscribe = undefined;
      return true;
    }
    return settled;
  } finally {
    clearTimeout(timer);
    if (!deferred || settledByEvent) unsubscribe?.();
  }
}

/** A Stop acknowledgement can precede the Run's terminal event. Keep the work's ending barrier until the owner settles it. */
export async function stopOriginalRun(adapter: AgentRuntimeAdapter, run: AgentRunRef, control: AgentActionReviewControl, timeoutMs = 10_000): Promise<void> {
  await stopOriginalRunWithSettlement(adapter, run, control, { timeoutMs });
}
