import { bindActionClient, ActionError, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionExecutionContext, type ActionReference, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginActionProvider } from "./plugin-action-provider.js";

/** One action binding for project and Home activations; identity and authority come from the Host. */
export function pluginHostActions(context: PluginStartContext, manifest: PluginManifest, options: {
  client: ActionClient; actor_id: string; project_id?: string; providerId?: string; assertActive(): void; pluginCaller?: HostPluginCaller;
}): BoundActionClient | undefined {
  const consumed = new Set(manifest.capabilities.consumes);
  const required = (manifest.actions ?? []).flatMap(action => action.action.required_actions ?? [])
    .map(reference => ({ capability_id: reference.capability_id, version: reference.version, ...(reference.provider_id ? { provider_id: reference.provider_id } : {}) }));
  const sameAction = (left: ActionReference, right: ActionReference) => left.capability_id === right.capability_id && left.version === right.version;
  const actionCaller = (): ActionCallContext => {
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
      actor_id: options.actor_id, project_id: options.project_id ?? null,
      audience: "user", permissions: context.grants,
      allowed_actions: [...(manifest.actions ?? []).map(action => ({ ...action, provider_id: (options.providerId ?? context.provider_id ?? context.install_id) })), ...required],
      validate_authority: assertAuthority, assert_authority_current: assertAuthority,
    };
  };
  // An action the Manifest lists under `capabilities.consumes`, owned by the unique provider in the actual directory. The Plugin
  // reaches it as the plugin audience, with its own grants and the exact action named, so the kernel applies what it
  // applies to every plugin: the audience the action is offered to, the permissions it needs, its availability and
  // its input schema.
  const dependencyCaller = (definition: ActionDefinition, providerId?: string): ActionCallContext => {
    options.assertActive();
    const assertAuthority = (_reference?: ActionReference, requiredPermissions?: readonly string[]) => {
      options.assertActive();
      for (const permission of requiredPermissions ?? []) context.requireGrant(permission);
      for (const permission of definition.action?.permissions ?? []) context.requireGrant(permission);
    };
    return {
      actor_id: options.actor_id, actor_kind: "user", project_id: options.project_id ?? null, audience: "plugin", permissions: context.grants,
      host_plugin: options.pluginCaller, plugin_install_id: context.install_id,
      allowed_actions: [{ capability_id: definition.capability_id, version: definition.version, ...(providerId ? { provider_id: providerId } : {}) }],
      validate_authority: assertAuthority, assert_authority_current: assertAuthority,
    };
  };
  // The client exists when the Plugin has actions of its own or lists anything under `consumes`: a Plugin with no
  // action of its own still reaches a Host action it consumes. Without either there is nothing to call.
  const ownActions = bindActionClient(options.client, actionCaller);
  return !manifest.actions?.length && consumed.size === 0 ? undefined : {
    discover: async () => (await ownActions.discover()).filter(view => view.provider.plugin_install_id === context.install_id),
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input, control?: Pick<ActionExecutionContext, "signal" | "beforeEffect" | "page_context" | "assert_authority_current">) => {
      if ((manifest.actions ?? []).some(action => sameAction(action, definition))) return ownActions.invoke(definition, input, control);
      if (!consumed.has(definition.capability_id)) throw new ActionError("actions.forbidden", "插件没有声明消费这项宿主动作");
      const providerId = await pluginActionProvider(options.client, { ...dependencyCaller(definition), ...(control?.signal ? { signal: control.signal } : {}) }, definition);
      options.assertActive();
      return bindActionClient(options.client, () => dependencyCaller(definition, providerId)).invoke(definition, input, control);
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
