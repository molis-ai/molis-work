import type {MolisWorkProjectRuntime} from '../project-host.js';
import type {LocalHostProjectReference} from '@molis-ai/molis-work-contracts/platform/app-host';
import {InteractionObserver,goalActionObservation} from './observer.js';
import type { ActionDefinition, BoundActionClient } from '@molis-ai/molis-work-contracts/platform/actions';

/** Preserve the Web observation channel while the actual call uses the shared action client. */
export function observedWebGoalsActions(runtime: MolisWorkProjectRuntime, reference: LocalHostProjectReference,
 actions: BoundActionClient): BoundActionClient {
 return {
  discover: () => actions.discover(),
  async invoke<Input, Output>(definition: ActionDefinition<Input, Output>, input: Input): Promise<Output> {
   const observed = goalActionObservation(definition, input, reference.board_id, { actor_id: 'web-user', actor_kind: 'user', audience: 'user' });
   if (!observed) return actions.invoke(definition, input);
   runtime.interactionObserver ??= new InteractionObserver(runtime.store, runtime.coordinator, reference.board_id, reference.project_id);
   const observer = runtime.interactionObserver;
   const ticket = observer.before(observed.capability, observed.input, 'web.goal-events.v1');
   let result: Output;
   try { result = await actions.invoke(definition, input); }
   catch (error) { observer.after(ticket, error, true); throw error; }
   observer.after(ticket, result, false);
   return result;
  },
 };
}
