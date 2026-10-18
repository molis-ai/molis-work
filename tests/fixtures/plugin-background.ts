import assert from "node:assert/strict";
import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginBackgroundExecution, PluginExecutionControl, PluginStartContext, PluginRouteRequest, PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { homeProbe } from "./home-runtime.js";

export function backgroundProbe(name = "backgroundprobe", scope: "home" | "project" = "home", version = "1.0.0") {
  const probe = homeProbe(name, version), handles: PluginBackgroundExecution<string>[] = [], controls: PluginExecutionControl[] = [], preflight: PluginUpgradeContext[] = [];
  const callers: ActionExecutionContext[] = [], requests: PluginRouteRequest[] = [];
  const input = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", minLength: 1 } } };
  const state = { enum: ["running", "succeeded", "failed"] };
  const status: ActionDefinition<{ id: string }, { state: string }> = { ...probe.state, capability_id: `${name}.status`, action: { ...probe.state.action, scope,
    input_schema: input, output_schema: { type: "object", required: ["state"], additionalProperties: false, properties: { state } } } };
  const start: ActionDefinition<{ id: string }, { id: string; state: string }> = { ...probe.ask, capability_id: `${name}.start`, action: { ...probe.ask.action, scope,
    permissions: ["storage:private", "model:invoke", `${name}:write`], input_schema: input,
    output_schema: { type: "object", required: ["id", "state"], additionalProperties: false, properties: { id: { type: "string" }, state } },
    background_job: { status: { capability_id: status.capability_id, version: status.version }, id: "id", input: "id", state: "state", done: ["succeeded"], failed: ["failed"] } } };
  const serial = { ...start, capability_id: `${name}.background-serial`, action: { ...start.action, scheduling: undefined } };
  const undeclared = { ...start, capability_id: `${name}.undeclared`, action: { ...start.action, background_job: undefined } };
  const query = { ...undeclared, capability_id: `${name}.query`, operation: "query" as const, action: { ...undeclared.action, kind: "query" as const } };
  const behavior = {
    work: async (_context: PluginStartContext, _control: PluginExecutionControl) => "saved result",
    beforeStart: async (_caller: ActionExecutionContext) => {},
    signal: undefined as AbortSignal | undefined,
  };
  probe.definition.validateUpgrade = ({ context }) => { preflight.push(context); };
  if (scope === "project") probe.definition.stop = async context => {
    assert.throws(() => context.services!.storage!.set("after-stop", "refused"), { code: "plugin.grant_denied" });
    await probe.behavior.stop(context);
  };
  probe.definition.manifest = { ...probe.definition.manifest,
    permissions: probe.definition.manifest.permissions.map(item => ({ ...item, required: true })),
    actions: [...probe.definition.manifest.actions!, status, start, serial, undeclared, query],
    routes: [...probe.definition.manifest.routes!, { route_id: "background", method: "POST", path: "/background", permission: `${name}:write` }] };
  const original = probe.definition.start;
  probe.definition.start = async context => {
    const contribution = await original(context);
    assert.equal(contribution.kind, "app");
    const run = async (caller: ActionExecutionContext, value: unknown) => {
      callers.push(caller); const { id } = value as { id: string };
      await behavior.beforeStart(caller);
      const handle = await context.services!.background!.start(async control => {
        controls.push(control);
        try {
          const text = await behavior.work(context, control);
          await control.beforeEffect(); control.assert_authority_current?.();
          context.services!.storage!.set(`result.${id}`, text); return text;
        } catch (error) {
          await control.beforeEffect(); control.assert_authority_current?.();
          context.services!.storage!.set(`failure.${id}`, "failed"); throw error;
        }
      }, { signal: behavior.signal });
      handles.push(handle); return { id, state: "running" };
    };
    const binding = bindPluginActionRoute(context, start, request => request.body as { id: string }, "background");
    return { ...contribution, actions: [...contribution.actions!,
      { ...status, handle: (_caller, value) => { const { id } = value as { id: string }; return { state: context.services!.storage!.get(`result.${id}`) ? "succeeded" : context.services!.storage!.get(`failure.${id}`) ? "failed" : "running" }; } },
      ...[start, serial, undeclared, query].map(definition => ({ ...definition, handle: run })),
    ], routes: [...contribution.routes!, { ...binding, handle: request => { requests.push(request); return binding.handle(request); } }] };
  };
  return { ...probe, start, status, serial, undeclared, query, behavior, lifecycle: probe.behavior, preflight, handles, controls, callers, requests,
    stored: (key: string) => probe.contexts.at(-1)!.services!.storage!.get(key) };
}
