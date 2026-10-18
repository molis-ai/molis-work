import type { ActionDefinition, ActionExecutionContext, ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { pagesContentActions } from "@molis-ai/molis-work-plugin-pages";

export const queryInput = { type: "object", properties: { item_id: { type: "string" }, text: { type: "string" } }, additionalProperties: false };
export function queryProbe(name = "queryprobe", scope: "home" | "project" = "home", pages = true, consumed = true) {
  const id = `io.molis.work.example.${name}`, contexts: PluginStartContext[] = [], seen: ActionExecutionContext[] = [];
  const action: ActionDefinition<{ item_id?: string; text?: string }, unknown> = { capability_id: `${name}.read`, version: 1, operation: "command", action: {
    title: "Read selected material", description: "Query a declared owner under the original caller", kind: "operation", scope, scheduling: "concurrent",
    audiences: ["user", "agent", "mcp"], permissions: ["storage:private"], subject_kinds: [], input_schema: queryInput,
  } };
  const target: { current: ActionReference } = { current: pagesContentActions.read };
  const behavior: { before?(): Promise<void>; after?(): Promise<void>; handle?(context: PluginStartContext, caller: ActionExecutionContext): Promise<unknown> } = {};
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `query-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", ...(pages ? ["pages:read"] : [])].map(permission => ({ permission, required: permission === "storage:private" || scope === "project", reason: "Delegated fixture material" })),
    capabilities: { provides: [], consumes: consumed ? [pagesContentActions.read.capability_id, pagesContentActions.list.capability_id, "query.target", "query.command"] : [] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [action],
    routes: ["read", "clone", "direct", "forged"].map(route_id => ({ route_id, method: "POST" as const, path: `/${route_id}`, permission: "storage:private" })),
  }, async start(context) {
    contexts.push(context);
    return { kind: "app", actions: [{ ...action, async handle(caller, raw) {
      seen.push(caller);
      if (behavior.handle) return behavior.handle(context, caller);
      const input = raw as { item_id?: string; text?: string };
      await behavior.before?.();
      const result = input.text ?? await context.services!.actions!.invokeQuery(target.current, input.item_id ? { item_id: input.item_id } : {});
      await behavior.after?.();
      await caller.beforeEffect(); context.services!.storage!.set("delivered", JSON.stringify(result));
      return result;
    } }], routes: [bindPluginActionRoute(context, action, request => request.body as { item_id?: string; text?: string }, "read"), ...["clone", "direct", "forged"].map(route_id => ({ route_id, async handle(request) {
      if (route_id === "direct") return { status: 200, body: await context.services!.actions!.invokeQuery(target.current, request.body) };
      const control = route_id === "clone" && request.execution ? { ...request.execution } : request.execution;
      const supplied = route_id === "forged" ? { ...action, action: { ...action.action, permissions: [] } } : action;
      return { status: 200, body: await context.services!.actions!.invoke(supplied, request.body as { item_id?: string; text?: string }, control) };
    } }))] };
  } };
  return { id, action, target, behavior, definition, contexts, seen };
}
