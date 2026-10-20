import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginHostServices, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";

type Half = "home" | "project";
type HalfAction = ActionDefinition<Record<string, never>, { half: Half; project_id: string | null }>;

/**
 * A dual-instance plugin (specs/dual-instance-plugins): one Manifest, two halves. The Home half offers the `home` action and route,
 * the project half the `project` ones; the Manifest also publishes an event, which only a project instance can. Every permission
 * is required (U1). Each half keeps the services its Host gave it, so a test can see what the Home half was not given.
 */
export function dualPlugin(name = "dualprobe") {
  const id = `io.molis.work.example.${name}`, read = `${name}:read`, changed = `${id}.changed`;
  const action = (half: Half): HalfAction => ({ capability_id: `${name}.${half}`, version: 1, operation: "query",
    action: { title: `${half} 一半`, description: `双实例的 ${half} 一半`, scope: half, permissions: [read], kind: "query",
      audiences: ["user", "mcp"], subject_kinds: [], input_schema: { type: "object", additionalProperties: false } } });
  const actions = { home: action("home"), project: action("project") };
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `dual-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", read].map(permission => ({ permission, required: true, reason: "双实例探针" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    actions: [actions.home, actions.project], events: { publishes: [{ event_type_id: changed, type_version: 1 }], subscribes: [] },
    routes: [{ route_id: "home", method: "GET", path: "/home", permission: read }, { route_id: "project", method: "GET", path: "/project", permission: read }] };
  const services: Partial<Record<Half, PluginHostServices>> = {};
  const half = (which: Half): PluginDefinition => ({ manifest, event_types: [{ event_type_id: changed, type_version: 1, validate: payload => payload }],
    start(context) {
      services[which] = context.services;
      return { kind: "app", actions: [{ ...actions[which], handle: caller => ({ half: which, project_id: caller.project_id }) }],
        routes: [bindPluginActionRoute(context, actions[which], () => ({}), which)] };
    } });
  return { id, read, manifest, actions, services, home: half("home"), project: half("project") };
}
