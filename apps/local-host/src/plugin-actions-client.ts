import { randomUUID } from "node:crypto";
import { bindActionClient, ActionError, requireSynchronous, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionReference, type ActionInvokeTransport, type HostOfferedOriginalFile } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginActionClient, PluginExecutionControl, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ACTIONS_DELEGATE_PERMISSION, declaresActionDelegation, pluginActionDirectory } from "./plugin-action-delegation.js";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, markPluginActionChecked, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";
import { invokePluginQuery } from "./plugin-action-query.js";
import { pluginActionProvider } from "./plugin-action-provider.js";
import { routedPluginCaller } from "./plugin-callers.js";
import { pluginActionDependencies } from "./plugin-action-dependencies.js";

/**
 * The controls this Host made for a route it dispatched inside a project, each with that project's action client and whether its request
 * has ended; a plugin cannot make one, so it cannot name a project.
 */
const routedControls = new WeakMap<PluginExecutionControl, { readonly client: ActionClient; readonly caller?: ActionCallContext; ended: boolean; original_file?: HostOfferedOriginalFile }>();
const ended = () => new ActionError("actions.cancelled", "这次请求已经结束，不能再在这个项目里调用");

/**
 * Notes on the control the Host made for a route request the one original file the person gave the Host's entry in it. Only the entry
 * that dispatched the route calls this, with a file it read from the request itself; a control the Host did not make (a plugin's own,
 * a copy of one) is not in the table and takes nothing, and nothing a plugin passes in a body, query or action input can reach here.
 */
export function offerRoutedOriginalFile(control: PluginExecutionControl, file: HostOfferedOriginalFile | undefined): void {
  const routed = routedControls.get(control);
  if (routed && file) routed.original_file = file;
}

/**
 * A Home instance's route called in a project: the Host resolved and checked the project from the page's path before this, `client` is
 * the Host's action client for that project (the Home client refuses a caller that names one), and `current` checks again, before
 * each write, that the project is still there and still shows the plugin. The project lasts as long as the request: once `end` is called,
 * a call with this control is refused, never run as the person's own.
 * With the person's `caller`, this is the page's entry (PG-029): the plugin's own actions it calls carry `user_action` with source `web`,
 * one message per request, given here and nowhere else; what the caller or the route's body says about it is not read.
 */
export function projectRouteControl(control: Omit<PluginExecutionControl, "project_id">, projectId: string | null, client: ActionClient,
  current: () => Promise<void>, caller?: ActionCallContext): { control: PluginExecutionControl; end(): void } {
  const state = { client, caller: caller && { ...caller, user_action: { source: "web", conversation_ref: `web:${projectId ?? "home"}`, message_ref: `web:request:${randomUUID()}` } },
    ended: false };
  const routed: PluginExecutionControl = Object.freeze({ ...control, ...(projectId ? { project_id: projectId } : {}),
    beforeEffect: async () => {
      if (state.ended) throw ended();
      await control.beforeEffect();
      await current();
      if (state.ended) throw ended();
    },
    assert_authority_current: () => {
      if (state.ended) throw ended();
      control.assert_authority_current?.();
    },
    retainBackgroundAuthority: control.retainBackgroundAuthority ? () => {
      if (state.ended) throw ended();
      const authority = control.retainBackgroundAuthority!();
      return Object.assign(async () => { await authority(); await current(); authority.assertCurrent(); }, { assertCurrent: authority.assertCurrent });
    } : undefined });
  routedControls.set(routed, state);
  return { control: routed, end: () => { state.ended = true; } };
}

/**
 * The project a call runs in: the instance's own, or, for a Home instance, the one the Host put on the route's control. A project on
 * any other control is not the Host's word and is not read: plugins pass their caller on as the control, and it names a project too.
 */
function callScope(instanceProject: string | undefined, instanceClient: ActionClient, control: PluginExecutionControl | undefined)
  : { project_id: string | null; client: ActionClient; caller?: ActionCallContext; original_file?: HostOfferedOriginalFile } {
  const routed = control ? routedControls.get(control) : undefined;
  if (!routed) return { project_id: instanceProject ?? null, client: instanceClient };
  if (routed.ended) throw ended();
  if (instanceProject !== undefined && instanceProject !== control?.project_id) throw new ActionError("actions.forbidden", "调用所在的项目与插件实例不一致");
  return { project_id: control?.project_id ?? null, client: routed.client, caller: routed.caller, original_file: routed.original_file };
}

