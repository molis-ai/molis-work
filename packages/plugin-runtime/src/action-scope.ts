import { AsyncLocalStorage } from "node:async_hooks";
import { requireSynchronous, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";

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

/**
 * Runs what the Runtime does on its own behalf (starting or stopping a Plugin, delivering an event or an input change) outside
 * every action. Otherwise it keeps the scope of whichever action set it off: a subscriber would answer to the publisher's
 * caller, and a timer set up in a lazily started Plugin's `start` would answer to it for good.
 */
export function outsidePluginAction<T>(run: () => T): T {
  return running.exit(run);
}

/** The action the calling code is running for, or nothing outside every action (`start`, a route, a timer set up elsewhere). */
export function currentPluginAction(): PluginActionScope | undefined {
  return running.getStore();
}

/**
 * Asked by a service right before it writes for a Plugin: the original caller of the action that code runs for must still be
 * current, its call not cancelled and its authority not revoked or moved to another provider. The answer is synchronous, so
 * nothing runs between it and the write; a `beforeEffect` the Plugin hands the service only waits, and the Plugin passes no
 * caller of its own. Outside every action (`start`, a route, a timer set up there) there is no caller to ask, and the
 * installation's live grants, which each service checks itself, decide alone.
 */
export function assertPluginActionCurrent(): void {
  assertCapturedPluginActionCurrent(currentPluginAction());
}

/**
 * The same question for code that acts later on another's behalf: a service the Plugin called inside an action captures that
 * action's scope (`currentPluginAction()`) when it is called, and asks it here when its own write comes, which may run inside
 * another action's scope (the handler of an action it invoked). Nothing captured means the call came from outside every action.
 */
export function assertCapturedPluginActionCurrent(scope: PluginActionScope | undefined): void {
  if (!scope) return;
  scope.caller.signal?.throwIfAborted();
  requireSynchronous(scope.caller.assert_authority_current?.(), "最终授权检查必须同步完成");
}
