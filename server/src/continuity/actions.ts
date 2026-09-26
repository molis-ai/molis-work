import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ActionFactory, BoundActions } from "./types.js";
export const CONTINUITY_ACTIONS = [
  {capability_id:"goals.state.read",version:1,provider_id:"io.molis.work.goals"},
  {capability_id:"goals.contract.read",version:1,provider_id:"io.molis.work.goals"},
  {capability_id:"goals.progress.record",version:1,provider_id:"io.molis.work.goals"},
  {capability_id:"goals.progress.receipt",version:1,provider_id:"io.molis.work.goals"},
  {capability_id:"artifacts.read",version:1,provider_id:"io.molis.work.artifacts"},
] as const satisfies readonly ActionReference[];
export class ContinuityActions {
  constructor(readonly factory: ActionFactory) {}
  async connect(input: Parameters<ActionFactory>[0]): Promise<BoundActions> {
    input.validate(); const bound = this.factory(input);
    await bound.client.discover(bound.caller); input.validate(); return bound;
  }
  async invoke<T>(bound: BoundActions, id: typeof CONTINUITY_ACTIONS[number]["capability_id"], input: unknown): Promise<T> {
    const reference = CONTINUITY_ACTIONS.find(ref => ref.capability_id === id)!;
    await bound.caller.validate_authority?.(reference); bound.caller.signal?.throwIfAborted();
    const result = await bound.client.invoke(bound.caller, reference, input);
    await bound.caller.validate_authority?.(reference); return result as T;
  }
}
