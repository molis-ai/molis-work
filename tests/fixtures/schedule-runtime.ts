import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { scheduleServiceFor } from "@molis-ai/molis-work-app-local-host";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { reminderActions, scheduledOperationActions, SCHEDULE_PLUGIN_ID } from "@molis-ai/molis-work-plugin-schedule";
import { openTestHome } from "./test-home.js";
import { createLocalFeedApplication } from "./feed-library.js";

/** A normal Runtime plugin consumes Schedule's public actions; the caller is the ordinary person, not a magic actor prefix. */
export function scheduledOwnerPlugin() {
  const id = "io.molis.work.example.scheduled-owner";
  const action: ActionDefinition = { capability_id: "scheduled-owner.summarize", version: 1, operation: "command", action: {
    title: "汇总", description: "汇总当前内容", local_id: "summarize", kind: "operation", scope: "project", audiences: ["plugin"], permissions: [], subject_kinds: [], scheduling: "concurrent",
    input_schema: { type: "object", additionalProperties: false, properties: { text: { type: "string" } }, required: ["text"] }, output_schema: { type: "object" },
  } };
  const contexts: PluginStartContext[] = [];
  let calls = 0, execute: (caller: ActionExecutionContext, input: unknown) => Promise<unknown> = async (_caller, input) => input;
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, name: "定时笔记", version: "1.0.0", kind: "app",
    publisher: { publisher_id: "example", signature: "scheduled-owner" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], permissions: [],
    capabilities: { provides: [], consumes: [...Object.values(reminderActions), ...Object.values(scheduledOperationActions)].map(item => item.capability_id) },
    actions: [action], artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
    async start(value) { contexts.push(value); return { kind: "app", actions: [{ ...action, handle: async (caller, input) => { calls++; return execute(caller, input); } }] }; } };
  const context = (projectId?: string) => { const value = contexts.findLast(item => item.project_id === projectId); assert.ok(value); return value; };
  return { id, definition, context, actions: (projectId?: string) => context(projectId).services!.actions!, calls: () => calls, execute: (handler: typeof execute) => { execute = handler; } };
}

export async function scheduleRuntimeFixture(t: TestContext, plugins: readonly string[] = ["feed", "inbox"]) {
  const owner = scheduledOwnerPlugin(), { id, definition } = owner;
  const f = await openTestHome(t, { host: { pluginFixtures: { project: [definition] } } }), project = await f.createProject("Schedule public runtime", plugins);
  const client = f.host.actionClient(project.reference);
  const prepare = () => client.discover({ actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [] });
  await prepare(); owner.context(project.project_id);
  const store = () => f.host.withProject(project.reference, runtime => runtime.store);
  const record = async () => new SqlitePluginRuntimeRepository((await store()).db).list().find(row => row.plugin_id === id)!;
  const inbox = async () => createLocalFeedApplication((await store()).db).snapshot(project.project_id).feed_items.filter(item => item.source_id === "plugin-notifications:" + SCHEDULE_PLUGIN_ID);
  return { ...f, project, id, client, prepare, store, record, inbox, calls: owner.calls, execute: owner.execute,
    get sdk() { return owner.actions(project.project_id); },
    tick: async (at: string) => scheduleServiceFor((await store()).db).tick(new Date(Date.parse(at) + 1000)),
    reopen: async () => { await f.host.closeProject(project.reference); await prepare(); },
  };
}
