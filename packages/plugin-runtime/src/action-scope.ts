import { AsyncLocalStorage } from "node:async_hooks";
import { ActionError, requireSynchronous, type ActionDefinition, type ActionExecutionContext, type ActionCallContext, type ActionSceneDefinition, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * One running instance of a Plugin. The Home half and the project half of a dual-instance plugin share `install_id` and differ in
 * `installation_generation` (specs/archive/dual-instance-plugins U3), so a service compares both: a handle one half holds is not the other's.
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
  /** The original activation object, distinct even if two restored Homes have the same stored installation identifiers. */
  readonly activation?: PluginInstance;
  readonly definition: ActionDefinition;
  readonly caller: ActionExecutionContext;
  /** Where this call stands in the order this process began calls in (`lastBegunPluginInvocation`). */
  readonly begun: number;
  /**
   * Set once a final authority check of this call passed: its own `beforeEffect` returned, or the Host saw one right before a write
   * (`markPluginActionChecked`). From then on the call may keep a job (PG-038). Work that carries the call on shares it.
   */
  readonly checked?: { passed: boolean };
  /**
   * The action this handler runs, as the dispatcher resolved it for this very registration, with `direct_person_entry` when the call
   * entered here as the person's own (BL-803). The Host's action directory hands it to the targets of this handler's calls, one hop
   * only (`delegated_action`). Work that carries the call on (a background execution) does not carry it.
   */
  readonly source?: Readonly<ExactActionReference & { readonly direct_person_entry?: true }>;
}

interface PluginSceneScope extends PluginInstance {
  readonly activation: PluginInstance;
  readonly scene: ActionSceneDefinition;
  readonly read_only: boolean;
  readonly caller: ActionCallContext;
  readonly begun: number;
  /**
   * Set only when the `beforeEffect` the callback was handed returned (`pluginSceneBeforeEffect`), never by a service's own check: a
   * writable scene callback writes through a platform service only after the plugin waited for the kernel's recheck of the binding,
   * the judgment and the caller (PG-032 P4, user decision 2026-10-26). Read-only callbacks have none.
   */
  readonly effect?: { passed: boolean };
}

/**
 * A job an activation keeps (`services.background.keep`, PG-038). Its caller is the installation itself in the job's project, with the
 * job's own lifetime and checks: it names neither the call that kept the job nor that call's audience.
 */
interface PluginJobScope extends PluginInstance {
  readonly activation?: PluginInstance;
  readonly job: string;
  readonly caller: ActionCallContext;
  readonly begun: number;
  readonly permission_checks?: object;
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
  readonly instance?: PluginInstance;
  readonly caller?: { readonly locale?: string; readonly signal?: AbortSignal };
  readonly parent?: PluginInvocationScope;
}
const routes = new AsyncLocalStorage<PluginRouteCall>();
const permissionCalls = new AsyncLocalStorage<PluginInstance>();

/** Calls whose handler has returned, thrown or settled (`pluginInvocationOpen`), and routes ended before theirs did. */
const ended = new WeakSet<object>();

/** A persisted installation can have several successive activations. This check belongs to the original object. */
export function pluginActivationOpen(activation: PluginInstance): boolean {
  return !ended.has(activation);
}

export function endPluginActivation(activation: PluginInstance): void {
  ended.add(activation);
}

/** Text reads follow the innermost plugin call; an ended call still marks the boundary of an inherited page language. */
export function currentPluginTextCall() {
  const action = running.getStore(), route = routes.getStore();
  if (route && route.parent === action) {
    return pluginTextCall(route, route.instance, route.caller);
  }
  return action ? pluginTextCall(action, action.activation, action.caller) : undefined;
}

function pluginTextCall(token: object, activation: PluginInstance | undefined, caller: PluginRouteCall["caller"]) {
  const available = !caller?.signal?.aborted && (!activation || pluginActivationOpen(activation));
  const live = available && !ended.has(token);
  return { token, activation: available ? activation : undefined, available, live, locale: live ? caller?.locale : undefined };
}

