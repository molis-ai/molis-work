import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { collectHomeAggregate, homeAggregatePorts, molisWorkHostProjectReference, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { ActionError, type ActionDefinition, type ActionExecutionContext, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { inspectActionDeclarations, isHomeAggregateQuery } from "@molis-ai/molis-work-plugin-sdk";
import { startProjectPlugins } from "./fixtures/plugin-callers.js";

/*
 * S-49 (PG-043): the Home gathers what plugins still run across projects by calling, in each open project, the queries they declare
 * `home_aggregate`, each call the person's own in that project with that project's grants and marked read-only. Everything here goes
 * through a real Host and a plugin it starts in each project; each refusal shows the call that did not happen.
 */

const PLUGIN_ID = "io.molis.work.example.homeagg", READ = "homeagg:read", EXTRA = "homeagg:extra";
const TYPE = "io.molis.work.example.homeagg.running.v1", OTHER = "io.molis.work.example.homeagg.other.v1";
const input: ActionSchema = { type: "object", additionalProperties: false, properties: { nest: { type: "boolean" } } };
const output: ActionSchema = { type: "object", additionalProperties: false, required: ["project"], properties: { project: { type: "string" } } };
const define = (suffix: string, operation: "query" | "command", permissions: string[], extra: Partial<ActionDefinition["action"]> = {}): ActionDefinition<{ nest?: boolean }, { project: string }> => ({
  capability_id: `homeagg.${suffix}`, version: 1, operation,
  action: { title: suffix, description: "首页聚合探针的动作", kind: operation === "query" ? "query" : "operation", scope: "project", scheduling: "concurrent",
    audiences: ["user"], subject_kinds: [], permissions, input_schema: input, output_schema: output, output_type: TYPE, ...extra } });

/** What the Home gathers. */
const tasks = define("tasks", "query", [READ], { home_aggregate: true });
/** The same type, not declared for the Home. */
const plain = define("plain", "query", [READ]);
/** Declared, of another type. */
const elsewhere = define("elsewhere", "query", [READ], { home_aggregate: true, output_type: OTHER });
/** Declared, needing a permission the installation was not granted. */
const ungranted = define("ungranted", "query", [READ, EXTRA], { home_aggregate: true });
/** A command of the same type, which the plugin's own query calls when asked to. */
const touch = define("touch", "command", [READ], { audiences: ["user", "plugin"] });

function aggregatePlugin() {
  const waits = new Map<string, (signal?: AbortSignal) => Promise<void>>();
  const contexts: PluginStartContext[] = [], calls: { id: string; project: string | null; query_only: boolean }[] = [], nested: string[] = [], touched: string[] = [];
  const sdk = (projectId: string) => contexts.filter(context => context.project_id === projectId).at(-1)?.services?.actions ?? assert.fail(`homeagg started in ${projectId}`);
  const answer = (definition: ActionDefinition) => ({ ...definition, async handle(caller: ActionExecutionContext, value: unknown) {
    calls.push({ id: definition.capability_id, project: caller.project_id ?? null, query_only: caller.query_only === true });
    if (definition === tasks) await waits.get(caller.project_id!)?.(caller.signal);
    if ((value as { nest?: boolean }).nest) {
      try { await sdk(caller.project_id!).invoke(touch, {}); nested.push("ran"); }
      catch (error) { nested.push(error instanceof ActionError ? error.code : "not-an-action-error"); }
    }
    return { project: caller.project_id };
  } });
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: "homeagg", kind: "app",
    publisher: { publisher_id: "example", signature: "home-aggregate" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: READ, required: true, reason: "读自己的进行中工作" }, { permission: EXTRA, required: false, reason: "多读一些" }],
    capabilities: { provides: [], consumes: [touch.capability_id] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    actions: [tasks, plain, elsewhere, ungranted, touch] },
  async start(context) {
    contexts.push(context);
    return { kind: "app", views: [], actions: [...[tasks, plain, elsewhere, ungranted].map(answer),
      { ...touch, handle(caller: ActionExecutionContext) { touched.push(caller.project_id ?? ""); return { project: caller.project_id }; } }] };
  } };
  return { definition, calls, nested, touched, waits };
}

