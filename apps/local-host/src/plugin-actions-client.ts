import { bindActionClient, ActionError, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionReference, type ActionInvokeTransport, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginExecutionControl, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginActionProvider } from "./plugin-action-provider.js";

/**
 * The controls this Host made for a route it dispatched inside a project, each with that project's action client and whether its request
 * has ended; a plugin cannot make one, so it cannot name a project.
 */
const routedControls = new WeakMap<PluginExecutionControl, { readonly client: ActionClient; ended: boolean }>();
const ended = () => new ActionError("actions.cancelled", "这次请求已经结束，不能再在这个项目里调用");

/**
 * A Home instance's route called in a project: the Host resolved and checked the project from the page's path before this, `client` is
 * the Host's action client for that project (the Home client refuses a caller that names one), and `current` checks again, before
 * each write, that the project is still there and still shows the plugin. The project lasts as long as the request: once `end` is called,
 * a call with this control is refused, never run as the person's own.
 */
export function projectRouteControl(control: Omit<PluginExecutionControl, "project_id">, projectId: string, client: ActionClient,
  current: () => Promise<void>): { control: PluginExecutionControl; end(): void } {
  const state = { client, ended: false };
  const routed: PluginExecutionControl = Object.freeze({ ...control, project_id: projectId,
    beforeEffect: async () => {
      if (state.ended) throw ended();
      await control.beforeEffect();
      await current();
      if (state.ended) throw ended();
    },
    assert_authority_current: () => {
      if (state.ended) throw ended();
      control.assert_authority_current?.();
    } });
  routedControls.set(routed, state);
  return { control: routed, end: () => { state.ended = true; } };
}

/**
 * The project a call runs in: the instance's own, or, for a Home instance, the one the Host put on the route's control. A project on
 * any other control is not the Host's word and is not read: plugins pass their caller on as the control, and it names a project too.
 */
function callScope(instanceProject: string | undefined, instanceClient: ActionClient, control: PluginExecutionControl | undefined)
  : { project_id: string | null; client: ActionClient } {
  const routed = control?.project_id === undefined ? undefined : routedControls.get(control);
  if (!control?.project_id || !routed) return { project_id: instanceProject ?? null, client: instanceClient };
  if (routed.ended) throw ended();
  if (instanceProject !== undefined && instanceProject !== control.project_id) throw new ActionError("actions.forbidden", "调用所在的项目与插件实例不一致");
  return { project_id: control.project_id, client: routed.client };
}

/** One action binding for project and Home activations; identity and authority come from the Host. */
export function pluginHostActions(context: PluginStartContext, manifest: PluginManifest, options: {
  client: ActionClient; actor_id: string; project_id?: string; providerId?: string; assertActive(): void; pluginCaller?: HostPluginCaller;
}): BoundActionClient | undefined {
  const consumed = new Set(manifest.capabilities.consumes);
  const required = (manifest.actions ?? []).flatMap(action => action.action.required_actions ?? [])
    .map(reference => ({ capability_id: reference.capability_id, version: reference.version, ...(reference.provider_id ? { provider_id: reference.provider_id } : {}) }));
  const sameAction = (left: ActionReference, right: ActionReference) => left.capability_id === right.capability_id && left.version === right.version;
  const actionCaller = (projectId: string | null): ActionCallContext => {
    options.assertActive();
    const assertAuthority = (reference?: ActionReference, requiredPermissions?: readonly string[]) => {
      options.assertActive();
      for (const permission of requiredPermissions ?? []) context.requireGrant(permission);
      if (!reference) return;
      const action = manifest.actions?.find(item => sameAction(item, reference));
      if (!action) throw new ActionError("actions.forbidden", "插件未声明提供此动作");
      for (const permission of action.action.permissions) context.requireGrant(permission);
    };
    return {
      actor_id: options.actor_id, project_id: projectId,
      audience: "user", permissions: context.grants,
      allowed_actions: [...(manifest.actions ?? []).map(action => ({ ...action, provider_id: (options.providerId ?? context.provider_id ?? context.install_id) })), ...required],
      validate_authority: assertAuthority, assert_authority_current: assertAuthority,
    };
  };
  // An action the Manifest lists under `capabilities.consumes`, owned by the unique provider in the actual directory. The Plugin
  // reaches it as the plugin audience, with its own grants and the exact action named, so the kernel applies what it
  // applies to every plugin: the audience the action is offered to, the permissions it needs, its availability and
  // its input schema.
  const dependencyCaller = (definition: ActionDefinition, projectId: string | null, providerId?: string): ActionCallContext => {
    options.assertActive();
    const assertAuthority = (_reference?: ActionReference, requiredPermissions?: readonly string[]) => {
      options.assertActive();
      for (const permission of requiredPermissions ?? []) context.requireGrant(permission);
      for (const permission of definition.action?.permissions ?? []) context.requireGrant(permission);
    };
    return {
      actor_id: options.actor_id, actor_kind: "user", project_id: projectId, audience: "plugin", permissions: context.grants,
      host_plugin: options.pluginCaller, plugin_install_id: context.install_id,
      allowed_actions: [{ capability_id: definition.capability_id, version: definition.version, ...(providerId ? { provider_id: providerId } : {}) }],
      validate_authority: assertAuthority, assert_authority_current: assertAuthority,
    };
  };
  // The client exists when the Plugin has actions of its own or lists anything under `consumes`: a Plugin with no
  // action of its own still reaches a Host action it consumes. Without either there is nothing to call.
  const ownActions = (scope: { project_id: string | null; client: ActionClient }) => bindActionClient(scope.client, () => actionCaller(scope.project_id));
  return !manifest.actions?.length && consumed.size === 0 ? undefined : {
    discover: async () => (await ownActions({ project_id: options.project_id ?? null, client: options.client }).discover())
      .filter(view => view.provider.plugin_install_id === context.install_id),
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input, control?: PluginExecutionControl, transport?: ActionInvokeTransport) => {
      const scope = callScope(options.project_id, options.client, control), projectId = scope.project_id;
      if ((manifest.actions ?? []).some(action => sameAction(action, definition))) return ownActions(scope).invoke(definition, input, control, transport);
      if (!consumed.has(definition.capability_id)) throw new ActionError("actions.forbidden", "插件没有声明消费这项动作");
      // A missing grant is said as one before the directory is asked: the directory hides what the plugin may not use, and would
      // otherwise answer that the action is not there.
      options.assertActive();
      for (const permission of definition.action?.permissions ?? []) context.requireGrant(permission);
      const providerId = await pluginActionProvider(scope.client, { ...dependencyCaller(definition, projectId), ...(control?.signal ? { signal: control.signal } : {}) }, definition);
      options.assertActive();
      return bindActionClient(scope.client, () => dependencyCaller(definition, projectId, providerId)).invoke(definition, input, control, transport);
    },
  };
}

/** Lazily prepare system providers before either read-only discovery or execution. */
export function withPreparedActions(client: ActionClient, prepare: (caller: ActionCallContext) => Promise<void>,
  refuse: (caller: ActionCallContext, reference: ActionReference, error: unknown) => Promise<never>): ActionClient {
  return {
    discover: async caller => { caller.signal?.throwIfAborted(); await prepare(caller); caller.signal?.throwIfAborted(); return client.discover(caller); },
    invoke: async (caller, capability, input) => {
      try { caller.signal?.throwIfAborted(); await prepare(caller); caller.signal?.throwIfAborted(); }
      catch (error) { return refuse(caller, capability, error); }
      return client.invoke(caller, capability, input);
    },
  };
}
