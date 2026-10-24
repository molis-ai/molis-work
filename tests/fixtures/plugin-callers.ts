import assert from "node:assert/strict";
import { PluginHostExecutor, type LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionRegistryPort, type SyncActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller, LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { PluginRuntime, SqlitePluginRuntimeRepository, type PluginCapabilityPort } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";

/*
 * A plugin's call reaches the action gateway only with a caller the Host issued its session. A test that calls an action the way a
 * plugin does starts a plugin fixture, has it call a probe through its SDK, and presents the caller the probe saw. Nothing here makes
 * a caller: only the Host issues one.
 */

export type CallerScope = "home" | "project";
export const CALLERS_READ = "callers:read", CALLERS_WRITE = "callers:write";

export function probeActions(scope: CallerScope) {
  const peek: ActionDefinition<Record<string, never>, string | null> = { capability_id: `callers.${scope}.peek`, version: 1, operation: "query",
    action: { title: "读取探针", description: "读取探针记下的内容", kind: "query", scope, audiences: ["plugin"], permissions: [CALLERS_READ], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false } } };
  const note: ActionDefinition<{ text: string }, string> = { capability_id: `callers.${scope}.note`, version: 1, operation: "command",
    action: { title: "记下内容", description: "记下一段内容", kind: "operation", scope, scheduling: "concurrent", audiences: ["plugin"], permissions: [CALLERS_WRITE], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } } } };
  return { peek, note };
}

/** A Host provider offered to plugins only. It records who called; its write checks the caller again right before it lands. */
export function registerProbe(registry: ActionRegistryPort, scope: CallerScope) {
  const { peek, note } = probeActions(scope);
  const state = { stored: null as string | null, callers: [] as HostPluginCaller[], refusals: [] as unknown[],
    hold: undefined as { reached(): void; release: Promise<void> } | undefined };
  registry.registerProvider({ provider: { provider_id: "platform", title: "Molis Work", kind: "system" }, definitions: [peek, note], handlers: [
    { ...peek, handle(context) { state.callers.push(context.host_plugin!); return state.stored; } },
    { ...note, async handle(context, input) {
      state.callers.push(context.host_plugin!);
      await context.beforeEffect();
      if (state.hold) { state.hold.reached(); await state.hold.release; }
      try { await context.beforeEffect(); } catch (error) { state.refusals.push(error); throw error; }
      state.stored = (input as { text: string }).text;
      return "stored";
    } },
  ] });
  return { peek, note, state };
}

export type CallerProbe = ReturnType<typeof registerProbe>;

/**
 * A plugin fixture that consumes the probe and `consumes`. `permissions` maps each permission its Manifest declares to whether it is
 * required; a fixture is granted only what it requires. It always requires its private storage and reading the probe.
 */
