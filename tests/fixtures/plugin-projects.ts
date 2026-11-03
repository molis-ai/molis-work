import assert from "node:assert/strict";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  PLUGIN_PROJECTS_EXIST_PERMISSION,
  type PluginDefinition,
  type PluginProjectsClient,
  type PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { HOST_BUILD_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { person } from "./home-runtime.js";

/** A Home plugin that asks `services.projects` through a real action; `declare: false` is one that never asked for the permission. */
export function projectsProbe(name = "projectsprobe", declare = true) {
  const id = `io.molis.work.example.${name}`, permissions = declare ? ["storage:private", PLUGIN_PROJECTS_EXIST_PERMISSION] : ["storage:private"], contexts: PluginStartContext[] = [];
  const exist: ActionDefinition<{ ids: string[] }, unknown> = { capability_id: `${name}.exist`, version: 1, operation: "query",
    action: { title: "exist", description: "Ask the Host's projects service", kind: "query", scope: "home", audiences: ["user"], permissions, subject_kinds: [], scheduling: "concurrent",
      input_schema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids: { type: "array" } } } } };
  const client = (): PluginProjectsClient => contexts.at(-1)?.services?.projects ?? assert.fail("no projects service");
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `projects-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: permissions.map(permission => ({ permission, required: permission === "storage:private", reason: "Ask whether projects exist" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [exist] },
    async start(context) {
      contexts.push(context);
      return { kind: "app", views: [], actions: [{ ...exist, handle: (_caller, input) => client().exist(input.ids) }] };
    } };
  return { id, definition, permissions, contexts, exist, client,
    /** The service is a platform service for a plugin of the Host's build, which holds every permission it declares; the fixture stands in for one. */
    entry: () => ({ definition, trust: HOST_BUILD_TRUST }),
    caller: () => person(permissions) };
}

/** What the person grants the running probe: by default everything it declared; fewer is the person turning `projects:exist` off. */
export async function grantProjects(host: MolisWorkLocalHost, probe: ReturnType<typeof projectsProbe>, permissions: readonly string[] = probe.permissions) {
  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(probe.id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, [...permissions]);
  await platform.supervisor.restart(probe.id);
  return { platform, install: platform.runtime.get(install.install_id) };
}
