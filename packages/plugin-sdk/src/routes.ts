import { ActionError, requireSynchronous, type ActionAvailability, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionErrorResponse, isCodedFailure } from "./errors.js";

// The two binders a plugin uses to put its actions behind an HTTP route or behind its owner (W3-02-C; they lived in the contracts, with
// a status table of their own). A route answers a failed action the way every other exit does: the status of the failure's kind and the one body.

/** The route's own request mapper rejecting the request is the caller's mistake, unless it already raised an error of ours. */
function routeInput<Input>(map: (request: PluginRouteRequest) => Input, request: PluginRouteRequest): Input {
  try { return map(request); }
  catch (error) {
    if (isCodedFailure(error)) throw error;
    throw new ActionError("actions.input_invalid", error instanceof Error ? error.message : String(error));
  }
}

/** Bounds on a streamed route's progress lines (`PluginRouteStreamLine`); the `result` line has only the action's own output limit. */
export const PLUGIN_ROUTE_STREAM_LIMITS = Object.freeze({ line_bytes: 65_536, lines: 10_000, progress_bytes: 1_048_576 });

/** A plugin HTTP route only adapts transport to an action; execution always goes through the Host. */
export function bindPluginActionRoute<Input, Output>(
  context: PluginStartContext,
  definition: ActionDefinition<Input, Output>,
  input: (request: PluginRouteRequest) => Input,
  route_id = definition.capability_id,
): PluginRouteBinding {
  return { route_id, async handle(request) {
    try {
      if (!context.actor_id || request.actor_id !== context.actor_id) throw new ActionError("actions.forbidden", "调用者与当前插件入口不一致");
      if (!context.services?.actions) throw new ActionError("actions.unredeemed", "宿主未提供系统动作调用入口");
      const emit = request.emit;
      return { status: 200, body: await context.services.actions.invoke(definition, routeInput(input, request), request.execution, emit ? { on_progress: event => emit(event) } : undefined) };
    } catch (error) {
      return actionErrorResponse(error);
    }
  } };
}

/** An action over the local owner's personal state and 成果: it runs only for that owner and never impersonates the startup owner. */
export function bindOwnerPluginAction<Input, Output>(
  context: PluginStartContext,
  definition: ActionDefinition<Input, Output>,
  handle: (input: Input, beforeWrite: () => Promise<void>) => Output | Promise<Output>,
  dependencies: readonly ActionReference[] = [],
): ActionHandlerBinding {
  const availability = (caller: ActionCallContext): ActionAvailability => {
    if (!context.actor_id || caller.actor_id !== context.actor_id) return { available: false, code: "actions.owner_mismatch", reason: "此入口使用本地用户的个人状态与成果；当前调用者尚未接通独立归属，不能借用该用户身份" };
    for (const dependency of dependencies) {
      const state = context.services?.actions?.availability(dependency);
      if (!state) return { available: false, code: "actions.dependency_unknown", reason: "宿主未提供依赖状态检查" };
      if (!state.available) return state;
    }
    return { available: true };
  };
  return { ...definition, availability, async handle(caller, input) {
    const owner = availability(caller);
    if (!owner.available) throw new ActionError(owner.code, owner.reason, { kind: owner.kind });
    const beforeWrite = async () => {
      caller.signal?.throwIfAborted();
      if (!context.services?.actions) throw new ActionError("actions.unredeemed", "宿主未提供系统动作调用入口");
      // The plugin's own registration of this action: the provider id it carries is the plugin id for a plugin that ships with the Host.
      const current = (await context.services.actions.discover()).find(row => row.capability_id === definition.capability_id
        && row.version === definition.version && row.provider.plugin_install_id === context.install_id);
      if (!current) throw new ActionError("actions.missing", "原插件动作已撤下，不能继续保存");
      await caller.validate_authority?.({ capability_id: definition.capability_id, version: definition.version, provider_id: current.provider.provider_id });
      if (!current.availability.available) throw new ActionError(current.availability.code, current.availability.reason, { kind: current.availability.kind });
      await caller.beforeEffect();
      for (const permission of definition.action.permissions) context.requireGrant(permission);
      requireSynchronous(caller.assert_authority_current?.(), "最终授权检查必须同步完成");
      caller.signal?.throwIfAborted();
    };
    // A query writes nothing, and the registry already routed it to the live registration after the Host checked its
    // availability. Only a command confirms, before it writes, that the action is still the one published: discovering
    // every action of the project on each read made plain page refreshes pay for it.
    if (definition.operation !== "query") await beforeWrite();
    return handle(input as Input, beforeWrite);
  } };
}
