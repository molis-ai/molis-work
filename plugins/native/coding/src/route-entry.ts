import { ActionError, requireSynchronous, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginCapabilityClient, PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";
import { codingRouteActions } from "./route-actions.js";
import type { CodingExecutionPorts } from "./routes.js";

export type CodingBeforeWrite = (() => Promise<void>) & { assert_current(): void; signal?: AbortSignal };
type Control = Pick<ActionExecutionContext, "signal" | "beforeEffect" | "assert_authority_current">;
/** Carry the original route fence to a formal dependency action just as the typed adapter does. */
export function codingActionControl(beforeWrite: CodingBeforeWrite): Control {
  return { signal: beforeWrite.signal, beforeEffect: beforeWrite, assert_authority_current: beforeWrite.assert_current };
}
type Handler = (request: PluginRouteRequest, api: PluginCapabilityClient, execution: CodingExecutionPorts, beforeWrite: CodingBeforeWrite) => Promise<unknown>;

/** Transport and per-call control; accepted background work uses the activation's original ports instead. */
export function codingRouteEntry(context: PluginStartContext, ports: CodingExecutionPorts | undefined, actions: ActionHandlerBinding[],
  alive: () => boolean, failure: (error: unknown) => { status: number; body: unknown }) {
  const check = (control?: Control, ownerCheck?: () => Promise<void>, permissions: readonly string[] = []): CodingBeforeWrite => {
    const assert_current = () => {
      if (!alive()) throw new ActionError("actions.expired", "原 Coding 实例已停止");
      control?.signal?.throwIfAborted();
      for (const permission of permissions) context.requireGrant(permission);
      requireSynchronous(control?.assert_authority_current?.(), "最终授权检查必须同步完成");
    };
    return Object.assign(async () => { if (ownerCheck) await ownerCheck(); else await control?.beforeEffect(); assert_current(); }, { assert_current, signal: control?.signal });
  };
  const execute = async (request: PluginRouteRequest, beforeWrite: CodingBeforeWrite) => {
    const api = context.services?.capabilities;
    if (!ports || !api || !context.project_id) throw new ActionError("actions.unredeemed", "Coding 执行入口尚未装配");
    await ports.ready();
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
    const sessions = new Proxy(ports.sessions, { get(target, key) {
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? (...args: unknown[]) => { beforeWrite.assert_current(); return Reflect.apply(value, target, args); } : value;
    } });
    return { api: controlled, execution: { ...ports, sessions } };
  };
  return (route_id: string, handle: Handler): PluginRouteBinding => {
    const action = codingRouteActions[route_id];
    if (action) {
      const binding = bindOwnerPluginAction(context, action.definition, async () => {});
      actions.push({ ...binding, handle: (caller, input) => bindOwnerPluginAction(context, action.definition, async (value, ownerCheck) => {
        const request = { ...action.toRequest(value), pathname: "", actor_id: context.actor_id! };
        const beforeWrite = check(caller, ownerCheck, action.definition.action.permissions), { api, execution } = await execute(request, beforeWrite);
        return handle(request, api, execution, beforeWrite);
      }).handle(caller, input) });
    }
    return { route_id, async handle(request) {
      try {
        if (!context.actor_id || request.actor_id !== context.actor_id) throw new ActionError("actions.forbidden", "调用者与当前插件入口不一致");
        if (action) {
          if (!context.services?.actions) throw new ActionError("actions.unredeemed", "宿主未提供系统动作调用入口");
          return { status: 200, body: await context.services.actions.invoke(action.definition, action.toInput(request), request.execution) };
        }
        const beforeWrite = check(request.execution), { api, execution } = await execute(request, beforeWrite);
        return { status: 200, body: await handle(request, api, execution, beforeWrite) };
      } catch (error) { return failure(error); }
    } };
  };
}
