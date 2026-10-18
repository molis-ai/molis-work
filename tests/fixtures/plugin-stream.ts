import assert from "node:assert/strict";
import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginRouteRequest, PluginRouteResponse, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";

/** A plugin whose real action and direct route can be held across a transport or lifecycle change. */
export function streamProbe(scope: "home" | "project" = "home") {
  const id = `io.molis.work.example.stream-${scope}`, contexts: PluginStartContext[] = [];
  const action: ActionDefinition<Record<string, never>, unknown> = { capability_id: `stream-${scope}.run`, version: 1, operation: "command",
    action: { title: "Stream a result", description: "Stream a result through the real action directory", scope,
      scheduling: "concurrent", kind: "operation", audiences: ["user", "plugin"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false } } };
  const seen: ActionExecutionContext[] = [], requests: PluginRouteRequest[] = [];
  const behavior = {
    action: async (caller: ActionExecutionContext, context: PluginStartContext): Promise<unknown> => {
      caller.on_progress?.({ stage: "working", progress: 0.5, text_delta: "正文" });
      await caller.beforeEffect(); context.services!.storage!.set("result", "saved");
      return { project_id: caller.project_id, value: "saved" };
    },
    route: async (_request: PluginRouteRequest): Promise<PluginRouteResponse> => ({ status: 200, body: { value: "direct" } }),
  };
  const definition: PluginDefinition = {
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: "Stream probe", kind: "app",
      publisher: { publisher_id: "example", signature: "stream-probe" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
      permissions: [{ permission: "storage:private", required: true, reason: "Store the action's result" }],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [action],
      routes: [{ route_id: "run", method: "POST", path: "/run", stream: "ndjson" },
        { route_id: "json", method: "POST", path: "/json" },
        { route_id: "direct", method: "POST", path: "/direct", stream: "ndjson", max_body_bytes: 36_000_000 }] },
    async start(context) {
      contexts.push(context);
      return { kind: "app", actions: [{ ...action, handle(caller) { seen.push(caller); return behavior.action(caller, context); } }],
        routes: [bindPluginActionRoute(context, action, () => ({}), "run"), bindPluginActionRoute(context, action, () => ({}), "json"),
          { route_id: "direct", handle(request) { requests.push(request); return behavior.route(request); } }] };
    },
  };
  return { id, definition, action, contexts, seen, requests, behavior };
}

export async function streamLines(response: Response): Promise<Array<Record<string, unknown>>> {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/x-ndjson/);
  return (await response.text()).trim().split("\n").map(line => JSON.parse(line) as Record<string, unknown>);
}
