import type { ActionDefinition, ActionExecutionContext, ActionResultPresentation } from "@molis-ai/molis-work-contracts/platform/actions";
import type { WorkflowContentPorts, workflowsActions } from "./actions.js";
import { advanceInstance, isActionStation, nextUpdatedAt, type WorkflowInstance, type WorkflowItemRef, type WorkflowPayload, type WorkflowStation } from "./model.js";
import { recordStoppedDelivery, type WorkflowsStore, type WorkflowsStores } from "./store.js";
import { workflowRequestId } from "./content-client.js";
import { workflowsErrors } from "./error.js";

type Input = typeof workflowsActions.continue extends ActionDefinition<infer I, unknown> ? I : never;
type Pending = NonNullable<WorkflowInstance["steps"][number]["pending"]>;
type Arrival = { payload?: WorkflowPayload; result?: unknown; result_presentation?: ActionResultPresentation; result_truncated?: true };
interface Dependencies<Reach> {
  projectId: string;
  read: WorkflowsStores["read"];
  write: WorkflowsStores["write"];
  commit<T>(caller: ActionExecutionContext, run: (store: WorkflowsStore) => T): Promise<T>;
  live(store: WorkflowsStore, id: string): WorkflowInstance;
  changed(value: { instance: WorkflowInstance }): { instance: WorkflowInstance };
  prepareHandoff(caller: ActionExecutionContext, content: WorkflowContentPorts, reach: Reach, current: WorkflowInstance, from: number, input: Input): Promise<{ stopped: WorkflowInstance } | { instance: WorkflowInstance; pending: Pending }>;
  runActionStep(caller: ActionExecutionContext, reach: Reach, current: WorkflowInstance, from: number, pending: Pending,
    target: WorkflowStation & { action: NonNullable<WorkflowStation["action"]> }, retry: boolean): Promise<{ instance: WorkflowInstance; arrived: WorkflowItemRef; arrival: Arrival }>;
}

/** One continuation owns its fixed handoff and attempt; the store's CAS, rather than a process queue, settles concurrent calls. */
export function createWorkflowContinuation<Reach>(d: Dependencies<Reach>) {
  return async (input: Input, content: WorkflowContentPorts, caller: ActionExecutionContext, reach: Reach, original: ActionExecutionContext) => {
    let current = d.read(store => d.live(store, input.id));
    if (input.updated_at !== undefined && input.updated_at !== current.updated_at) throw workflowsErrors.conflict("这一次刚被推进过，已载入最新进度");
    const from = handoffIndex(current, input.from);
    let pending = current.steps[from]!.pending;
    if (!pending) {
      const prepared = await d.prepareHandoff(caller, content, reach, current, from, input);
      if ("stopped" in prepared) return d.changed({ instance: prepared.stopped });
      ({ instance: current, pending } = prepared);
    } else if (current.chain.links[from]!.kind === "manual" && input.body !== undefined
      && ([...(input.title ?? "").trim()].slice(0, 200).join("") !== pending.output.title || (input.body ?? "").trim() !== pending.output.body)) {
      throw workflowsErrors.conflict("这一步已经在交接另一份内容，已载入最新进度");
    }
    await caller.beforeEffect();
    const target = current.chain.stations[from + 1]!;
    let arrived: WorkflowItemRef;
    let arrival: Arrival = {};
    if (isActionStation(target)) ({ instance: current, arrived, arrival } = await d.runActionStep(caller, reach, current, from, pending, target, input.retry_action === true));
    else {
      current = await d.commit(caller, store => store.saveInstance(current, withPending(current, from, { ...pending, attempted_at: new Date().toISOString() })));
      arrived = await content.receive(target.plugin, pending.output, workflowRequestId(current.instance_id, from + 1), target.content);
    }
    // Stop cancels uncommitted work. Actual returned results may settle the original attempt, never revive the run.
    await original.beforeEffect();
    const stopped = await d.write(original, store => { original.assert_authority_current?.(); original.signal?.throwIfAborted(); return recordStoppedDelivery(store, current, from, arrived, arrival); });
    if (stopped) return d.changed({ instance: stopped });
    await caller.beforeEffect();
    const { attempted_at: _attempted, attempt_error: _error, ...recorded } = pending;
    try {
      const base = current;
      return d.changed({ instance: await d.commit(caller, store => store.saveInstance(base, advanceInstance(base, from, recorded, arrived, nextUpdatedAt(base.updated_at), arrival))) });
    } catch (error) {
      await original.beforeEffect(); original.assert_authority_current?.(); original.signal?.throwIfAborted();
      const latest = d.read(store => store.instance(current.instance_id, d.projectId));
      original.assert_authority_current?.(); original.signal?.throwIfAborted();
      if (latest.steps[from]?.handoff?.key === recorded.key) return { instance: latest };
      throw error;
    }
  };
}

export const withPending = (instance: WorkflowInstance, from: number, pending: Pending): WorkflowInstance => ({ ...instance,
  steps: instance.steps.map((step, index) => index === from ? { ...step, pending } : step), updated_at: new Date().toISOString() });

export function handoffIndex(current: WorkflowInstance, raw: unknown): number {
  const from = Number(raw ?? current.current);
  if (!Number.isInteger(from) || from < 0 || from >= current.chain.links.length) throw workflowsErrors.invalid("这一步后面没有下一站");
  if (current.status !== "active") throw workflowsErrors.invalid(current.status === "done" ? "这一次已经走完" : "这一次已经结束");
  if (from !== current.current) throw workflowsErrors.conflict("这一步已经交过了");
  return from;
}
