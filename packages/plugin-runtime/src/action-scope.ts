import { AsyncLocalStorage } from "node:async_hooks";
import { ActionError, requireSynchronous, type ActionDefinition, type ActionExecutionContext, type ActionCallContext, type ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * One running instance of a Plugin. The Home half and the project half of a dual-instance plugin share `install_id` and differ in
 * `installation_generation` (specs/dual-instance-plugins U3), so a service compares both: a handle one half holds is not the other's.
 */
export interface PluginInstance {
  readonly install_id: string;
  readonly installation_generation: string;
}

/** Whether a call's scope runs for this very instance: the same installation and the same generation. */
export function inPluginInstance(scope: PluginInstance | undefined, instance: PluginInstance): boolean {
  return !!scope && scope.install_id === instance.install_id && scope.installation_generation === instance.installation_generation;
}

/**
 * The action a Plugin's code is running for, as the Runtime knows it: which instance, which declaration, and the call's own
 * control (its signal and `beforeEffect`). A Plugin never passes any of this to a service; the service asks here, so a call
 * cannot be made to look like it comes from an action it does not run in.
 */
export interface PluginActionScope extends PluginInstance {
  readonly definition: ActionDefinition;
  readonly caller: ActionExecutionContext;
  /** Where this call stands in the order this process began calls in (`lastBegunPluginInvocation`). */
  readonly begun: number;
  /**
   * Set once a final authority check of this call passed: its own `beforeEffect` returned, or the Host saw one right before a write
   * (`markPluginActionChecked`). From then on the call may keep a job (PG-038). Work that carries the call on shares it.
   */
  readonly checked?: { passed: boolean };
}

interface PluginSceneScope extends PluginInstance {
  readonly scene: ActionSceneDefinition;
  readonly read_only: boolean;
  readonly caller: ActionCallContext;
  readonly begun: number;
}

/**
 * A job an activation keeps (`services.background.keep`, PG-038). Its caller is the installation itself in the job's project, with the
 * job's own lifetime and checks: it names neither the call that kept the job nor that call's audience.
 */
interface PluginJobScope extends PluginInstance {
  readonly job: string;
  readonly caller: ActionCallContext;
  readonly begun: number;
}

type PluginInvocationScope = PluginActionScope | PluginSceneScope | PluginJobScope;
const running = new AsyncLocalStorage<PluginInvocationScope>();
let lastBegun = 0;

/**
 * The place of the last call begun so far: every call begun later has a greater `begun`. A background job keeps the place of the
 * action that accepted it, and a call made inside another one (a nested action, a scene its handler asks for) the place of the call
 * it is part of. A service that must refuse whatever was already under way at some moment (the library of a project being deleted)
 * takes this then and refuses every scope whose `begun` is not greater.
 */
export function lastBegunPluginInvocation(): number {
  return lastBegun;
}

const place = (begun: number | undefined) => begun ?? running.getStore()?.begun ?? ++lastBegun;

/**
 * A route an activation offers is a call of its own (BL-403), with no caller of its own for a service to ask: `currentPluginInvocation`
 * still reads it as outside every action, and only `insideOpenPluginCall` sees it. It is open until its handler settles or the
 * activation that offered it is withdrawn (`endPluginRoute`), whichever comes first.
 */
export interface PluginRouteCall {
  readonly route_id: string;
}
const routes = new AsyncLocalStorage<PluginRouteCall>();

/** Calls whose handler has returned, thrown or settled (`pluginInvocationOpen`), and routes ended before theirs did. */
const ended = new WeakSet<object>();

/** Runs `handle` in `scope`; once what it returned settles, the call is over for whatever it left running. */
function runOpen<S extends object, T>(store: AsyncLocalStorage<S>, scope: S, handle: () => T): T {
  const end = () => { ended.add(scope); };
  let result: T;
  try { result = store.run(scope, handle); } catch (error) { end(); throw error; }
  if (typeof (result as { then?: unknown } | null | undefined)?.then === "function") void (result as PromiseLike<unknown>).then(end, end);
  else end();
  return result;
}

/**
 * Whether the call a scope belongs to is still under way: its handler has not yet returned or settled, so whoever called it hears
 * what its code does. A timer or a listener set up during a call keeps the call's scope after the call ended (BL-411).
 */
export function pluginInvocationOpen(scope: PluginInvocationScope): boolean {
  return !ended.has(scope);
}

/** Runs a route's handler as the call `route` (`PluginRouteCall`). */
export function runInPluginRoute<T>(route: PluginRouteCall, handle: () => T): T {
  return runOpen(routes, route, handle);
}

/** Ends the call `route` before its handler settles: the activation that offered the route was withdrawn. */
export function endPluginRoute(route: PluginRouteCall): void {
  ended.add(route);
}

/**
 * Whether the calling code runs for a call still under way: an action, scene or job whose handler has not yet settled
 * (`pluginInvocationOpen`), or a route that is still open (`PluginRouteCall`), whichever instance's it is.
 */
export function insideOpenPluginCall(): boolean {
  const scope = running.getStore(), route = routes.getStore();
  return (!!scope && !ended.has(scope)) || (!!route && !ended.has(route));
}

/** Scene callbacks retain their real declaration and control, never an invented action. */
export function runInPluginScene<T>(scope: Omit<PluginSceneScope, "begun">, handle: () => T): T {
  return runOpen(running, { ...scope, begun: place(undefined) }, handle);
}

/** Common authority for services and nested calls, whether the caller is an action or a scene callback. */
export function currentPluginInvocation(): PluginInvocationScope | undefined {
  return running.getStore();
}

/** Only the captured Runtime context and declared callback purpose determine this narrowing. */
export function pluginInvocationReadOnly(scope: PluginInvocationScope | undefined): true | undefined {
  return scope && (scope.caller.query_only || scope.caller.read_only_effects || ("scene" in scope && scope.read_only)
    || ("definition" in scope && scope.definition.operation === "query")) ? true : undefined;
}

/**
 * Runs a Plugin's action handler inside its scope. The scope follows the handler's promises and timers, and its authority ends with
 * nothing: the call's `beforeEffect` is what says the action is over (`pluginInvocationOpen` only tells whether the handler still
 * runs). A call begun outside every other one gets the next place in the order; work that carries on an accepted call (a
 * background job) passes that call's `begun` along.
 */
export function runInPluginAction<T>(scope: Omit<PluginActionScope, "begun"> & { readonly begun?: number }, handle: () => T): T {
  return runOpen(running, { ...scope, begun: place(scope.begun) }, handle);
}

/** Runs a job's work in its own scope: services ask the job's checks, never those of the call that kept it. */
export function runInPluginJob<T>(scope: Omit<PluginJobScope, "begun"> & { readonly begun?: number }, handle: () => T): T {
  return runOpen(running, { ...scope, begun: place(scope.begun) }, handle);
}

/**
 * Runs what the Runtime does on its own behalf (starting or stopping a Plugin, delivering an event or an input change) outside
 * every action and route. Otherwise it keeps the scope of whichever call set it off: a subscriber would answer to the publisher's
 * caller, and a timer set up in a lazily started Plugin's `start` would answer to it for good.
 */
export function outsidePluginAction<T>(run: () => T): T {
  return running.exit(() => routes.exit(run));
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
 * caller of its own. `instance` is the instance the service writes for: inside another installation's action, or one of the other
 * half of a dual-instance plugin, that action's caller never asked this one to write, so the write is refused. Inside a job
 * (`runInPluginJob`) the job's own checks are asked. Outside every action and job (`start`, a route, a timer set up there) there is
 * no caller to ask, and the installation's live grants, which each service checks itself, decide alone.
 */
export function assertPluginActionCurrent(instance: PluginInstance): void {
  const scope = currentPluginInvocation();
  if (!scope) return;
  if (pluginInvocationReadOnly(scope)) throw new ActionError("actions.forbidden", "只读场景不能写入业务记录");
  assertCapturedPluginActionCurrent(scope, instance);
  markPluginActionChecked(scope);
}

/**
 * A nested call retains the original invocation's authority; query-only narrowing travels separately to its dispatcher. A model
 * answer the call was handed is checked again here too (`holdPluginModelResult`): what the call writes or asks for next may rest on it.
 */
export function assertCapturedPluginActionCurrent(scope: PluginInvocationScope | undefined, instance: PluginInstance): void {
  if (!scope) return;
  if (!inPluginInstance(scope, instance)) throw new ActionError("actions.forbidden", "这次写入属于另一个插件实例，不属于正在运行的动作");
  scope.caller.signal?.throwIfAborted();
  requireSynchronous(scope.caller.assert_authority_current?.(), "最终授权检查必须同步完成");
  scope.caller.signal?.throwIfAborted();
  assertHeldPluginModelResults(heldKey(scope));
}

/**
 * Each model answer handed to a call, as the check that it may still be committed (`PluginModelResult.validateResult`). Kept under
 * the call's `checked` record where it has one, which work that carries the call on shares, else under the scope itself.
 */
const heldModelResults = new WeakMap<object, Array<() => void>>();
const heldKey = (scope: PluginInvocationScope): object => ("checked" in scope && scope.checked) || scope;

/**
 * Holds a model answer the model service handed to `scope` (PG-047): from then on every check the platform makes for the call
 * (`assertCapturedPluginActionCurrent`, so every write through a platform service and every nested call) and the call's own
 * `beforeEffect` returning (`pluginActionBeforeEffect`) run `validate` first, so an answer whose call or model binding is no
 * longer current is committed through none of them, whether the plugin checked it or not.
 */
export function holdPluginModelResult(scope: PluginActionScope, validate: () => void): void {
  const key = heldKey(scope), held = heldModelResults.get(key);
  if (held) held.push(validate); else heldModelResults.set(key, [validate]);
}

function assertHeldPluginModelResults(key: object): void {
  for (const validate of heldModelResults.get(key) ?? []) validate();
}

/**
 * The `beforeEffect` a plugin's action handler is given: the call's own, and once it returns, every model answer the call holds
 * checked again (`holdPluginModelResult`). Returning is one way the call passes its last authority check (`checked`).
 */
export function pluginActionBeforeEffect(before: () => Promise<void>, checked: { passed: boolean }): () => Promise<void> {
  return async () => {
    await before();
    assertHeldPluginModelResults(checked);
    checked.passed = true;
  };
}

/**
 * Notes that the call passed its last authority check (`PluginActionScope.checked`). Only the Host says so, and only once something
 * went out: a service's check right before its write (`assertPluginActionCurrent`), or a command the call made (a nested action, a
 * Host capability) that returned. The check a nested call makes at its entry is not one: the kernel asks the same function there
 * and before the effect alike, so the Host notes the command's answer, not its checks.
 */
export function markPluginActionChecked(scope: PluginInvocationScope | undefined): void {
  if (scope && "checked" in scope && scope.checked) scope.checked.passed = true;
}

/** Whether this call passed a final authority check (`PluginActionScope.checked`). */
export function pluginActionChecked(scope: PluginActionScope): boolean {
  return scope.checked?.passed === true;
}
