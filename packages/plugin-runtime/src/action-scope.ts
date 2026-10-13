import { AsyncLocalStorage } from "node:async_hooks";
import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The action a Plugin's code is running for, as the Runtime knows it: which installation, which declaration, and the call's own
 * control (its signal and `beforeEffect`). A Plugin never passes any of this to a service; the service asks here, so a call
 * cannot be made to look like it comes from an action it does not run in.
 */
export interface PluginActionScope {
  readonly install_id: string;
  readonly definition: ActionDefinition;
  readonly caller: ActionExecutionContext;
}

const running = new AsyncLocalStorage<PluginActionScope>();

/** Runs a Plugin's action handler inside its scope. The scope follows the handler's promises and timers, and ends with nothing: the call's `beforeEffect` is what says the action is over. */
export function runInPluginAction<T>(scope: PluginActionScope, handle: () => T): T {
  return running.run(scope, handle);
}

/** The action the calling code is running for, or nothing outside every action (`start`, a route, a timer set up elsewhere). */
export function currentPluginAction(): PluginActionScope | undefined {
  return running.getStore();
}
