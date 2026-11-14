import type { ActionDefinition, ActionExecutionContext, ActionResultPresentation } from "@molis-ai/molis-work-contracts/platform/actions";
import type { WorkflowContentPorts, workflowsActions } from "./actions.js";
import { advanceInstance, handoffKey, isActionStation, nextUpdatedAt, type WorkflowInstance, type WorkflowItemRef, type WorkflowPayload, type WorkflowStation } from "./model.js";
import { recordStoppedDelivery, type WorkflowsStore, type WorkflowsStores } from "./store.js";
import { workflowRequestId } from "./content-client.js";
import { workflowsErrors } from "./error.js";
import { workflowStepFact, type WorkflowStepReport } from "./observation.js";

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
  report?: WorkflowStepReport;
  prepareHandoff(caller: ActionExecutionContext, content: WorkflowContentPorts, reach: Reach, current: WorkflowInstance, from: number, input: Input): Promise<{ stopped: WorkflowInstance } | { instance: WorkflowInstance; pending: Pending }>;
  runActionStep(caller: ActionExecutionContext, reach: Reach, current: WorkflowInstance, from: number, pending: Pending,
    target: WorkflowStation & { action: NonNullable<WorkflowStation["action"]> }, retry: boolean): Promise<{ instance: WorkflowInstance; arrived: WorkflowItemRef; arrival: Arrival }>;
}

/** One continuation owns its fixed handoff and attempt; the store's CAS, rather than a process queue, settles concurrent calls. */
export function createWorkflowContinuation<Reach>(d: Dependencies<Reach>) {
  return async (input: Input, content: WorkflowContentPorts, caller: ActionExecutionContext, reach: Reach, original: ActionExecutionContext) => {
    let current = d.read(store => { store.assertExecutableInstance(input.id); return d.live(store, input.id); });
    if (input.updated_at !== undefined && input.updated_at !== current.updated_at) throw workflowsErrors.conflict("这一次刚被推进过，已载入最新进度");
    const from = handoffIndex(current, input.from);
    let pending = current.steps[from]!.pending;
    if (!pending) {
      const prepared = await d.prepareHandoff(caller, content, reach, current, from, input);
      if ("stopped" in prepared) {
        const held = prepared.stopped.steps[from]?.held;
        await d.report?.(workflowStepFact(prepared.stopped, from, "refused", { kind: "judgment", actor: "judgment", key: handoffKey(current, from) }, held?.verdict ? { verdict: held.verdict } : {}));
        return d.changed({ instance: prepared.stopped });
      }
      ({ instance: current, pending } = prepared);
    } else if (current.chain.links[from]!.kind === "manual" && input.body !== undefined
      && ([...(input.title ?? "").trim()].slice(0, 200).join("") !== pending.output.title || (input.body ?? "").trim() !== pending.output.body)) {
      throw workflowsErrors.conflict("这一步已经在交接另一份内容，已载入最新进度");
    }
    await caller.beforeEffect();
    const target = current.chain.stations[from + 1]!;
    let arrived: WorkflowItemRef;
    let arrival: Arrival = {};
    const retry = input.retry_action === true;
    try {
      if (isActionStation(target)) ({ instance: current, arrived, arrival } = await d.runActionStep(caller, reach, current, from, pending, target, retry));
      else {
        current = await d.commit(caller, store => store.saveInstance(current, withPending(current, from, { ...pending, attempted_at: new Date().toISOString() })));
        arrived = await content.receive(target.plugin, pending.output, workflowRequestId(current.instance_id, from + 1), target.content);
      }
    } catch (error) {
      // Only a delivery that was sent is a failed step: one refused before it started (unconfirmed, a bad mapping) changed nothing. A call
      // that was stopped or lost its authority meanwhile reports nothing more (S-35): what it did is the exit's record of the call.
      const attempted = storedAttempt(d, current.instance_id, from);
      if (attempted?.attempted_at !== undefined && attempted.attempted_at !== pending.attempted_at && stillCurrent(original)) await d.report?.(workflowStepFact(current, from, "failed", pending,
        { ...(pending.verdict ? { verdict: pending.verdict } : {}), ...(retry ? { retry } : {}), error: attempted.attempt_error ?? (error instanceof Error ? error.message : String(error)) }));
      throw error;
    }
    // Stop cancels uncommitted work. Actual returned results may settle the original attempt, never revive the run.
    await original.beforeEffect();
    const stopped = await d.write(original, store => { original.assert_authority_current?.(); original.signal?.throwIfAborted(); return recordStoppedDelivery(store, current, from, arrived, arrival); });
    if (stopped) return d.changed({ instance: stopped });
    await caller.beforeEffect();
    const { attempted_at: _attempted, attempt_error: _error, ...recorded } = pending;
    try {
      const base = current;
      const advanced = await d.commit(caller, store => store.saveInstance(base, advanceInstance(base, from, recorded, arrived, nextUpdatedAt(base.updated_at), arrival)));
      await d.report?.(workflowStepFact(advanced, from, "succeeded", pending, { ...(recorded.verdict ? { verdict: recorded.verdict } : {}),
        ...(retry && isActionStation(target) ? { retry } : {}), ...(arrival.result_truncated ? { result_truncated: true } : {}) }));
      return d.changed({ instance: advanced });
    } catch (error) {
      await original.beforeEffect(); original.assert_authority_current?.(); original.signal?.throwIfAborted();
      const latest = d.read(store => store.instance(current.instance_id, d.projectId));
      original.assert_authority_current?.(); original.signal?.throwIfAborted();
      if (latest.steps[from]?.handoff?.key === recorded.key) return { instance: latest };
      throw error;
    }
  };
}

/** The call has not been stopped and still holds the authority it started with. */
function stillCurrent(call: ActionExecutionContext): boolean {
  if (call.signal?.aborted) return false;
  try { call.assert_authority_current?.(); return true; }
  catch { return false; /* revoked or disabled meanwhile: not current, which is the answer */ }
}

/** The attempt the store holds for step `from`, or none when the run is no longer there. */
function storedAttempt<Reach>(d: Dependencies<Reach>, instanceId: string, from: number): Pending | undefined {
  try { return d.read(store => store.instance(instanceId, d.projectId)).steps[from]?.pending; }
  catch { return undefined; /* the run was deleted under the call: there is no attempt to report */ }
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