async function rig(t: import("node:test").TestContext) {
  const home = await mkdtemp(join(tmpdir(), "home-aggregate-"));
  const references: LocalHostProjectReference[] = [];
  for (const name of ["A", "B", "Off", "Closed"]) {
    const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: name, actor_id: "user" }));
    references.push(molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path }));
  }
  const [a, b, off, closed] = references as [LocalHostProjectReference, LocalHostProjectReference, LocalHostProjectReference, LocalHostProjectReference];
  const plugin = aggregatePlugin();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [plugin.definition] },
    actionAvailability: (caller, view) => view.provider.plugin_id === PLUGIN_ID && caller.project_id === off.project_id
      ? { available: false, code: "actions.plugin_disabled", reason: "这个项目里停用了" } : { available: true } });
  t.after(async () => { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } });
  const open = () => host.status().projects.map(project => project.project_id).sort();
  return { host, plugin, a, b, off, closed, open };
}

test("S-49 PG-043 the Home calls only declared read-only queries, one call per open project with its own grants, and keeps each answer apart", async t => {
  const { host, plugin, a, b, off, closed, open } = await rig(t);
  for (const reference of [a, b, off]) await startProjectPlugins(host, reference);
  assert.deepEqual(open(), [a, b, off].map(reference => reference.project_id).sort());

  const result = await collectHomeAggregate<{ project: string }>(homeAggregatePorts(host), TYPE, { nest: true });
  const expected = [a, b].map(reference => reference.project_id).sort();
  assert.deepEqual(plugin.calls.map(call => `${call.id}@${call.project}:${call.query_only}`).sort(), expected.map(project => `${tasks.capability_id}@${project}:true`),
    "only the declared query of the asked type, in each open project where the plugin is on and granted, marked read-only; never the undeclared, other-type, ungranted or command");
  assert.deepEqual(result.answers.map(item => ({ project: item.project_id, capability: item.source.capability_id, plugin: item.plugin_id, output: item.output.project }))
    .sort((x, y) => x.project.localeCompare(y.project)), expected.map(project => ({ project, capability: tasks.capability_id, plugin: PLUGIN_ID, output: project })),
    "each project's answer stays its own");
  assert.deepEqual(result.issues, [], "a plugin that is off in a project is passed over, not reported");
  assert.equal(plugin.touched.length, 0, "whatever the query calls in turn is read-only too: its command did not run");
  assert.equal(plugin.nested.length, 2); assert.ok(!plugin.nested.includes("ran"), plugin.nested.join());
  assert.ok(!open().includes(closed.project_id), "a project never opened is not opened to be read");

  // A project closed since is neither called nor opened again.
  assert.equal(await host.closeProject(b), true);
  plugin.calls.length = 0;
  const after = await collectHomeAggregate<{ project: string }>(homeAggregatePorts(host), TYPE, {});
  assert.deepEqual(plugin.calls.map(call => call.project), [a.project_id]);
  assert.deepEqual(after.answers.map(item => item.project_id), [a.project_id]);
  assert.deepEqual(open(), [a, off].map(reference => reference.project_id).sort());

  // SYS-15-D2: the query declaration is itself read-only, including a direct call by the person.
  const ports = homeAggregatePorts(host), caller = await ports.context(a), source = after.answers[0]!.source;
  await ports.client(a).invoke(caller, source, { nest: true });
  assert.deepEqual(plugin.touched, []); assert.equal(plugin.nested.at(-1), "actions.forbidden");
});

