import { ActionError, requireSynchronous, type ActionExecutionContext, type ActionHandlerBinding, type ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginCapabilityClient, PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";
import { codingRouteActions } from "./route-actions.js";
import type { CodingExecution } from "./routes.js";
import { codingError, codingErrorIn } from "./words.js";

export type CodingBeforeWrite = (() => Promise<void>) & { assert_current(): void; signal?: AbortSignal };
type Control = Pick<ActionExecutionContext, "signal" | "beforeEffect" | "assert_authority_current">;
/** Carry the original route fence to a formal dependency action just as the typed adapter does. */
export function codingActionControl(beforeWrite: CodingBeforeWrite): Control {
  return { signal: beforeWrite.signal, beforeEffect: beforeWrite, assert_authority_current: beforeWrite.assert_current };
}
type Handler = (request: PluginRouteRequest, api: PluginCapabilityClient, execution: CodingExecution, beforeWrite: CodingBeforeWrite) => Promise<unknown>;

/**
 * Transport and per-call control. The execution is the activation's own, the same object for a request and for the background
 * work it sets off: a write is fenced by the `beforeWrite` the caller hands the store (`store.ts`), which the platform checks
 * again inside the transaction, not by wrapping every store call.
 */
export function codingRouteEntry(context: PluginStartContext, execution: CodingExecution, actions: ActionHandlerBinding[],
  alive: () => boolean, failure: (error: unknown) => { status: number; body: unknown }) {
  const check = (control?: Control, ownerCheck?: () => Promise<void>, permissions: readonly string[] = []): CodingBeforeWrite => {
    const assert_current = () => {
      if (!alive()) throw codingError(message => new ActionError("actions.expired", message), "coding.server.instance-stopped");
      control?.signal?.throwIfAborted();
      for (const permission of permissions) context.requireGrant(permission);
      requireSynchronous(control?.assert_authority_current?.(), "最终授权检查必须同步完成");
    };
    return Object.assign(async () => { if (ownerCheck) await ownerCheck(); else await control?.beforeEffect(); assert_current(); }, { assert_current, signal: control?.signal });
  };
  const execute = async (request: PluginRouteRequest, beforeWrite: CodingBeforeWrite, locale: ActionLocale | undefined) => {
    const api = context.services?.capabilities;
    if (!api || !context.project_id) throw codingError(message => new ActionError("actions.unredeemed", message), "coding.server.entry-unassembled");
    if (request.method !== "GET") await beforeWrite();
    beforeWrite.assert_current();
    const controlled: PluginCapabilityClient = { availability: definition => api.availability(definition),
      invoke: (definition, input, options) => api.invoke(definition, input, { ...options,
        signal: beforeWrite.signal && options?.signal ? AbortSignal.any([beforeWrite.signal, options.signal]) : beforeWrite.signal ?? options?.signal,
        before_effect: async () => { await options?.before_effect?.(); await beforeWrite(); },
        assert_authority_current: () => {
          requireSynchronous(options?.assert_authority_current?.(), "最终授权检查必须同步完成");
          beforeWrite.assert_current();
        },
      }),
    };
    return { api: controlled, execution: { ...execution, locale } };
  };
  return (route_id: string, handle: Handler): PluginRouteBinding => {
    const action = codingRouteActions[route_id];
    if (action) {
      const binding = bindOwnerPluginAction(context, action.definition, async () => {});
      // What the route says goes back in its caller's language (the page's, which the Host put on the call).
      actions.push({ ...binding, handle: async (caller, input) => { try { return await bindOwnerPluginAction(context, action.definition, async (value, ownerCheck) => {
        const request = { ...action.toRequest(value), pathname: "", actor_id: context.actor_id! };
        const beforeWrite = check(caller, ownerCheck, action.definition.action.permissions), { api, execution } = await execute(request, beforeWrite, caller.locale);
        return handle(request, api, execution, beforeWrite);
      }).handle(caller, input); } catch (error) { throw codingErrorIn(error, caller.locale); } } });
    }
    return { route_id, async handle(request) {
      try {
        if (!context.actor_id || request.actor_id !== context.actor_id) throw codingError(message => new ActionError("actions.forbidden", message), "coding.server.caller-mismatch");
        if (action) {
          if (!context.services?.actions) throw codingError(message => new ActionError("actions.unredeemed", message), "coding.server.no-actions");
          return { status: 200, body: await context.services.actions.invoke(action.definition, action.toInput(request), request.execution) };
        }
        const beforeWrite = check(request.execution), { api, execution } = await execute(request, beforeWrite, request.execution?.locale);
        return { status: 200, body: await handle(request, api, execution, beforeWrite) };
      } catch (error) { return failure(codingErrorIn(error, request.execution?.locale)); }
    } };
  };
}