/** Runs `handle` in `scope`; once what it returned settles, the call is over for whatever it left running. */
function runOpen<S extends object, T>(store: AsyncLocalStorage<S>, scope: S, handle: () => T): T {
  const end = () => { ended.add(scope); };
  let result: T;
  try { result = checkedPermissionResult(scope, store.run(scope, handle)) as T; } catch (error) { end(); throw error; }
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

/**
 * The `beforeEffect` a writable scene callback is given: the kernel's own, and once it returns the callback has passed the recheck
 * its scene's writes need (`pluginSceneEffectPassed`).
 */
export function pluginSceneBeforeEffect(before: () => Promise<void>, effect: { passed: boolean }): () => Promise<void> {
  return async () => { await before(); assertHeldPluginResults(effect); effect.passed = true; };
}

/** Whether the callback `scope` runs for is a scene callback whose `beforeEffect` already returned. */
export function pluginSceneEffectPassed(scope: PluginInvocationScope): boolean {
  return "scene" in scope && scope.effect?.passed === true;
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

/**
 * Takes the place the call about to run gets in the order, before it waits for anything: a handler that is started after an `await`
 * (`pluginActionProvider` reads the project list first) passes it to `runInPluginAction`, so the wait does not move the call past a moment
 * a service refuses everything already under way at (`lastBegunPluginInvocation`).
 */
export function reservePluginInvocationPlace(): number {
  return place(undefined);
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
  return running.exit(() => routes.exit(() => permissionCalls.exit(run)));
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
 * Asked by a service right before it reads for a Plugin, and again before it hands back what a read in another process returned
 * (BL-943, BCC-10): the original caller must still be current, as for a write, but a read-only call may read and the read does not count
 * as the write's check. Outside every action and job the installation's live grants, which each service checks itself, decide alone.
 */
export function assertPluginReadCurrent(instance: PluginInstance): void {
  const scope = currentPluginInvocation(), turn = currentTurn();
  // What the caller's checks look at (grants, the Home's catalog, a discussion's members) changes only from another request, which runs
  // in a task of its own: within one turn the first read's answer holds for the rest, and only the call's own signal is asked again.
  // A write still asks everything before every statement.
  if (scope && readCheckedIn.get(scope) === turn && inPluginInstance(scope, instance)) { scope.caller.signal?.throwIfAborted(); return; }
  assertCapturedPluginActionCurrent(scope, instance);
  if (scope) readCheckedIn.set(scope, turn);
}

const readCheckedIn = new WeakMap<PluginInvocationScope, object>();
let turn: object | undefined;

/**
 * The turn the code now running is in: the same object until the microtasks queued so far have run. Anything another request changes is
 * changed in a later turn, so a check answered in this one holds until it ends.
 */
export function currentTurn(): object {
  if (turn) return turn;
  const started = turn = {};
  queueMicrotask(() => { if (turn === started) turn = undefined; });
  return started;
}

/**
 * A nested call retains the original invocation's authority; query-only narrowing travels separately to its dispatcher. The
 * provider outcomes this call uses are checked again here too (`holdPluginResult`), before anything based on them is committed.
 */
export function assertCapturedPluginActionCurrent(scope: PluginInvocationScope | undefined, instance: PluginInstance): void {
  if (!scope) return;
  if (!inPluginInstance(scope, instance)) throw new ActionError("actions.forbidden", "这次写入属于另一个插件实例，不属于正在运行的动作");
  scope.caller.signal?.throwIfAborted();
  requireSynchronous(scope.caller.assert_authority_current?.(), "最终授权检查必须同步完成");
  scope.caller.signal?.throwIfAborted();
  assertHeldPluginResults(heldKey(scope));
}

/**
 * Each provider outcome a call uses, as the check that its provider remains current. Kept under
 * the call's `checked` record where it has one, which work that carries the call on shares, else under the scope itself.
 */
const heldResults = new WeakMap<object, Array<() => void>>();
const heldKey = (scope: object): object => {
  if ("checked" in scope && scope.checked && typeof scope.checked === "object") return scope.checked;
  if ("effect" in scope && scope.effect && typeof scope.effect === "object") return scope.effect;
  if ("permission_checks" in scope && scope.permission_checks && typeof scope.permission_checks === "object") return scope.permission_checks;
  return scope;
};
const permissionResults = new WeakMap<object, Map<string, () => void>>();

function permissionScope(instance: PluginInstance): object | undefined {
  const invocation = running.getStore(), route = routes.getStore(), call = permissionCalls.getStore();
  return inPluginInstance(invocation, instance) ? invocation : inPluginInstance(route?.instance, instance) ? route : inPluginInstance(call, instance) ? call : undefined;
}

/** A permission's producer check is captured once for this source call; later grants cannot replace it. */
export function requirePluginPermission(instance: PluginInstance, permission: string, capture: () => (() => void) | undefined): void {
  const scope = permissionScope(instance);
  // A nested action of the same instance cannot shadow the source route/SDK call's already accepted permissions.
  const route = routes.getStore(), call = permissionCalls.getStore();
  if (route && route !== scope && inPluginInstance(route.instance, instance)) assertPluginPermissionChecks(heldKey(route));
  if (call && call !== scope && inPluginInstance(call, instance)) assertPluginPermissionChecks(heldKey(call));
  if (!scope) { capture()?.(); return; }
  const key = heldKey(scope);
  assertPluginPermissionChecks(key);
  let held = permissionResults.get(key);
  const previous = held?.get(permission);
  if (previous) { previous(); return; }
  const check = capture();
  if (!check) return;
  check();
  if (!held) { held = new Map(); permissionResults.set(key, held); }
  held.set(permission, check);
  const results = heldResults.get(key);
  if (results) results.push(check); else heldResults.set(key, [check]);
}

export function assertPluginPermissionChecks(key: object): void {
  for (const check of permissionResults.get(key)?.values() ?? []) check();
}

/** The Host's original route control retains its identity and asks the active request's permission fence. */
export function assertPluginRoutePermissions(): void {
  const route = routes.getStore();
  if (route) assertPluginPermissionChecks(route);
}

function checkedPermissionResult(scope: object, result: unknown): unknown {
  const check = () => assertPluginPermissionChecks(heldKey(scope));
  if (typeof (result as { then?: unknown } | null | undefined)?.then === "function") {
    return Promise.resolve(result).then(value => { check(); return value; }, error => { check(); throw error; });
  }
  check(); return result;
}

/** An SDK consume call outside an action/scene/job/route still owns a request-local permission fence. */
export function withPluginPermissionChecks<T>(instance: PluginInstance, run: () => T): T {
  const scope = permissionScope(instance);
  if (scope) return checkedPermissionResult(scope, run()) as T;
  return runOpen(permissionCalls, { install_id: instance.install_id, installation_generation: instance.installation_generation }, run);
}

/**
 * Holds a provider's outcome for this invocation, including a pending request or an ordinary failure. Every platform write and nested
 * call (`assertCapturedPluginActionCurrent`), and the action's own `beforeEffect` returning (`pluginActionBeforeEffect`), recheck it.
 * The validator checks the producer only: calling the consumer's checks here would recurse into this same held result.
 */
export function holdPluginResult(scope: PluginInvocationScope, validate: () => void): void {
  const key = heldKey(scope), held = heldResults.get(key);
  if (held) held.push(validate); else heldResults.set(key, [validate]);
}

function assertHeldPluginResults(key: object): void {
  for (const validate of heldResults.get(key) ?? []) validate();
}

/**
 * The `beforeEffect` a plugin's action handler is given: the call's own, and once it returns, every provider outcome the call holds
 * checked again (`holdPluginResult`). Returning is one way the call passes its last authority check (`checked`).
 */
export function pluginActionBeforeEffect(before: () => Promise<void>, checked: { passed: boolean }): () => Promise<void> {
  return async () => {
    await before();
    assertHeldPluginResults(checked);
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