/** One action binding for project and Home activations; identity and authority come from the Host. */
export function pluginHostActions(context: PluginStartContext, manifest: PluginManifest, options: {
  client: ActionClient; actor_id: string; project_id?: string; providerId?: string; assertActive(): void; pluginCaller: HostPluginCaller;
}): PluginActionClient | undefined {
  const consumed = new Set(manifest.capabilities.consumes);
  const required = (manifest.actions ?? []).flatMap(action => action.action.required_actions ?? [])
    .map(reference => ({ capability_id: reference.capability_id, version: reference.version, ...(reference.provider_id ? { provider_id: reference.provider_id } : {}) }));
  const sameAction = (left: ActionReference, right: ActionReference) => left.capability_id === right.capability_id && left.version === right.version;
  // The Plugin's call to an action of its own. Its final check also asks the original caller of the action the Plugin made this
  // call in (`outer`): the action it calls writes in its own handler, under its own scope, so without this a cancelled or revoked
  // outer call would still write (S-18). Outside every action (discovery, `start`, a route) there is no outer caller to ask.
  const actionCaller = (projectId: string | null, outer?: ReturnType<typeof currentPluginInvocation>): ActionCallContext => {
    options.assertActive();
    const assertAuthority = (reference?: ActionReference, requiredPermissions?: readonly string[]) => {
      options.assertActive();
      for (const permission of requiredPermissions ?? []) context.requireGrant(permission);
      if (reference) {
        const action = manifest.actions?.find(item => sameAction(item, reference));
        if (!action) throw new ActionError("actions.forbidden", "插件未声明提供此动作");
        for (const permission of action.action.permissions) context.requireGrant(permission);
      }
      assertCapturedPluginActionCurrent(outer, context);
    };
    return {
      actor_id: outer?.caller.actor_id ?? options.actor_id, project_id: projectId,
      audience: "user", permissions: context.grants, query_only: pluginInvocationReadOnly(outer), signal: outer?.caller.signal,
      allowed_actions: [...(manifest.actions ?? []).map(action => ({ ...action, provider_id: ownProvider })), ...required],
      validate_authority: assertAuthority, assert_authority_current: assertAuthority,
    };
  };
  // An action the Manifest lists under `capabilities.consumes`, owned by the unique provider in the actual directory. The Plugin
  // reaches it as the plugin audience, with its own grants and the exact action named, so the kernel applies what it
  // applies to every plugin: the audience the action is offered to, the permissions it needs, its availability and
  // its input schema. It carries this session’s Host-issued caller, routed to the current project for Home sessions.
  // Its final check also asks the original caller of the
  // action the Plugin made this call in (`outer`, captured when the Plugin called): the consumed action's own write runs
  // in its own handler, under its own scope, so without this a cancelled or revoked outer call would still write (S-18).
  const dependencyCaller = (definition: ActionDefinition, projectId: string | null, outer: ReturnType<typeof currentPluginInvocation>, providerId?: string): ActionCallContext => {
    options.assertActive();
    const assertAuthority = (_reference?: ActionReference, requiredPermissions?: readonly string[]) => {
      options.assertActive();
      for (const permission of requiredPermissions ?? []) context.requireGrant(permission);
      for (const permission of definition.action?.permissions ?? []) context.requireGrant(permission);
      assertCapturedPluginActionCurrent(outer, context);
    };
    return {
      actor_id: options.actor_id, actor_kind: "user", project_id: projectId, audience: "plugin", permissions: context.grants,
      host_plugin: routedPluginCaller(options.pluginCaller, projectId), plugin_install_id: context.install_id, query_only: pluginInvocationReadOnly(outer), signal: outer?.caller.signal,
      // Mandatory dependencies remain limited to what this installation explicitly consumes.
      ...(consumed.has(definition.capability_id) ? { allowed_capability_ids: [...consumed] }
        : { allowed_actions: [{ capability_id: definition.capability_id, version: definition.version, ...(providerId ? { provider_id: providerId } : {}) }] }),
      validate_authority: assertAuthority, assert_authority_current: assertAuthority,
    };
  };
  // An original file reaches only this installation's own actions, from the route that carried it.
  const offered = (scope: { original_file?: HostOfferedOriginalFile }) => scope.original_file?.install_id === context.install_id ? { original_file: scope.original_file } : {};
  const ownProvider = options.providerId ?? context.provider_id ?? context.install_id;
  // A command that returned passed every check of the call it was made in: from then on that call may keep a job (PG-038).
  const passed = <Output>(outer: ReturnType<typeof currentPluginInvocation>, definition: ActionDefinition, output: Output): Output => {
    if (definition.operation === "command") markPluginActionChecked(outer);
    return output;
  };
  const ownActions = (scope: { project_id: string | null; client: ActionClient; original_file?: HostOfferedOriginalFile }, outer?: ReturnType<typeof currentPluginInvocation>) =>
    bindActionClient(scope.client, () => ({ ...actionCaller(scope.project_id, outer), ...offered(scope) }));
  const routedActions = (scope: { project_id: string | null; client: ActionClient; caller?: ActionCallContext; original_file?: HostOfferedOriginalFile }, definition: ActionDefinition,
    outer: ReturnType<typeof currentPluginInvocation>) => {
    if (!scope.caller) return ownActions(scope, outer);
    const caller = scope.caller;
    // The plugin answers for its own action's permissions. What a nested call adds is the person's to hold, checked by the person's own
    // caller, only when the plugin holds `actions:delegate`: it reaches those targets as the person through its directory anyway (user
    // decision 2026-10-20). Without it, every permission a nested call carries must be the plugin's too.
    const delegates = declaresActionDelegation(manifest) && context.grants.includes(ACTIONS_DELEGATE_PERMISSION);
    const check = (permissions: readonly string[] = []) => {
      options.assertActive();
      for (const permission of [...definition.action.permissions, ...(delegates ? [] : permissions)]) context.requireGrant(permission);
      assertCapturedPluginActionCurrent(outer, context);
    };
    return bindActionClient(scope.client, () => ({ ...caller, ...offered(scope), query_only: pluginInvocationReadOnly(outer) ?? caller.query_only,
      validate_authority: async reference => {
        check();
        if (definition.action.scope === "project" && !caller.project_id) throw new ActionError("actions.project_required", "请选择项目");
        await caller.validate_authority?.(reference); check();
      },
      assert_authority_current: (reference, permissions) => { check(permissions); requireSynchronous(caller.assert_authority_current?.(reference, permissions)); },
    }));
  };
  return !manifest.actions?.length && consumed.size === 0 ? undefined : {
    discover: async () => (await ownActions({ project_id: options.project_id ?? null, client: options.client }).discover())
      .filter(view => view.provider.plugin_install_id === context.install_id),
    invokeQuery: (reference, input) => invokePluginQuery(context, manifest, options, reference, input),
    ...(declaresActionDelegation(manifest) ? { directory: pluginActionDirectory(context, manifest, options) } : {}),
    dependencies: pluginActionDependencies(context, manifest, options),
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input, control?: PluginExecutionControl, transport?: ActionInvokeTransport) => {
      const outer = currentPluginInvocation(), job = outer && "job" in outer ? outer : undefined;
      // A job's calls are the installation's own, in the job's project (PG-038): never a request's, whose control names its person.
      if (job && control && routedControls.has(control)) throw new ActionError("actions.forbidden", "后台作业不能用请求的 control 调用动作");
      // A nested call keeps the captured project and actor, while its grants and allowed actions remain the plugin's own.
      const scope = job ? { project_id: job.caller.project_id, client: options.client } : outer
        ? { project_id: outer.caller.project_id, client: options.client }
        : callScope(options.project_id, options.client, control), projectId = scope.project_id;
      const own = manifest.actions?.find(action => sameAction(action, definition));
      if (own && !job) return passed(outer, own, await routedActions(scope, own, outer).invoke(own, input, control, transport) as Output);
      if (!own && !consumed.has(definition.capability_id)) throw new ActionError("actions.forbidden", "插件没有声明消费这项动作");
      // A missing grant is said as one before the directory is asked: the directory hides what the plugin may not use, and would
      // otherwise answer that the action is not there.
      options.assertActive();
      for (const permission of definition.action?.permissions ?? []) context.requireGrant(permission);
      // Inside a job the installation's own actions too are reached as the plugin audience, not as the person who kept the job.
      const providerId = own ? ownProvider : await pluginActionProvider(scope.client, { ...dependencyCaller(definition, projectId, outer), ...(control?.signal ? { signal: control.signal } : {}) }, definition);
      options.assertActive();
      return passed(outer, definition, await bindActionClient(scope.client, () => dependencyCaller(own ?? definition, projectId, outer, providerId)).invoke(definition, input, control, transport));
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

/** Use the raw Host clients: preparing Home plugins here would make discovery during start wait on its own startup. */
export function homePluginActions(host: Pick<import("./local-host.js").LocalHost<unknown>, "projects" | "actionClient" | "homeActionClient">): ActionClient {
  const client = (caller: ActionCallContext) => {
    if (!caller.project_id) return host.homeActionClient();
    const project = host.projects().find(row => row.project_id === caller.project_id && row.state !== "closing");
    if (!project) throw new ActionError("actions.scope_mismatch", "查询委托缺少已打开的项目运行环境");
    return host.actionClient(project);
  };
  return { discover: caller => client(caller).discover(caller), invoke: (caller, reference, input) => client(caller).invoke(caller, reference, input) };
}
