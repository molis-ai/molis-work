import assert from "node:assert/strict";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  PLUGIN_LOCAL_TOOLS_PERMISSION,
  type PluginDefinition,
  type PluginLocalToolsClient,
  type PluginLocalToolsDeclaration,
  type PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { person } from "./home-runtime.js";

export const LOCAL_TOOLS: PluginLocalToolsDeclaration = {
  tools: [{ tool_id: "alpha", binaries: ["alpha-cli", "alpha"] }, { tool_id: "beta", binaries: ["beta-cli"] }],
  directories: ["~/molis-local-tools-test-never-exists/bin"],
  custom_executables: true,
};

/** A Home plugin that declares `local_tools` and exposes the service through real actions; the service is what the Host built for it. */
/** `null` declares none: what a plugin that does not look for tools is. */
export function localToolsProbe(name = "toolsprobe", declaration: PluginLocalToolsDeclaration | null = LOCAL_TOOLS) {
  const id = `io.molis.work.example.${name}`, permissions = ["storage:private", PLUGIN_LOCAL_TOOLS_PERMISSION], contexts: PluginStartContext[] = [];
  const action = (suffix: string, operation: "query" | "command"): ActionDefinition<{ path?: string }, unknown> => ({
    capability_id: `${name}.${suffix}`, version: 1, operation,
    action: { title: suffix, description: "Ask the Host's local tools service", kind: operation === "query" ? "query" : "operation", scope: "home", audiences: ["user"],
      permissions: [PLUGIN_LOCAL_TOOLS_PERMISSION], subject_kinds: [], scheduling: "concurrent",
      input_schema: { type: "object", additionalProperties: false, properties: { path: { type: "string" } } } },
  });
  const find = action("find", "query"), check = action("check", "query"), refresh = action("refresh", "command");
  const client = (): PluginLocalToolsClient => contexts.at(-1)?.services?.localTools ?? assert.fail("no local tools service");
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `local-tools-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: permissions.map(permission => ({ permission, required: permission === "storage:private", reason: "Look for tools" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [find, check, refresh],
    ...(declaration ? { local_tools: declaration } : {}) },
    async start(context) {
      contexts.push(context);
      return { kind: "app", views: [], actions: [
        { ...find, handle: () => client().find() },
        { ...check, handle: (_caller, input) => client().isExecutable(input.path ?? "") },
        { ...refresh, handle: () => client().refresh() },
      ] };
    } };
  return { id, definition, permissions, contexts, find, check, refresh, client, entry: () => ({ definition }),
    caller: () => person(permissions) };
}

export async function grantLocalTools(host: MolisWorkLocalHost, probe: ReturnType<typeof localToolsProbe>) {
  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(probe.id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, probe.permissions);
  await platform.supervisor.restart(probe.id);
  return { platform, install: platform.runtime.get(install.install_id) };
}
