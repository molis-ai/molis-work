import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { FILE_SNAPSHOT_SCHEMA_VERSION, FILE_SNAPSHOT_TYPE } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { PluginAppContribution, PluginDefinition, PluginHostServices, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionErrorResponse, bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";

type Half = "home" | "project";
type Answer = { half: Half; project_id: string | null };
/** Every action answers which half ran it and in what project; a `reach` answers with the answer of the action it called. */
type HalfAction = ActionDefinition<{ call?: string }, Answer>;
type Share = Omit<PluginAppContribution, "kind">;

/**
 * A dual-instance plugin (specs/dual-instance-plugins): one Manifest, two halves.
 * - The Home half offers two Home actions (`home`; `home-reach`, which only a person reaches), the `home` route and the stage view.
 * - The project half offers two project actions (`project`; `reach`, which only a person reaches), the `project` route and the
 *   input port's handler. The Manifest also publishes an event, which only a project instance can.
 * Every permission is required (U1). `home-reach` and `reach` call the action of their own Manifest that `call` names, the way a plugin
 * calls its own actions (`services.actions`, passing its caller on); without `call` they answer which half they are, like the others.
 * The `home` route does the same with the route's own control, so under a project's path it calls in that project.
 * Each half keeps the services its Host gave it, so a test can see what the Home half was not given and use a handle after its half
 * stopped. `hold()` makes the next call of the `project` action wait in its handler until released, then check its authority again.
 * `inside(run)` makes the next call of the `home` or `project` action run `run` with its caller in its handler first, and fail with what it throws.
 * With `writes`, `home` and `project` are commands: a query writes nothing (`pluginInvocationReadOnly`), so what `inside` writes needs one.
 */
export function dualPlugin(name = "dualprobe", writes = false) {
  const id = `io.molis.work.example.${name}`, read = `${name}:read`, changed = `${id}.changed`, view = `${id}.stage`;
  const action = (suffix: string, half: Half, audiences: Array<"user" | "mcp" | "workflow">, write = false): HalfAction => ({ capability_id: `${name}.${suffix}`,
    version: 1, operation: write ? "command" : "query", action: { title: `${half} 一半的 ${suffix}`, description: `双实例的 ${half} 一半`, scope: half, permissions: [read],
      kind: write ? "operation" : "query", audiences, subject_kinds: [], input_schema: { type: "object", additionalProperties: false, properties: { call: { type: "string" } } } } });
  const actions = { home: action("home", "home", ["user", "mcp", "workflow"], writes), homeReach: action("home-reach", "home", ["user"]),
    project: action("project", "project", ["user", "mcp", "workflow"], writes), reach: action("reach", "project", ["user"]) };
  const own = Object.values(actions);
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `dual-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", "artifact:read", read].map(permission => ({ permission, required: true, reason: "双实例探针" })),
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [{ artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION }] },
    ui: { contributions: [view], views: [{ view_id: "stage", slot: "stage", title: "双实例探针" }] },
    actions: own, events: { publishes: [{ event_type_id: changed, type_version: 1 }], subscribes: [] },
    ports: { inputs: [{ port: "snapshot", artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION, optional: true }], outputs: [] },
    routes: [{ route_id: "home", method: "GET", path: "/home", permission: read }, { route_id: "project", method: "GET", path: "/project", permission: read }] };
  const services: Partial<Record<Half, PluginHostServices>> = {};
  let held: { entered: PromiseWithResolvers<void>; release: PromiseWithResolvers<void> } | undefined;
  let next: ((caller: ActionExecutionContext) => unknown) | undefined;
  const probe = async (caller: ActionExecutionContext) => { const run = next; next = undefined; await run?.(caller); };
  const target = (call: string) => {
    const found = own.find(item => item.capability_id === call);
    if (!found) throw new Error(`no action ${call} in this Manifest`);
    return found;
  };
  const stage = { descriptor: { contribution_id: view, kind: "embedded" as const, label: name,
    surfaces: [{ surface_id: "workbench", target_slot_id: "stage", format: "html" }], slots: [] }, render: () => `<section>${name}</section>` };
  /** One half's share of the Manifest; `extra` adds to it, for a half that offers more than its share. */
  const half = (which: Half, extra: (all: typeof actions) => Share = () => ({})): PluginDefinition => ({ manifest,
    event_types: [{ event_type_id: changed, type_version: 1, validate: payload => payload }],
    start(context) {
      services[which] = context.services;
      const answer = (caller: ActionExecutionContext): Answer => ({ half: which, project_id: caller.project_id ?? null });
      const reach = (definition: HalfAction) => ({ ...definition, handle: (caller: ActionExecutionContext, input: { call?: string }) =>
        input.call ? context.services!.actions!.invoke(target(input.call), {}, caller) : answer(caller) });
      const shares: Record<Half, Share> = {
        home: { actions: [{ ...actions.home, handle: async caller => { await probe(caller); return answer(caller); } }, reach(actions.homeReach)], views: [stage],
          routes: [{ route_id: "home", async handle(request) {
            try { return { status: 200, body: await context.services!.actions!.invoke(target(request.query.call ?? actions.home.capability_id), {}, request.execution) }; }
            catch (error) { return actionErrorResponse(error); }
          } }] },
        project: { actions: [{ ...actions.project, handle: async caller => {
          await probe(caller);
          const gate = held; held = undefined;
          if (gate) { gate.entered.resolve(); await gate.release.promise; await caller.beforeEffect(); }
          return answer(caller);
        } }, reach(actions.reach)], routes: [bindPluginActionRoute(context, actions.project, () => ({}), "project")], onUpstreamReady: () => {} },
      };
      const more = extra(actions);
      return { kind: "app", ...shares[which], ...more,
        actions: [...shares[which].actions ?? [], ...more.actions ?? []], routes: [...shares[which].routes ?? [], ...more.routes ?? []],
        views: [...shares[which].views ?? [], ...more.views ?? []] };
    } });
  return { id, read, manifest, actions, services, view, stage, home: half("home"), project: half("project"), half,
    inside(run: (caller: ActionExecutionContext) => unknown) { next = run; },
    hold() { held = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }; return held; } };
}
