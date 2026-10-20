import { AsyncLocalStorage } from "node:async_hooks";
import { ActionError, requireSynchronous, type ActionDefinition, type ActionExecutionContext, type ActionCallContext, type ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

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

export interface PluginSceneScope {
  readonly install_id: string;
  readonly scene: ActionSceneDefinition;
  readonly read_only: boolean;
  readonly caller: ActionCallContext;
}

export type PluginInvocationScope = PluginActionScope | PluginSceneScope;
const running = new AsyncLocalStorage<PluginInvocationScope>();

/** Scene callbacks retain their real declaration and control, never an invented action. */
export function runInPluginScene<T>(scope: PluginSceneScope, handle: () => T): T {
  return running.run(scope, handle);
}

/** Common authority for services and nested calls, whether the caller is an action or a scene callback. */
export function currentPluginInvocation(): PluginInvocationScope | undefined {
  return running.getStore();
}

/** Only the captured Runtime context and declared callback purpose determine this narrowing. */
export function pluginInvocationReadOnly(scope: PluginInvocationScope | undefined): true | undefined {
  return scope && (scope.caller.query_only || scope.caller.read_only_effects || ("scene" in scope && scope.read_only)) ? true : undefined;
}

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
  const scope = running.getStore();
  return scope && "definition" in scope ? scope : undefined;
}

/**
 * Asked by a service right before it writes for a Plugin: the original caller of the action that code runs for must still be
 * current, its call not cancelled and its authority not revoked or moved to another provider. The answer is synchronous, so
 * nothing runs between it and the write; a `beforeEffect` the Plugin hands the service only waits, and the Plugin passes no
 * caller of its own. `installId` is the installation the service writes for: inside another installation's action that action's
 * caller never asked this one to write, so the write is refused. Outside every action (`start`, a route, a timer set up there)
 * there is no caller to ask, and the installation's live grants, which each service checks itself, decide alone.
 */
export function assertPluginActionCurrent(installId: string): void {
  const scope = currentPluginInvocation();
  if (!scope) return;
  if (pluginInvocationReadOnly(scope)) throw new ActionError("actions.forbidden", "只读场景不能写入业务记录");
  assertCapturedPluginActionCurrent(scope, installId);
}

/** A nested call retains the original invocation's authority; query-only narrowing travels separately to its dispatcher. */
export function assertCapturedPluginActionCurrent(scope: PluginInvocationScope | undefined, installId: string): void {
  if (!scope) return;
  if (scope.install_id !== installId) throw new ActionError("actions.forbidden", "这次写入属于另一个插件安装，不属于正在运行的动作");
  scope.caller.signal?.throwIfAborted();
  requireSynchronous(scope.caller.assert_authority_current?.(), "最终授权检查必须同步完成");
  scope.caller.signal?.throwIfAborted();
}
