import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkHostProjectReference, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { defineHomeBackgroundTasksAction, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { startProjectPlugins } from "./plugin-callers.js";

/*
 * A plugin that is not Coding and answers the Home's background-task query (PG-043): the Home must list what any plugin
 * declares, so a test that shows it needs a plugin the Home has never heard of. Its answer is whatever the test sets, so it also
 * stands for a third-party plugin that answers badly: its output schema accepts any object, and the Host checks the rest.
 */

export const BACKGROUND_PLUGIN_ID = "io.molis.work.example.homebg";
const READ = "homebg:read";

export function backgroundPlugin(answer: (projectId: string) => unknown) {
  const state = { answer, calls: [] as Array<{ project: string | null; query_only: boolean }> };
  const query = defineHomeBackgroundTasksAction("homebg.tasks", "示例后台任务", [READ]);
  // A third-party plugin may declare any schema for its answer; the page's rows are checked again by the Host.
  const declared = { ...query, action: { ...query.action, output_schema: { type: "object" as const } } };
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: BACKGROUND_PLUGIN_ID, version: "1.0.0", name: "homebg", kind: "app",
    publisher: { publisher_id: "example", signature: "home-background" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: READ, required: true, reason: "读自己的后台任务" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [declared] },
  async start() {
    return { kind: "app", views: [], actions: [{ ...declared, async handle(caller: ActionExecutionContext) {
      state.calls.push({ project: caller.project_id ?? null, query_only: caller.query_only === true });
      return await state.answer(caller.project_id ?? "");
    } }] };
  } };
  return { definition, state };
}

export type BackgroundPlugin = ReturnType<typeof backgroundPlugin>;

/**
 * Projects under a Host that has opened all but `closed` (the Home reads only open projects), the plugin off in `off`.
 */
export async function backgroundRig(t: TestContext, plugin: BackgroundPlugin, names: readonly string[], { off = [], closed = [] }: { off?: readonly string[]; closed?: readonly string[] } = {}) {
  const home = await mkdtemp(join(tmpdir(), "home-background-"));
  const references = new Map<string, LocalHostProjectReference>(), catalog: Array<{ project_id: string; display_name: string }> = [];
  for (const name of names) {
    const project = await withCatalog({ homeDirectory: home }, projects => projects.createProject({ display_name: name, actor_id: "user" }));
    references.set(name, molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path }));
    catalog.push({ project_id: project.project_id, display_name: name });
  }
  const offIds = new Set(off.map(name => references.get(name)!.project_id));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [plugin.definition] },
    actionAvailability: (caller, view) => view.provider.plugin_id === BACKGROUND_PLUGIN_ID && offIds.has(caller.project_id ?? "")
      ? { available: false, code: "actions.plugin_disabled", reason: "这个项目里停用了" } : { available: true } });
  // The Home reads each project's plugin manifest by the catalog the product binds before serving; without it the lookup refuses.
  host.configurePersonalPlanning(home, withCatalog);
  t.after(async () => { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } });
  for (const [name, reference] of references) if (!closed.includes(name)) await startProjectPlugins(host, reference);
  return { host, catalog, project: (name: string) => references.get(name)! };
}