test("S-49 PG-043 a home_aggregate declaration that writes, calls a model, costs money, reaches the Home scope or names no type is refused", () => {
  assert.deepEqual(inspectActionDeclarations([tasks], undefined), []);
  assert.equal(isHomeAggregateQuery(tasks), true);
  assert.equal(isHomeAggregateQuery(plain), false, "not declared");
  const { output_type: _type, ...untyped } = tasks.action;
  const refused: [string, ActionDefinition][] = [
    ["a command", { ...tasks, operation: "command", action: { ...tasks.action, kind: "operation" } }],
    ["a query of another kind", { ...tasks, action: { ...tasks.action, kind: "judgment" } }],
    ["one that writes", { ...tasks, action: { ...tasks.action, effect: "write" } }],
    ["one that calls a model", { ...tasks, action: { ...tasks.action, permissions: [READ, "model:invoke"] } }],
    ["one that costs money", { ...tasks, action: { ...tasks.action, execution: { cost: "metered" } } }],
    ["one of the Home scope", { ...tasks, action: { ...tasks.action, scope: "home" } }],
    ["one with no output type", { ...tasks, action: untyped }],
    ["a flag that is not `true`", { ...tasks, action: Object.assign({ ...tasks.action }, { home_aggregate: "yes" }) }],
  ];
  for (const [label, definition] of refused) {
    assert.ok(inspectActionDeclarations([definition], undefined).some(problem => problem.includes("首页聚合")), `${label} is refused when it is declared`);
    assert.equal(isHomeAggregateQuery(definition), false, `${label} is never gathered`);
  }
});

// SYS-05: real Host queries with one non-cooperating provider; timeout does not withhold other projects or accept late results.
test("SYS-05 a stalled Home provider is cancelled, other projects return, and a later retry works", { timeout: 15_000 }, async t => {
  const { host, plugin, a, b } = await rig(t);
  for (const ref of [a, b]) await startProjectPlugins(host, ref);
  const release = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  let providerSignal: AbortSignal | undefined;
  plugin.waits.set(a.project_id, async signal => { providerSignal = signal; await release.promise; });
  const result = await collectHomeAggregate<{ project: string }>(homeAggregatePorts(host), TYPE, {});
  assert.deepEqual(result.answers.map(answer => answer.project_id), [b.project_id]);
  assert.deepEqual(result.issues.map(issue => [issue.project_id, issue.source?.capability_id, issue.code]), [[a.project_id, tasks.capability_id, "actions.timeout"]]);
  assert.equal(providerSignal?.aborted, true);
  release.resolve();
  plugin.waits.clear();
  const retry = await collectHomeAggregate<{ project: string }>(homeAggregatePorts(host), TYPE, {});
  assert.deepEqual(retry.answers.map(answer => answer.project_id).sort(), [a.project_id, b.project_id].sort());
  assert.deepEqual(retry.issues, []);
  assert.equal(result.answers.length, 1, "a late result cannot mutate the returned partial snapshot");
});

test("SYS-05 Home discovery has a deadline and cancelling the caller rejects the whole read", { timeout: 15_000 }, async t => {
  const { host, plugin, a, b } = await rig(t);
  for (const ref of [a, b]) await startProjectPlugins(host, ref);
  const ports = homeAggregatePorts(host), held = Promise.withResolvers<void>();
  t.after(() => held.resolve());
  let discoverySignal: AbortSignal | undefined;
  const result = await collectHomeAggregate({ ...ports, context: async (reference, signal) => {
    if (reference.project_id === a.project_id) { discoverySignal = signal; await held.promise; }
    return ports.context(reference, signal);
  } }, TYPE, {});
  assert.equal(discoverySignal?.aborted, true);
  assert.deepEqual(result.answers.map(answer => answer.project_id), [b.project_id]);
  assert.deepEqual(result.issues, [{ project_id: a.project_id, source: null, code: "actions.timeout" }]);
  held.resolve();
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), controller = new AbortController();
  t.after(() => release.resolve());
  plugin.waits.set(a.project_id, async () => { started.resolve(); await release.promise; });
  const pending = collectHomeAggregate(ports, TYPE, {}, controller.signal);
  const reason = new Error("person left the Home");
  const rejected = assert.rejects(pending, error => error === reason);
  await started.promise;
  controller.abort(reason);
  await rejected;
  release.resolve();
});
