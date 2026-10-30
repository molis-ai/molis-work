import { AsyncLocalStorage } from "node:async_hooks";
import { requireSynchronous, type ActionCallContext, type ActionExecutionContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";
import { currentCallId, insideHandler, newCallId, withCallId, withCallIdSync } from "./call-scope.js";

/** One call as the host sees it: the caller's context, plus the number of the operation it belongs to. */
export type CallContext = ActionCallContext & { readonly call_id: string };
/** What was called: the action's own names, or only the caller's reference when no action of the caller's project matches it. */
export interface CallDescription extends ActionReference {
  readonly operation: string;
  readonly title: string;
  readonly provider_title: string;
}
/** How a call ended. `refused`: it was turned away before its handler ran, so nothing was done. */
export type CallOutcome = { readonly ok: true } | { readonly ok: false; readonly code?: string; readonly message: string; readonly refused?: true };
/** Told once per call, never the input or the result. A failing hook never changes the call. */
export type CallSettled = (context: CallContext, action: CallDescription, outcome: CallOutcome) => void;

/** No asynchronous policy may run after this check and before the owner's synchronous effect. */
export function assertCurrentAuthority(context: ActionCallContext, reference?: ActionReference, requiredPermissions?: readonly string[]): void {
  requireSynchronous(context.assert_authority_current?.(reference, requiredPermissions), "最终授权检查必须同步完成");
}

/** Preserve the dispatcher's own registration/lifetime when this context reaches a nested call. */
export function effectGuard(context: ActionCallContext, reference: ActionReference, permissions: readonly string[], assertCurrent: () => void,
  beforeEffect?: (context: ActionCallContext, reference: ActionReference) => void | Promise<void>): Pick<ActionExecutionContext, "beforeEffect" | "assert_authority_current"> {
  const assertAuthority = (target?: ActionReference, requiredPermissions?: readonly string[]) => {
    assertCurrent();
    assertCurrentAuthority(context, reference, requiredPermissions ? [...new Set([...permissions, ...requiredPermissions])] : permissions);
    if (target && (target.capability_id !== reference.capability_id || target.version !== reference.version || target.provider_id !== reference.provider_id)) assertCurrentAuthority(context, target, requiredPermissions);
    assertCurrent();
  };
  return { assert_authority_current: assertAuthority, beforeEffect: async () => {
    assertCurrent();
    await context.validate_authority?.(reference);
    await context.validate_permissions?.(permissions);
    await beforeEffect?.(context, reference);
    assertAuthority();
  } };
}

/** Calls whose handler has been entered; a failure of any other call is a refusal. Keyed by the call object, which is new for every call. */
const started = new WeakSet<object>();
/**
 * Called by the registered entry to enter the handler. From here the call has begun, so a failure is no longer a refusal; and what the handler
 * calls is its own, not covered by a refusal the caller was looking for (`expectingRefusal`).
 */
export function startHandler<R>(call: object, enter: () => R): R { started.add(call); return insideHandler(enter); }

interface HandlerOrigin {
  readonly execution: ActionExecutionContext;
  readonly active: () => boolean;
}
const handlers = new AsyncLocalStorage<HandlerOrigin>();

/** Only an actual dispatcher-issued execution context identifies a nested call; inherited ALS alone grants nothing. */
export function isActiveNestedAction(context: ActionCallContext): boolean {
  const origin = handlers.getStore();
  return !!origin && origin.active() && !origin.execution.signal?.aborted
    && context.actor_id === origin.execution.actor_id && context.audience === origin.execution.audience
    && context.project_id === origin.execution.project_id && context.actor_kind === origin.execution.actor_kind
    && context.runtime_session_id === origin.execution.runtime_session_id && context.plugin_install_id === origin.execution.plugin_install_id
    && context.host_plugin === origin.execution.host_plugin && "beforeEffect" in context
    && context.beforeEffect === origin.execution.beforeEffect;
}

/** The execution context of the handler whose asynchronous work this is, finished or not; none outside every handler. */
export function runningHandlerContext(): ActionExecutionContext | undefined { return handlers.getStore()?.execution; }

export function runActionHandler<R>(call: object, execution: ActionExecutionContext, active: () => boolean, enter: () => R): R {
  return startHandler(call, () => handlers.run({ execution, active }, enter));
}

/** The caller's context as one call: a copy, so the caller's own object is untouched, carrying the number of its operation. */
export function bindCall(context: ActionCallContext): CallContext {
  return { ...context, call_id: context.call_id || currentCallId() || newCallId() };
}

const describeUnknown = (reference: ActionReference): CallDescription => ({ ...reference, operation: "unknown", title: reference.capability_id, provider_title: "" });

/**
 * Names a call after the definition it ran against, or, when it ran against none, after the caller's own reference.
 * Another project's definition is never used: a caller must not learn from its own record that the id exists there.
 */
export function describeCall(source: { descriptor(reference: ActionReference, projectId?: string | null): HostCapabilityDescriptor | undefined },
  call: ActionCallContext, reference: ActionReference, resolved?: HostCapabilityDescriptor): CallDescription {
  const found = resolved ?? source.descriptor(reference, call.project_id);
  const provider = found?.action_provider;
  if (!found?.action || !provider || (provider.project_id && provider.project_id !== call.project_id)) return describeUnknown(reference);
  return { ...reference, provider_id: provider.provider_id, operation: found.operation, title: found.action.title, provider_title: provider.title };
}

/** How a call failed. The message is recorded to 200 UTF-16 units; a cut between the two halves of a character drops the lone half. */
function failure(error: unknown, call: object): CallOutcome {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  const said = error instanceof Error ? error.message : String(error);
  return { ok: false, ...(code === undefined ? {} : { code: String(code) }), message: said.length <= 200 ? said : said.slice(0, 200).replace(/[\uD800-\uDBFF]$/u, ""),
    ...(started.has(call) ? {} : { refused: true as const }) };
}

function report(settled: CallSettled | undefined, call: CallContext, describe: (call: CallContext) => CallDescription, outcome: CallOutcome): void {
  if (!settled) return;
  try { settled(call, describe(call), outcome); }
  catch { /* A failed record never changes the call. */ }
}

/**
 * Run a call inside its operation's scope and tell `settled` exactly once how it ended: a handler's result or failure,
 * and every refusal before one (missing, not allowed, invalid input, rate limit, host policy). The report is made inside
 * the scope, so what it records can be told to the operation that is waiting for the answer.
 */
export async function settleCall<T>(settled: CallSettled | undefined, call: CallContext, describe: (call: CallContext) => CallDescription,
  run: (call: CallContext) => Promise<T> | T): Promise<T> {
  return withCallId(call.call_id, async () => {
    let value: T;
    try { value = await run(call); }
    catch (error) { report(settled, call, describe, failure(error, call)); throw error; }
    report(settled, call, describe, { ok: true });
    return value;
  });
}

/** The same for a call that must finish without yielding (a Plugin SDK transaction). */
export function settleCallSync<T>(settled: CallSettled | undefined, call: CallContext, describe: (call: CallContext) => CallDescription, run: (call: CallContext) => T): T {
  return withCallIdSync(call.call_id, () => {
    let value: T;
    try { value = run(call); }
    catch (error) { report(settled, call, describe, failure(error, call)); throw error; }
    report(settled, call, describe, { ok: true });
    return value;
  });
}

/** A call turned away on the spot, before any dispatch, is settled like any other; it is named by the caller's reference alone. */
export function refuseCall(settled: CallSettled | undefined, context: ActionCallContext, reference: ActionReference, error: unknown): Promise<never> {
  return settleCall(settled, bindCall(context), () => describeUnknown(reference), () => Promise.reject(error));
}