export function callerPlugin(name: string, scope: CallerScope, permissions: Readonly<Record<string, boolean>> = {}, consumes: readonly string[] = [],
  agent?: Pick<PluginDefinition, "agent_prompts" | "agent_skills"> & { block: NonNullable<PluginDefinition["manifest"]["agent"]> }) {
  const { peek, note } = probeActions(scope);
  const contexts: PluginStartContext[] = [];
  const declared = { "storage:private": true, [CALLERS_READ]: true, ...permissions };
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: `io.molis.work.example.${name}`, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `callers-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: Object.entries(declared).map(([permission, required]) => ({ permission, required, reason: "动作网关探针" })),
    capabilities: { provides: [], consumes: [peek.capability_id, note.capability_id, ...consumes] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] }, routes: [], ...(agent ? { agent: agent.block } : {}) },
    ...(agent?.agent_prompts ? { agent_prompts: agent.agent_prompts } : {}), ...(agent?.agent_skills ? { agent_skills: agent.agent_skills } : {}),
  async start(context) { contexts.push(context); return { kind: "app" }; } };
  const context = (projectId?: string) => {
    const found = contexts.filter(item => (item.project_id ?? undefined) === projectId).at(-1);
    assert.ok(found, `${name} has started${projectId ? ` in ${projectId}` : ""}`);
    return found;
  };
  return { id: definition.manifest.plugin_id, definition, context, actions: (projectId?: string) => context(projectId).services!.actions! };
}

export type CallerPlugin = ReturnType<typeof callerPlugin>;

/** A project's plugins start when its actions are first looked at, as the workbench does when the person opens the project. */
export async function startProjectPlugins(host: { inspectActions(caller: ActionCallContext, reference: LocalHostProjectReference): Promise<unknown> }, reference: LocalHostProjectReference) {
  await host.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: reference.project_id, permissions: [] }, reference);
}

/**
 * Starts `plugin` in a project through the Host's public plugin executor, acting for `actorId`, its installation recorded in the
 * project's own library: for a Host that starts no plugins of its own (a bare LocalHost), or a plugin that acts as itself
 * (`plugin:<id>`, as a generated plugin does). It is granted what its Manifest requires, plus `grants`. With `capabilities` (the
 * Host's typed client) it also gets the typed client a plugin that consumes something has.
 */
export async function startPlugin(host: { actionRegistry(reference: LocalHostProjectReference): ActionRegistryPort; actionClient(reference: LocalHostProjectReference): ActionClient;
  syncActionClient(reference: LocalHostProjectReference): SyncActionClient }, reference: LocalHostProjectReference, store: Pick<LocalProjectDatabase, "db" | "appendEvent" | "eventCursor">,
  plugin: CallerPlugin, options: { actorId?: string; grants?: readonly string[]; capabilities?: PluginCapabilityPort } = {}) {
  const executor = new PluginHostExecutor({ project_id: reference.project_id, actor_id: options.actorId ?? LOCAL_PERSON_ACTOR_ID, ui: new UiHost(),
    actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: reference.project_id },
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }), ...(options.capabilities ? { capabilities: options.capabilities } : {}) });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), executor);
  const required = plugin.definition.manifest.permissions.filter(item => item.required).map(item => item.permission);
  const { install } = runtime.install({ definition: plugin.definition, deployment: "local", grants: [...required, ...(options.grants ?? [])] });
  await runtime.start(install.install_id);
  return { runtime, install_id: install.install_id };
}

/** The caller the Host issued a plugin's current session, as the provider saw it on a call the plugin made through its SDK. */
export async function issuedCaller(probe: CallerProbe, plugin: CallerPlugin, projectId?: string): Promise<HostPluginCaller> {
  assert.equal(await plugin.actions(projectId).invoke(probe.peek, {}), probe.state.stored);
  const caller = probe.state.callers.at(-1);
  assert.ok(caller);
  assert.equal(caller.plugin_id, plugin.id);
  return caller;
}

/** A plugin-audience call that presents `issued`, as a plugin's SDK makes it, claiming whatever the test says. */
export const callAs = (issued: HostPluginCaller, permissions: readonly string[], change: Partial<ActionCallContext> = {}): ActionCallContext => ({
  actor_id: issued.actor_id, actor_kind: "user", project_id: issued.project_id, audience: "plugin", permissions,
  plugin_install_id: issued.install_id, host_plugin: issued, ...change,
});

/**
 * What `plugin`, one of a Host's project `pluginFixtures`, presents on a call in `reference`: the project's plugins start, and its
 * plugin-audience call carries the caller the Host issued its session, claiming `permissions` and whatever `change` says. It
 * registers the probe, so once per Host and project.
 */
export async function projectPluginCaller(host: { actionRegistry(reference: LocalHostProjectReference): ActionRegistryPort;
  inspectActions(caller: ActionCallContext, reference: LocalHostProjectReference): Promise<unknown> }, reference: LocalHostProjectReference,
  plugin: CallerPlugin, permissions: readonly string[], change: Partial<ActionCallContext> = {}): Promise<ActionCallContext> {
  const probe = registerProbe(host.actionRegistry(reference), "project");
  await startProjectPlugins(host, reference);
  return callAs(await issuedCaller(probe, plugin, reference.project_id), permissions, change);
}
