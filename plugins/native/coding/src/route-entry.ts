import { ActionError, requireSynchronous, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionClient, PluginCapabilityClient, PluginJobControl, PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";
import { codingInteractionHtml } from "./interaction-html.js";
import { codingPageHtml } from "./rich-html.js";
import { codingRouteActions } from "./route-actions.js";
import type { CodingExecution } from "./routes.js";
import { codingError, codingErrorIn } from "./words.js";

export type CodingBeforeWrite = (() => Promise<void>) & { assert_current(): void; signal?: AbortSignal };
type Control = Pick<ActionExecutionContext, "signal" | "beforeEffect" | "assert_authority_current">;
/** Carry the original route fence to a formal dependency action just as the typed adapter does. */
export function codingActionControl(beforeWrite: CodingBeforeWrite): Control {
  return { signal: beforeWrite.signal, beforeEffect: beforeWrite, assert_authority_current: beforeWrite.assert_current };
}
/** Formal actions keep the same request/job fence as typed calls, as well as any control supplied by their caller. */
export function codingActions(context: PluginStartContext, beforeWrite: CodingBeforeWrite): PluginActionClient {
  const actions = context.services!.actions!;
  return { ...actions, invoke: (definition, input, control, transport) => actions.invoke(definition, input, { ...control,
    signal: beforeWrite.signal && control?.signal ? AbortSignal.any([beforeWrite.signal, control.signal]) : beforeWrite.signal ?? control?.signal,
    beforeEffect: async () => { await control?.beforeEffect(); await beforeWrite(); },
    assert_authority_current: () => {
      requireSynchronous(control?.assert_authority_current?.(), "最终授权检查必须同步完成");
      beforeWrite.assert_current();
    },
  }, transport) };
}
/** A job's writes answer to the job (PG-038): it still runs, the activation is live, and the installation still grants what the job needs. */
export function codingJobWrite(control: PluginJobControl): CodingBeforeWrite {
  return Object.assign(() => control.beforeEffect(), { assert_current: () => control.assert_authority_current(), signal: control.signal });
}
type Handler = (request: PluginRouteRequest, api: PluginCapabilityClient, execution: CodingExecution, beforeWrite: CodingBeforeWrite) => Promise<unknown>;
/** What an action with no route of its own runs with. `routed` answers through one of the routes' handlers, under this action's fence. */
export interface CodingActionCall {
  readonly api: PluginCapabilityClient;
  readonly execution: CodingExecution;
  readonly beforeWrite: CodingBeforeWrite;
  routed(route_id: string, request: Pick<PluginRouteRequest, "method" | "params" | "query" | "body">): Promise<unknown>;
}

/**
 * Transport and per-call control. The execution is the activation's own, the same object for a request and for the background
 * work it sets off: a write is fenced by the `beforeWrite` the caller hands the store (`store.ts`), which the platform checks
 * again inside the transaction, not by wrapping every store call.
 */
export function codingRouteEntry(context: PluginStartContext, execution: CodingExecution, actions: ActionHandlerBinding[],
  failure: (error: unknown) => { status: number; body: unknown }) {
  const check = (control?: Control, ownerCheck?: () => Promise<void>, permissions: readonly string[] = []): CodingBeforeWrite => {
    const assert_current = () => {
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
  /** What a route answers Coding's own page: the words and the change drawn (`rich-html.ts`), the cards and the next-step row (`interaction-html.ts`). */
  const page = (body: unknown, request: PluginRouteRequest, route_id: string, locale: ActionLocale | undefined) =>
    codingInteractionHtml(codingPageHtml(body, { route_id, query: request.query }, locale), context.services?.interaction, locale);
  const handlers = new Map<string, Handler>();
  const route = (route_id: string, handle: Handler): PluginRouteBinding => {
    handlers.set(route_id, handle);
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
          // A route answers Coding's own page: what it shows travels drawn, which a call of the action alone does not get.
          return { status: 200, body: await page(await context.services.actions.invoke(action.definition, action.toInput(request), request.execution), request, route_id, request.execution?.locale) };
        }
        const beforeWrite = check(request.execution), { api, execution } = await execute(request, beforeWrite, request.execution?.locale);
        return { status: 200, body: await page(await handle(request, api, execution, beforeWrite), request, route_id, execution.locale) };
      } catch (error) { return failure(codingErrorIn(error, request.execution?.locale)); }
    } };
  };
  /**
   * An action with no route (a protocol Coding takes on, `executor.ts`), fenced as a route's action is: by the caller's checks, its own
   * permissions and this activation. It may answer through a route's handler in-process, under its own fence, so both entries run one code.
   */
  const action = <Input, Output>(definition: ActionDefinition<Input, Output>, handle: (input: Input, call: CodingActionCall) => Promise<Output>): void => {
    const bound = (caller?: ActionExecutionContext) => bindOwnerPluginAction(context, definition, async (value, ownerCheck) => {
      const beforeWrite = check(caller, ownerCheck, definition.action.permissions);
      const { api, execution } = await execute({ method: definition.operation === "query" ? "GET" : "POST", pathname: "", params: {}, query: {}, body: {}, actor_id: context.actor_id! }, beforeWrite, caller?.locale);
      const routed: CodingActionCall["routed"] = (route_id, request) => {
        const handler = handlers.get(route_id);
        if (!handler) throw new ActionError("actions.unredeemed", `Coding 没有 ${route_id} 的处理`);
        return handler({ ...request, pathname: "", actor_id: context.actor_id! }, api, execution, beforeWrite);
      };
      return handle(value, { api, execution, beforeWrite, routed });
    });
    actions.push({ ...bound(), handle: (caller, input) => bound(caller).handle(caller, input) });
  };
  return Object.assign(route, { action });
}
