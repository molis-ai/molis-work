import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkHostProjectReference, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { ActionError, defineBackgroundTasksAction, defineSubjectContextAction, defineTaskServesAction, defineWorkEventsAction, subjectContext, type ActionExecutionContext, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ACCEPTANCE_REPORT_PERMISSION, acceptanceActions } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { startProjectPlugins } from "./plugin-callers.js";

/*
 * A plugin that is not Coding and answers the Home's background-task query (PG-043): the Home must list what any plugin
 * declares, so a test that shows it needs a plugin the Home has never heard of. Its answer is whatever the test sets, so it also
 * stands for a third-party plugin that answers badly: its output schema accepts any object, and the Host checks the rest.
 */

export const BACKGROUND_PLUGIN_ID = "com.example.homebg";
const READ = "homebg:read";

/**
 * `reader`: the plugin also reads its own tasks back (`homebg_task`), so a caller other than the plugin can show it reads the task.
 * `relay`: the plugin also hands a requirement list on to the platform as itself (`homebg.relay.set`), so a test can show what a
 * plugin's onward call does not carry (S-acceptance-subject-owner).
 */
export function backgroundPlugin(answer: (projectId: string) => unknown, { reader = false, relay = false }: { reader?: boolean; relay?: boolean } = {}) {
  const state = { answer, calls: [] as Array<{ project: string | null; query_only: boolean }>, stops: [] as Array<{ project: string | null; job: string }>,
    stop: (async job => ({ stopped: job })) as (job: string) => Promise<unknown>,
    // The answers it was given to what its tasks ask (specs/work-line §4.4), as the plugin's own action received them.
    answers: [] as Array<{ project: string | null; job: string; verdict: string; note?: string; audience: string }>,
    // What it registers on the work line (specs/work-line §5): nothing until a test sets it.
    events: ((): unknown => ({ source: { surface: "example", title: "示例", icon: "list" }, events: [] })) as (projectId: string) => unknown, eventCalls: [] as Array<{ project: string | null; query_only: boolean }>,
    // Which event each of its tasks is done for, kept by the plugin itself (the `serves` relation): only the tasks named here exist.
    serves: new Map<string, ActionSubject[]>(), servesCalls: [] as Array<{ role: string; task: string; event?: string; audience: string }>,
    servesAnswer: undefined as ((role: string) => unknown) | undefined };
  const query = defineBackgroundTasksAction("homebg.tasks", 1, ["homebg_task"], "示例后台任务", [READ]);
  // A third-party plugin may declare any schema for its answer; the page's rows are checked again by the Host.
  const declared = { ...query, action: { ...query.action, output_schema: { type: "object" as const } } };
  // What a row's stop command names: the plugin's own action, called by the mainline service as the person (specs/work-line §6).
  const stop = { capability_id: "homebg.stop", version: 1, operation: "command" as const, action: { title: "停止示例任务", description: "停止一个示例后台任务。", kind: "operation" as const, scope: "project" as const,
    effect: "write" as const, audiences: ["user" as const], permissions: [READ], subject_kinds: [],
    input_schema: { type: "object" as const, properties: { job: { type: "string" as const } }, required: ["job"], additionalProperties: false }, output_schema: { type: "object" as const } } };
  // What a decision's answers name: the plugin's own action, called by the mainline service as the person; `note` comes with 「改一下」.
  const answering = { capability_id: "homebg.answer", version: 1, operation: "command" as const, action: { title: "回答示例任务", description: "回答一个示例后台任务要你定的事。", kind: "operation" as const, scope: "project" as const,
    effect: "write" as const, audiences: ["user" as const], permissions: [READ], subject_kinds: [],
    input_schema: { type: "object" as const, properties: { job: { type: "string" as const }, verdict: { type: "string" as const }, note: { type: "string" as const } }, required: ["job", "verdict"], additionalProperties: false },
    output_schema: { type: "object" as const } } };
  const events = defineWorkEventsAction("homebg.events", 1, ["homebg_item"], "示例事件", [READ]);
  const read = defineSubjectContextAction("homebg.task.read", 1, "homebg_task", "示例任务", [READ]);
  const relaySet = { capability_id: "homebg.relay.set", version: 1, operation: "command" as const, action: { title: "转交要求", description: "把一份要求原样交给平台。", kind: "operation" as const,
    scope: "project" as const, effect: "write" as const, audiences: ["agent" as const], permissions: [READ], subject_kinds: [],
    input_schema: { type: "object" as const }, output_schema: { type: "object" as const } } };
  const relation = (["list", "bind", "release", "create"] as const).map(role => defineTaskServesAction(role, `homebg.serves.${role}`, 1, ["homebg_task"], `示例任务的去处（${role}）`, [READ]));
  const definition: PluginDefinition = { manifest: { schema_version: 1, host_api_version: 1, plugin_id: BACKGROUND_PLUGIN_ID, version: "1.0.0", name: "homebg", kind: "app",
    publisher: { publisher_id: "example", signature: "home-background" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: READ, required: true, reason: "读自己的后台任务" },
      ...(relay ? [{ permission: ACCEPTANCE_REPORT_PERMISSION, required: true, reason: "把要求交给平台" }] : [])],
    capabilities: { provides: [], consumes: relay ? [acceptanceActions.set.capability_id] : [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    actions: [declared, stop, answering, events, ...relation, ...(reader ? [read] : []), ...(relay ? [relaySet] : [])] },
  async start(context: PluginStartContext) {
    return { kind: "app", views: [], actions: [{ ...declared, async handle(caller: ActionExecutionContext) {
      state.calls.push({ project: caller.project_id ?? null, query_only: caller.query_only === true });
      return await state.answer(caller.project_id ?? "");
    } }, { ...stop, async handle(caller: ActionExecutionContext, input: unknown) {
      const job = (input as { job: string }).job;
      state.stops.push({ project: caller.project_id ?? null, job });
      return await state.stop(job);
    } }, { ...answering, async handle(caller: ActionExecutionContext, input: unknown) {
      const { job, verdict, note } = input as { job: string; verdict: string; note?: string };
      state.answers.push({ project: caller.project_id ?? null, job, verdict, ...(note === undefined ? {} : { note }), audience: caller.audience });
      return { answered: verdict };
    } }, { ...events, async handle(caller: ActionExecutionContext) {
      state.eventCalls.push({ project: caller.project_id ?? null, query_only: caller.query_only === true });
      return await state.events(caller.project_id ?? "") as never;
    } }, ...relation.map(part => ({ ...part, async handle(caller: ActionExecutionContext, input: unknown) {
      const role = part.action.placement_relation!.role, { task, event } = input as { task: ActionSubject; event?: ActionSubject };
      state.servesCalls.push({ role, task: task.id, ...(event ? { event: event.id } : {}), audience: caller.audience });
      if (!state.serves.has(task.id)) throw new ActionError("homebg.task_missing", "没有这个任务", { kind: "not_found" });
      if (role === "bind") state.serves.set(task.id, [event!]);
      if (role === "release") state.serves.set(task.id, []);
      if (role === "create") state.serves.set(task.id, [{ kind: "homebg_item", id: `from-${task.id}` }]);
      return (state.servesAnswer?.(role) ?? { serves: state.serves.get(task.id)! }) as never;
    } })), ...(reader ? [{ ...read, async handle(_caller: ActionExecutionContext, input: unknown) {
      const id = (input as { subject_id: string }).subject_id;
      return subjectContext({ subject: { kind: "homebg_task", id }, revision: "1", title: `任务 ${id}`, content: "示例任务的正文" });
    } }] : []), ...(relay ? [{ ...relaySet, async handle(caller: ActionExecutionContext, input: unknown) {
      return await context.services!.actions!.invoke(acceptanceActions.set, input as never, caller) as never;
    } }] : [])] };
  } };
  return { definition, state };
}

export type BackgroundPlugin = ReturnType<typeof backgroundPlugin>;

/**
 * Projects under a Host that has opened all but `closed` (the Home reads only open projects), the plugin off in `off`.
 */
export async function backgroundRig(t: TestContext, plugin: BackgroundPlugin, names: readonly string[], { off = [], closed = [] }: { off?: readonly string[]; closed?: readonly string[] } = {}) {
  const home = await mkdtemp(join(tmpdir(), "home-background-"));
  const references = new Map<string, LocalHostProjectReference>(), catalog: Array<{ project_id: string; display_name: string; database_path: string }> = [];
  for (const name of names) {
    const project = await withCatalog({ homeDirectory: home }, projects => projects.createProject({ display_name: name, actor_id: "user" }));
    references.set(name, molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path }));
    catalog.push({ project_id: project.project_id, display_name: name, database_path: project.database_path });
  }
  const offIds = new Set(off.map(name => references.get(name)!.project_id));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [plugin.definition] },
    actionAvailability: (caller, view) => view.provider.plugin_id === BACKGROUND_PLUGIN_ID && offIds.has(caller.project_id ?? "")
      ? { available: false, code: "actions.plugin_disabled", reason: "这个项目里停用了" } : { available: true } });
  // The Home reads each project's plugin manifest by the catalog the product binds before serving; without it the lookup refuses.
  host.configurePersonalPlanning(home, withCatalog);
  t.after(async () => { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } });
  for (const [name, reference] of references) if (!closed.includes(name)) await startProjectPlugins(host, reference);
  return { home, host, catalog, project: (name: string) => references.get(name)! };
}
