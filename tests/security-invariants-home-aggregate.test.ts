import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { activeLocale, collectHomeAggregate, homeAggregatePorts, homeBackgroundTasks, HomeAggregateInputEach, HomeConsentLedger, LocalHost, molisWorkHostProjectReference, MolisWorkLocalHost, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { ActionError, BACKGROUND_TASKS_OUTPUT_TYPE, type ActionDefinition, type ActionExecutionContext, type ActionSchema, type BackgroundTaskCollection } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { inspectActionDeclarations, isHomeAggregateQuery } from "@molis-ai/molis-work-plugin-sdk";
import { FunctionsService } from "@molis-ai/molis-work-module-judgment-rules";
import { startProjectPlugins } from "./fixtures/plugin-callers.js";
import { jobProbe } from "./fixtures/plugin-jobs.js";

/*
 * S-49 (PG-043): the Home gathers what plugins still run across projects by calling, in each open project, the queries they declare
 * `home_aggregate`, each call the person's own in that project with that project's grants and marked read-only. Everything here goes
 * through a real Host and a plugin it starts in each project; each refusal shows the call that did not happen.
 */

const PLUGIN_ID = "com.example.homeagg", READ = "homeagg:read", EXTRA = "homeagg:extra";
const TYPE = "com.example.homeagg.running.v1", OTHER = "com.example.homeagg.other.v1";
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
    if (definition === tasks) {
      await waits.get(caller.project_id!)?.(caller.signal);
      // AAP-03: as an owner does before reading after an external wait, recheck the original caller's authority.
      await caller.beforeEffect();
    }
    if ((value as { nest?: boolean }).nest) {
      try { await sdk(caller.project_id!).invoke(touch, {}); nested.push("ran"); }
      catch (error) { nested.push(error instanceof ActionError ? error.code : "not-an-action-error"); }
    }
    return { project: caller.project_id };
  } });
  const definition: PluginDefinition = { manifest: { schema_version: 1, host_api_version: 1, plugin_id: PLUGIN_ID, version: "1.0.0", name: "homeagg", kind: "app",
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

/**
 * The Home's ports read only the projects open now: what these tests are about. Projects asleep or not opened yet are read through
 * `resting` (batch 103-1), tested on their own below; its background pass would open this rig's other projects while these run.
 */
const openOnly = (host: MolisWorkLocalHost) => ({ ...homeAggregatePorts(host), resting: undefined });

async function rig(t: import("node:test").TestContext) {
  const home = await mkdtemp(join(tmpdir(), "home-aggregate-"));
  const references: LocalHostProjectReference[] = [];
  for (const name of ["A", "B", "Off", "Closed"]) {
    const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: name, actor_id: "user" }));
    references.push(molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path }));
  }
  const [a, b, off, closed] = references as [LocalHostProjectReference, LocalHostProjectReference, LocalHostProjectReference, LocalHostProjectReference];
  const plugin = aggregatePlugin();
  const disabled = new Set([off.project_id]);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [plugin.definition] },
    actionAvailability: (caller, view) => view.provider.plugin_id === PLUGIN_ID && disabled.has(caller.project_id!)
      ? { available: false, code: "actions.plugin_disabled", reason: "这个项目里停用了" } : { available: true } });
  // The aggregate reads each project's plugin manifest by the Host's catalog; the product binds it before serving, and without one
  // the manifest lookup refuses (T-319). Bind the same owner the test already uses to create its projects.
  host.configurePersonalPlanning(home, withCatalog);
  t.after(async () => { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } });
  const open = () => host.status().projects.map(project => project.project_id).sort();
  return { host, plugin, a, b, off, closed, open, disabled };
}

// AAP-01 AAP-02 AAP-06: complete authorized answers without full directory copies or closing Functions on every read.
test("S-49 PG-043 the Home calls only declared read-only queries, one call per open project with its own grants, and keeps each answer apart", async t => {
  const { host, plugin, a, b, off, closed, open } = await rig(t);
  for (const reference of [a, b, off]) await startProjectPlugins(host, reference);
  assert.deepEqual(open(), [a, b, off].map(reference => reference.project_id).sort());

  const status = t.mock.method(LocalHost.prototype, "status", () => { throw new Error("aggregation must not copy the full capability directory"); });
  const functionsClosed = t.mock.method(FunctionsService.prototype, "close");
  const result = await collectHomeAggregate<{ project: string }>(openOnly(host), TYPE, { nest: true });
  assert.equal(status.mock.callCount(), 0);
  assert.equal(functionsClosed.mock.callCount(), 0);
  status.mock.restore();
  const expected = [a, b].map(reference => reference.project_id).sort();
  assert.deepEqual(plugin.calls.map(call => `${call.id}@${call.project}:${call.query_only}`).sort(), expected.map(project => `${tasks.capability_id}@${project}:true`),
    "only the declared query of the asked type, in each open project where the plugin is on and granted, marked read-only; never the undeclared, other-type, ungranted or command");
  assert.deepEqual(result.answers.map(item => ({ project: item.project_id, capability: item.source.capability_id, plugin: item.plugin_id, output: item.output.project }))
    .sort((x, y) => x.project.localeCompare(y.project)), expected.map(project => ({ project, capability: tasks.capability_id, plugin: PLUGIN_ID, output: project })),
    "each project's answer stays its own");
  assert.deepEqual(result.issues, [], "a plugin that is off in a project is passed over, not reported");
  assert.equal(plugin.touched.length, 0, "whatever the query calls in turn is read-only too: its command did not run");
  assert.equal(plugin.nested.length, 2); assert.ok(!plugin.nested.includes("ran"), plugin.nested.join());
  assert.ok(!open().includes(closed.project_id), "reading the open projects does not open another");

  // A project closed since is neither called nor opened again.
  assert.equal(await host.closeProject(b), true);
  plugin.calls.length = 0;
  const after = await collectHomeAggregate<{ project: string }>(openOnly(host), TYPE, {});
  assert.deepEqual(plugin.calls.map(call => call.project), [a.project_id]);
  assert.deepEqual(after.answers.map(item => item.project_id), [a.project_id]);
  assert.deepEqual(open(), [a, off].map(reference => reference.project_id).sort());

  // SYS-15-D2: the query declaration is itself read-only, including a direct call by the person.
  const ports = openOnly(host), caller = await ports.context(a), source = after.answers[0]!.source;
  await ports.client(a).invoke(caller, source, { nest: true });
  assert.deepEqual(plugin.touched, []); assert.equal(plugin.nested.at(-1), "actions.forbidden");
});

test("AAP-03 a project closing after enumeration is skipped and a closed candidate is never reopened", async t => {
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  const { host, plugin, a, b } = await rig(t);
  for (const ref of [a, b]) await startProjectPlugins(host, ref);
  const ports = openOnly(host), candidates = ports.openProjects();
  const held = host.withProject(b, async () => { started.resolve(); await release.promise; });
  await started.promise;
  const closing = host.closeProject(b);
  const result = await collectHomeAggregate<{ project: string }>({ ...ports, openProjects: () => candidates }, TYPE, {});
  assert.deepEqual(result.answers.map(answer => answer.project_id), [a.project_id]);
  assert.deepEqual(result.issues, []);
  assert.ok(!plugin.calls.some(call => call.project === b.project_id));
  release.resolve(); await held; await closing;
  assert.equal(await ports.whileOpen(b, async () => assert.fail("closed project must not run")), undefined);
  assert.ok(!host.projects().some(project => project.project_id === b.project_id));
});

test("AAP-03 a query rechecks authority after waiting across project close or authorization withdrawal", async t => {
  const releases: Array<() => void> = [];
  t.after(() => { for (const release of releases) release(); });
  const { host, plugin, a, b, disabled } = await rig(t);
  for (const ref of [a, b]) await startProjectPlugins(host, ref);
  for (const change of ["revoke", "close"] as const) {
    const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    releases.push(() => release.resolve());
    plugin.waits.set(a.project_id, async () => { started.resolve(); await release.promise; });
    const read = collectHomeAggregate<{ project: string }>(openOnly(host), TYPE, {});
    await started.promise;
    let closing: Promise<boolean> | undefined;
    if (change === "revoke") disabled.add(a.project_id); else closing = host.closeProject(a);
    release.resolve();
    const result = await read;
    assert.deepEqual(result.answers.map(answer => answer.project_id), [b.project_id]);
    assert.deepEqual(plugin.touched, [], "read-only work never gains a write on withdrawal");
    if (closing) await closing;
    else {
      assert.ok(result.issues.some(issue => issue.project_id === a.project_id), "withdrawal is reported");
      disabled.delete(a.project_id); plugin.waits.delete(a.project_id);
      const recovered = await collectHomeAggregate<{ project: string }>(openOnly(host), TYPE, {});
      assert.deepEqual(recovered.answers.map(answer => answer.project_id).sort(), [a.project_id, b.project_id].sort());
    }
  }
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

// AAP-03 SYS-05: real Host queries with one non-cooperating provider; timeout does not withhold other projects or accept late results.
test("SYS-05 a stalled Home provider is cancelled, other projects return, and a later retry works", { timeout: 15_000 }, async t => {
  const { host, plugin, a, b } = await rig(t);
  for (const ref of [a, b]) await startProjectPlugins(host, ref);
  const release = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  let providerSignal: AbortSignal | undefined;
  plugin.waits.set(a.project_id, async signal => { providerSignal = signal; await release.promise; });
  const result = await collectHomeAggregate<{ project: string }>(openOnly(host), TYPE, {});
  assert.deepEqual(result.answers.map(answer => answer.project_id), [b.project_id]);
  assert.deepEqual(result.issues.map(issue => [issue.project_id, issue.source?.capability_id, issue.code]), [[a.project_id, tasks.capability_id, "actions.timeout"]]);
  assert.equal(providerSignal?.aborted, true);
  release.resolve();
  plugin.waits.clear();
  const retry = await collectHomeAggregate<{ project: string }>(openOnly(host), TYPE, {});
  assert.deepEqual(retry.answers.map(answer => answer.project_id).sort(), [a.project_id, b.project_id].sort());
  assert.deepEqual(retry.issues, []);
  assert.equal(result.answers.length, 1, "a late result cannot mutate the returned partial snapshot");
});

test("SYS-05 Home discovery has a deadline and cancelling the caller rejects the whole read", { timeout: 15_000 }, async t => {
  const { host, plugin, a, b } = await rig(t);
  for (const ref of [a, b]) await startProjectPlugins(host, ref);
  const ports = openOnly(host), held = Promise.withResolvers<void>();
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

// S-49 as changed by batch 103-1 (user 2026-11-21): a project put to sleep is answered from its last read while it was not used since,
// marked resting, without being opened or called; one not read since the Host started, or used since, is opened in the background,
// quietly (it goes back to sleep as if unread), and read once with the same read-only rules; one closed on purpose is neither.
test("S-49 B103-01 the Home answers a sleeping project from its last read, opens a project not read yet once in the background, and leaves one closed on purpose", async t => {
  const { host, plugin, a, b, closed, open } = await rig(t);
  await startProjectPlugins(host, a);
  const ports = homeAggregatePorts(host), pass = () => ports.resting!.readings.pass;
  const read = async () => (await collectHomeAggregate<{ project: string }>(ports, TYPE, {})).answers
    .map(answer => `${answer.project_id === a.project_id ? "a" : answer.project_id === b.project_id ? "b" : answer.project_id === closed.project_id ? "closed" : "other"}${answer.resting ? ":resting" : ""}`).sort();
  assert.deepEqual(await read(), ["a"], "only the open project answers now; the others are read in the background");
  await pass();
  assert.ok(open().includes(b.project_id) && open().includes(closed.project_id), "the projects not read yet were opened to be read");
  assert.ok(plugin.calls.filter(call => call.project === closed.project_id).every(call => call.query_only), "with the same read-only call");
  assert.equal(host.projectRest(closed.storage_key).usedAt, 0, "opening it to read it did not count as using it");
  assert.deepEqual(await read(), ["a", "b", "closed"]);
  // Closed on purpose: neither read nor opened again.
  assert.equal(await host.closeProject(b), true);
  assert.deepEqual(await read(), ["a", "closed"]);
  await pass();
  assert.ok(!open().includes(b.project_id), "a project closed on purpose is not opened to be read");
  // Put to sleep unused: answered from its last read, without opening or calling it.
  assert.equal(await host.sleepIfIdle(closed, 0), true);
  plugin.calls.length = 0;
  assert.deepEqual(await read(), ["a", "closed:resting"]);
  await pass();
  assert.ok(!open().includes(closed.project_id) && !plugin.calls.some(call => call.project === closed.project_id), "the sleeping project was neither opened nor called");
  // Used, then asleep again: its last read no longer holds, so it is read again, in the background.
  await host.withProject(closed, async () => undefined);
  assert.equal(await host.sleepIfIdle(closed, 0), true);
  assert.deepEqual(await read(), ["a"]);
  await pass();
  assert.ok(plugin.calls.some(call => call.project === closed.project_id), "read again after it was used");
});

const restingCacheFile = (home: string, storageKey: string) =>
  join(home, "cache", "resting-readings", `${createHash("sha256").update(storageKey).digest("hex")}.json`);

test("S-49 resting readings persist across Host restarts with zero project opens when unchanged, and invalidate on project DB, plugin membership, Home consent, keyOf, or purposeful close", { timeout: 60_000 }, async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "home-aggregate-persist-")));
  const hosts: MolisWorkLocalHost[] = [];
  t.after(async () => {
    for (const host of hosts.reverse()) {
      try { await host.close(); } catch { /* already closed */ }
    }
    await rm(home, { recursive: true, force: true });
  });
  const create = async (name: string) => {
    const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: name, actor_id: "user" }));
    return molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  };
  const p1 = await create("SleptProject");
  const p2 = await create("OpenOnShutdown");
  const startHost = (plugin: ReturnType<typeof aggregatePlugin>, opened: string[]) => {
    const host = new MolisWorkLocalHost({
      homeDirectory: home,
      completeText: null,
      pluginFixtures: { project: [plugin.definition] },
      onRuntimeOpen: ref => { opened.push(ref.project_id); },
    });
    const withHostCatalog = host.configurePersonalPlanning(home, withCatalog);
    hosts.push(host);
    return { host, withHostCatalog };
  };
  const labelOf = (answers: ReadonlyArray<{ project_id: string; resting?: true }>) =>
    answers.map(answer => `${answer.project_id === p1.project_id ? "p1" : "p2"}${answer.resting ? ":resting" : ""}`).sort();

  // Host 1: read both projects for both plain and keyed queries; sleep p1, leave p2 open until clean shutdown.
  const plugin1 = aggregatePlugin();
  const opened1: string[] = [];
  const { host: host1 } = startHost(plugin1, opened1);
  const ports1 = homeAggregatePorts(host1);
  let key = "k1";
  const each = new HomeAggregateInputEach(() => ({}), () => key);
  await collectHomeAggregate<{ project: string }>(ports1, TYPE, {});
  await ports1.resting!.readings.pass;
  await collectHomeAggregate<{ project: string }>(ports1, TYPE, each);
  await ports1.resting!.readings.pass;
  assert.equal(await host1.sleepIfIdle(p1, 0), true, "p1 sleeps cleanly after quiet reads");
  assert.equal((await lstat(join(home, "cache", "resting-readings"))).mode & 0o777, 0o700);
  assert.equal((await lstat(restingCacheFile(home, p1.storage_key))).mode & 0o777, 0o600);
  await host1.close();
  assert.equal((await lstat(restingCacheFile(home, p2.storage_key))).mode & 0o777, 0o600, "clean Host shutdown also persists open project readings");

  // Host 2 (fresh restart): both p1 and p2 answer immediately as resting with ZERO project opens and ZERO plugin calls.
  const noOpens: string[] = [];
  const plugin2 = aggregatePlugin();
  const opened2: string[] = [];
  const { host: host2, withHostCatalog: withHost2Catalog } = startHost(plugin2, opened2);
  const ports2 = homeAggregatePorts(host2);
  const restartedPlain = await collectHomeAggregate<{ project: string }>(ports2, TYPE, {});
  assert.deepEqual(labelOf(restartedPlain.answers), ["p1:resting", "p2:resting"]);
  await ports2.resting!.readings.pass;
  assert.deepEqual(opened2, noOpens, "restarted Host opens zero projects when persisted resting snapshots match");
  assert.deepEqual(plugin2.calls, [], "restarted Host invokes zero plugin queries when persisted snapshots match");

  const restartedKeyed = await collectHomeAggregate<{ project: string }>(ports2, TYPE, each);
  assert.deepEqual(labelOf(restartedKeyed.answers), ["p1:resting", "p2:resting"]);
  await ports2.resting!.readings.pass;
  assert.deepEqual(opened2, noOpens, "keyed query with unchanged keyOf also opens zero projects");

  // Direct in-place SQLite commit on closed p1 invalidates p1 immediately while p2 remains resting with zero opens.
  const db = new DatabaseSync(p1.storage_key);
  try {
    db.prepare("UPDATE project_root SET created_at = ? WHERE project_id = ?")
      .run("2026-11-22T12:34:56.789Z", p1.project_id);
  } finally {
    db.close();
  }
  const afterDbChange = await collectHomeAggregate<{ project: string }>(ports2, TYPE, {});
  assert.deepEqual(labelOf(afterDbChange.answers), ["p2:resting"], "p1 is invalidated immediately after DB write while p2 stays resting");
  await ports2.resting!.readings.pass;
  assert.deepEqual(opened2, [p1.project_id], "only the modified project wakes quietly");
  assert.equal(await host2.sleepIfIdle(p1, 0), true);

  // Catalog plugin membership change on still-closed p2 invalidates p2 immediately without waiting for p2 to open.
  await withHost2Catalog({ homeDirectory: home }, catalog => catalog.addProjectPlugin({ project_id: p2.project_id, plugin_id: "feed", actor_id: "user" }));
  opened2.length = 0;
  const afterCatalogChange = await collectHomeAggregate<{ project: string }>(ports2, TYPE, {});
  assert.deepEqual(labelOf(afterCatalogChange.answers), ["p1:resting"], "catalog plugin membership change invalidates p2 immediately");
  await ports2.resting!.readings.pass;
  assert.deepEqual(opened2, [p2.project_id]);
  assert.equal(await host2.sleepIfIdle(p2, 0), true);

  // Home plugin publisher pin / revocation invalidates sleeping snapshots immediately.
  const ledger = new HomeConsentLedger(home);
  const now = new Date().toISOString();
  ledger.pinPublisher({ key_id: "resting-test-key", public_key_spki_base64: "cHVibGlj", label: "Test", pinned_at: now, pinned_by: "user" });
  opened2.length = 0;
  const afterPin = await collectHomeAggregate<{ project: string }>(ports2, TYPE, {});
  assert.deepEqual(afterPin.answers, [], "Home trust change invalidates all resting snapshots");
  await ports2.resting!.readings.pass;
  assert.deepEqual(opened2.sort(), [p1.project_id, p2.project_id].sort());
  assert.equal(await host2.sleepIfIdle(p1, 0), true);
  assert.equal(await host2.sleepIfIdle(p2, 0), true);

  ledger.revokePublisher("resting-test-key", new Date().toISOString());
  opened2.length = 0;
  const afterRevoke = await collectHomeAggregate<{ project: string }>(ports2, TYPE, {});
  assert.deepEqual(afterRevoke.answers, [], "publisher revocation invalidates sleeping snapshots immediately");
  await ports2.resting!.readings.pass;
  assert.deepEqual(opened2.sort(), [p1.project_id, p2.project_id].sort());
  assert.equal(await host2.sleepIfIdle(p1, 0), true);
  assert.equal(await host2.sleepIfIdle(p2, 0), true);

  // Non-always-on / project-scoped consent grant and revocation in Home's plugin_consents invalidate sleeping snapshots immediately.
  const [projectConsent] = ledger.record({
    plugin_id: "third-party.project.widget",
    publisher_signature: "third-party-sig",
    manifest_digest: "d".repeat(64),
    granted_by: "user",
    grants: [{ kind: "local_directory", subject: "/tmp/project-widget" }],
    at: new Date().toISOString(),
  });
  assert.ok(projectConsent);
  opened2.length = 0;
  const afterProjectConsentGrant = await collectHomeAggregate<{ project: string }>(ports2, TYPE, {});
  assert.deepEqual(afterProjectConsentGrant.answers, [], "project-scoped plugin consent grant invalidates sleeping snapshots immediately");
  await ports2.resting!.readings.pass;
  assert.deepEqual(opened2.sort(), [p1.project_id, p2.project_id].sort());
  assert.equal(await host2.sleepIfIdle(p1, 0), true);
  assert.equal(await host2.sleepIfIdle(p2, 0), true);

  ledger.revoke(projectConsent.consent_id, new Date().toISOString());
  opened2.length = 0;
  const afterProjectConsentRevoke = await collectHomeAggregate<{ project: string }>(ports2, TYPE, {});
  assert.deepEqual(afterProjectConsentRevoke.answers, [], "project-scoped plugin consent revocation invalidates sleeping snapshots immediately");
  await ports2.resting!.readings.pass;
  assert.deepEqual(opened2.sort(), [p1.project_id, p2.project_id].sort());

  // Concurrent sleep-to-persist race: pausing persistence after ProjectLine marks p1 asleep must not wipe or immediately re-wake p1.
  let enteredPersist!: () => void;
  let releasePersist!: () => void;
  const persistEntered = new Promise<void>(resolve => { enteredPersist = resolve; });
  const persistGate = new Promise<void>(resolve => { releasePersist = resolve; });
  const realFingerprints = host2.restingFingerprints.bind(host2);
  let interceptFirst = true;
  host2.restingFingerprints = async references => {
    if (interceptFirst && references.length === 1 && references[0]?.storage_key === p1.storage_key) {
      interceptFirst = false;
      enteredPersist();
      await persistGate;
    }
    return realFingerprints(references);
  };
  opened2.splice(0);
  const sleepRace = host2.sleepIfIdle(p1, 0);
  await persistEntered;
  assert.equal(host2.projectRest(p1.storage_key).state, "asleep", "p1 is already asleep while persistence is in flight");
  const concurrentDuringSleep = collectHomeAggregate<{ project: string }>(ports2, TYPE, {});
  releasePersist();
  host2.restingFingerprints = realFingerprints;
  assert.equal(await sleepRace, true);
  const raceResult = await concurrentDuringSleep;
  assert.ok(raceResult.answers.some(answer => answer.project_id === p1.project_id && answer.resting === true),
    "concurrent aggregate poll waits for sleep persistence and receives resting answer for p1");
  await ports2.resting!.readings.pass;
  assert.ok(!opened2.includes(p1.project_id), "p1 is not immediately re-woken during sleep-to-persist window");

  // Re-record keyed query on both before closing host2 cleanly so host3 can test keyOf invalidation after restart.
  await collectHomeAggregate<{ project: string }>(ports2, TYPE, each);
  await ports2.resting!.readings.pass;
  await host2.close();

  // Host 3: verify keyOf invalidation after restart and purposeful close clearing on-disk cache.
  const plugin3 = aggregatePlugin();
  const opened3: string[] = [];
  const { host: host3 } = startHost(plugin3, opened3);
  const ports3 = homeAggregatePorts(host3);
  assert.deepEqual(labelOf((await collectHomeAggregate<{ project: string }>(ports3, TYPE, each)).answers), ["p1:resting", "p2:resting"]);
  await ports3.resting!.readings.pass;
  assert.deepEqual(opened3, noOpens, "matching keyOf serves from disk with zero opens");

  key = "k2";
  assert.deepEqual((await collectHomeAggregate<{ project: string }>(ports3, TYPE, each)).answers, [], "changed keyOf invalidates persisted snapshot");
  await ports3.resting!.readings.pass;
  assert.deepEqual(opened3.sort(), [p1.project_id, p2.project_id].sort());
  assert.equal(await host3.sleepIfIdle(p1, 0), true);
  assert.equal(existsSync(restingCacheFile(home, p1.storage_key)), true);

  // Purposeful close deletes persisted cache file and excludes the project from both answers and background wakes.
  await host3.closeProject(p1);
  assert.equal(existsSync(restingCacheFile(home, p1.storage_key)), false, "purposeful close removes persisted cache file");
  opened3.splice(0);
  const afterPurposefulClose = await collectHomeAggregate<{ project: string }>(ports3, TYPE, {});
  assert.ok(!afterPurposefulClose.answers.some(answer => answer.project_id === p1.project_id));
  await ports3.resting!.readings.pass;
  assert.ok(!opened3.includes(p1.project_id), "purposefully closed project is never reopened to be read");
});

test("S-49 S-12 persisted resting cache rejects symlinks and tampered files and never writes provider error messages or transient failures", { timeout: 60_000 }, async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "home-aggregate-s12-")));
  const outside = await realpath(await mkdtemp(join(tmpdir(), "home-aggregate-outside-")));
  const hosts: MolisWorkLocalHost[] = [];
  t.after(async () => {
    for (const host of hosts.reverse()) {
      try { await host.close(); } catch { /* already closed */ }
    }
    await rm(home, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  const create = async (name: string) => {
    const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: name, actor_id: "user" }));
    return molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  };
  const okProj = await create("CleanProject");
  const errProj = await create("FailingProject");
  const SECRET_REASON = "PRIVATE_PROVIDER_ERROR_BODY_NEVER_PERSIST";
  const makeFailingPlugin = (): PluginDefinition => ({
    manifest: {
      schema_version: 1, host_api_version: 1, plugin_id: PLUGIN_ID, version: "1.0.0", name: "homeagg", kind: "app",
      publisher: { publisher_id: "example", signature: "home-aggregate" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
      permissions: [{ permission: READ, required: true, reason: "读自己的进行中工作" }],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
      actions: [tasks],
    },
    async start() {
      return {
        kind: "app",
        views: [],
        actions: [{
          ...tasks,
          async handle(caller: ActionExecutionContext) {
            if (caller.project_id === errProj.project_id) {
              throw new ActionError("actions.execution_failed", SECRET_REASON);
            }
            return { project: caller.project_id! };
          },
        }],
      };
    },
  });

  const host1 = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [makeFailingPlugin()] } });
  host1.configurePersonalPlanning(home, withCatalog);
  hosts.push(host1);
  const ports1 = homeAggregatePorts(host1);
  await collectHomeAggregate<{ project: string }>(ports1, TYPE, {});
  await ports1.resting!.readings.pass;
  await host1.close();

  const cacheDir = join(home, "cache", "resting-readings");
  const files = await readdir(cacheDir);
  assert.ok(files.length >= 1);
  for (const name of files) {
    const text = await readFile(join(cacheDir, name), "utf8");
    assert.ok(!text.includes(SECRET_REASON), "provider error message never enters persisted cache (S-12)");
    assert.ok(!text.includes("actions.execution_failed"), "transient failure code is not persisted to disk");
  }
  assert.equal(existsSync(restingCacheFile(home, errProj.storage_key)), false, "project with transient error has no persisted cache file");
  const okFile = restingCacheFile(home, okProj.storage_key);
  assert.equal(existsSync(okFile), true);
  const validRaw = await readFile(okFile, "utf8");

  // Tampered cache files (prototype pollution, cross-home, non-policy issue) fail closed and trigger a quiet re-read.
  const validJson = JSON.parse(validRaw) as { home_directory: string; project_id: string; storage_key: string; updated_at: string; entries: Record<string, { fingerprint: string; keys: Record<string, string>; result: { answers: unknown[]; issues: unknown[] } }> };
  const tamperedVariants: string[] = [
    `{"__proto__":{"polluted":true}}`,
    JSON.stringify({ ...validJson, home_directory: outside }),
    JSON.stringify({
      ...validJson,
      entries: Object.fromEntries(Object.entries(validJson.entries).map(([k, entry]) => [
        k,
        { ...entry, result: { answers: [], issues: [{ project_id: okProj.project_id, source: null, code: "actions.execution_failed", message: SECRET_REASON }] } },
      ])),
    }),
  ];
  for (const payload of tamperedVariants) {
    await writeFile(okFile, payload, { mode: 0o600 });
    const opened: string[] = [];
    const probeHost = new MolisWorkLocalHost({
      homeDirectory: home, completeText: null,
      pluginFixtures: { project: [makeFailingPlugin()] },
      onRuntimeOpen: ref => { opened.push(ref.project_id); },
    });
    probeHost.configurePersonalPlanning(home, withCatalog);
    hosts.push(probeHost);
    const ports = homeAggregatePorts(probeHost);
    const result = await collectHomeAggregate<{ project: string }>(ports, TYPE, {});
    assert.ok(!result.answers.some(answer => answer.project_id === okProj.project_id), "tampered cache is never served");
    assert.ok(!JSON.stringify(result).includes(SECRET_REASON));
    await ports.resting!.readings.pass;
    assert.ok(opened.includes(okProj.project_id), "tampered cache falls back to quiet background read");
    await probeHost.close();
  }

  // Symlink confinement: a symlink at the cache file path is neither read nor written through.
  const outsideTarget = join(outside, "escaped.json");
  await writeFile(outsideTarget, validRaw, { mode: 0o600 });
  await rm(okFile, { force: true });
  await symlink(outsideTarget, okFile);
  const openedSym: string[] = [];
  const symHost = new MolisWorkLocalHost({
    homeDirectory: home, completeText: null,
    pluginFixtures: { project: [makeFailingPlugin()] },
    onRuntimeOpen: ref => { openedSym.push(ref.project_id); },
  });
  symHost.configurePersonalPlanning(home, withCatalog);
  hosts.push(symHost);
  const symPorts = homeAggregatePorts(symHost);
  const symResult = await collectHomeAggregate<{ project: string }>(symPorts, TYPE, {});
  assert.ok(!symResult.answers.some(answer => answer.project_id === okProj.project_id), "symlinked cache file is rejected");
  await symPorts.resting!.readings.pass;
  assert.ok(openedSym.includes(okProj.project_id), "falls back to quiet read instead of following symlink");
  await writeFile(outsideTarget, "UNCHANGED_OUTSIDE_SENTINEL", { mode: 0o600 });
  await symHost.close();
  assert.equal(await readFile(outsideTarget, "utf8"), "UNCHANGED_OUTSIDE_SENTINEL", "Host never writes through a symlink");
});

test("S-49 unopenable closed projects do not thrash background wakes until their database changes, and shutdown with active plugin work skips resting persistence", { timeout: 60_000 }, async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "home-aggregate-broken-")));
  const outside = await realpath(await mkdtemp(join(tmpdir(), "home-aggregate-broken-out-")));
  const hosts: MolisWorkLocalHost[] = [];
  t.after(async () => {
    for (const host of hosts.reverse()) {
      try { await host.close(); } catch { /* already closed */ }
    }
    await rm(home, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  const create = async (name: string) => {
    const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: name, actor_id: "user" }));
    return molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  };
  const corrupt = await create("CorruptProject");
  const symlinked = await create("SymlinkedProject");
  const active = await create("ActiveWorkProject");

  // Snapshot valid SQLite bytes before constructing Host (ensureHomeUpgraded validates project DB files at startup).
  const validCorrupt = await readFile(corrupt.storage_key);
  const validSymlinked = await readFile(symlinked.storage_key);

  const probe = jobProbe("shutdownwork", "project");
  probe.behavior.work = async (_context, control) => {
    await new Promise<void>(resolve => {
      if (control.signal.aborted) resolve();
      else control.signal.addEventListener("abort", () => resolve(), { once: true });
    });
  };
  const plugin1 = aggregatePlugin();
  const opened1: string[] = [];
  const host1 = new MolisWorkLocalHost({
    homeDirectory: home,
    completeText: null,
    pluginFixtures: { project: [plugin1.definition], home: [probe.definition] },
    onRuntimeOpen: ref => { opened1.push(ref.project_id); },
  });
  host1.configurePersonalPlanning(home, withCatalog);
  hosts.push(host1);
  // Open only `active` first so Home startup upgrades complete cleanly while `corrupt` and `symlinked` remain unopened ("never").
  await host1.withProject(active, () => undefined);
  // Break corrupt (bad regular file) and symlinked (symlink to non-DB file -> null fingerprint) while both are unopened.
  const bogusTarget = join(outside, "not-a-db.txt");
  await writeFile(bogusTarget, "not a sqlite db");
  await writeFile(corrupt.storage_key, "not a sqlite db");
  await rm(symlinked.storage_key, { force: true });
  await symlink(bogusTarget, symlinked.storage_key);
  const ports1 = homeAggregatePorts(host1);
  const wakeCounts = new Map<string, number>();
  const realWake = ports1.resting!.wake;
  ports1.resting!.wake = (ref, work) => {
    wakeCounts.set(ref.project_id, (wakeCounts.get(ref.project_id) ?? 0) + 1);
    return realWake(ref, work);
  };

  // Poll 1: each broken project is tried once; active project opens cleanly.
  await collectHomeAggregate<{ project: string }>(ports1, TYPE, {});
  await ports1.resting!.readings.pass;
  assert.equal(wakeCounts.get(corrupt.project_id), 1, "corrupt project tried once on first poll");
  assert.equal(wakeCounts.get(symlinked.project_id), 1, "symlinked project tried once on first poll");
  assert.equal(existsSync(restingCacheFile(home, corrupt.storage_key)), false);
  assert.equal(existsSync(restingCacheFile(home, symlinked.storage_key)), false);

  // Repeat polls 2 & 3: neither broken project is re-woken while unchanged, and both still report issues.
  const noOpens: string[] = [];
  opened1.splice(0);
  for (let poll = 0; poll < 2; poll += 1) {
    const repeated = await collectHomeAggregate<{ project: string }>(ports1, TYPE, {});
    await ports1.resting!.readings.pass;
    assert.ok(repeated.issues.some(issue => issue.project_id === corrupt.project_id));
    assert.ok(repeated.issues.some(issue => issue.project_id === symlinked.project_id));
  }
  assert.equal(wakeCounts.get(corrupt.project_id), 1, "corrupt project does not thrash on repeat polls");
  assert.equal(wakeCounts.get(symlinked.project_id), 1, "symlinked project does not thrash on repeat polls");
  assert.deepEqual(opened1, noOpens, "broken projects do not reopen on repeat polls");

  // Repair both DBs on disk: next poll detects the change, opens each once (even if cold open hits the 1x timeout retry), and reads cleanly.
  await writeFile(corrupt.storage_key, validCorrupt);
  await rm(symlinked.storage_key, { force: true });
  await writeFile(symlinked.storage_key, validSymlinked);
  await collectHomeAggregate<{ project: string }>(ports1, TYPE, {});
  await ports1.resting!.readings.pass;
  assert.deepEqual(opened1.sort(), [corrupt.project_id, symlinked.project_id].sort(), "each repaired project opens once to recover");
  const recovered = await collectHomeAggregate<{ project: string }>(ports1, TYPE, {});
  assert.ok(recovered.answers.some(answer => answer.project_id === corrupt.project_id));
  assert.ok(recovered.answers.some(answer => answer.project_id === symlinked.project_id));

  // Persist a resting snapshot for `active` while idle, then start active Home plugin work in `active` before Host shutdown.
  assert.equal(await host1.sleepIfIdle(active, 0), true);
  assert.equal(existsSync(restingCacheFile(home, active.storage_key)), true);
  const caller = await host1.localPersonContext(active);
  assert.equal(await host1.actionClient(active).invoke(caller, probe.keep, { id: "active-shutdown" }), "kept");
  assert.equal(host1.homePlugins?.hasProjectWork(active.project_id), true);
  assert.equal(await host1.sleepIfIdle(active, 0), false, "active plugin job prevents sleep");
  // Record an in-memory reading matching current usedAt right before shutting down while the job is still running.
  await collectHomeAggregate<{ project: string }>(ports1, TYPE, {});
  await host1.close();

  // Shutdown with active plugin work must delete the older snapshot instead of stamping the pre-shutdown reading.
  assert.equal(existsSync(restingCacheFile(home, active.storage_key)), false,
    "shutdown with active plugin work does not persist a stale resting snapshot");
  assert.equal(existsSync(restingCacheFile(home, corrupt.storage_key)), true,
    "idle open projects without active work still persist on clean shutdown");

  // Fresh Host opens `active` quietly instead of serving a stale snapshot, while idle projects serve with zero opens.
  const opened2: string[] = [];
  const host2 = new MolisWorkLocalHost({
    homeDirectory: home,
    completeText: null,
    pluginFixtures: { project: [aggregatePlugin().definition], home: [jobProbe("shutdownwork", "project").definition] },
    onRuntimeOpen: ref => { opened2.push(ref.project_id); },
  });
  host2.configurePersonalPlanning(home, withCatalog);
  hosts.push(host2);
  const ports2 = homeAggregatePorts(host2);
  const afterRestart = await collectHomeAggregate<{ project: string }>(ports2, TYPE, {});
  assert.ok(!afterRestart.answers.some(answer => answer.project_id === active.project_id),
    "project shut down with active work is not served as resting after restart");
  assert.ok(afterRestart.answers.some(answer => answer.project_id === corrupt.project_id && answer.resting === true));
  await ports2.resting!.readings.pass;
  assert.deepEqual(opened2, [active.project_id], "only the project shut down with active work wakes quietly");
});

test("S-49 resting snapshots invalidate on Home aggregate DB writes, restart-bound waiting tasks, expired reported failures, and locale switch", { timeout: 60_000 }, async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "home-aggregate-semantics-")));
  const hosts: MolisWorkLocalHost[] = [];
  t.after(async () => {
    for (const host of hosts.reverse()) {
      try { await host.close(); } catch { /* already closed */ }
    }
    await rm(home, { recursive: true, force: true });
  });
  const projectRow = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "SemanticsProj", actor_id: "user" }));
  const proj = molisWorkHostProjectReference({ projectId: projectRow.project_id, databasePath: projectRow.database_path });
  const BG_PLUGIN_ID = "com.example.bgsemantics";
  const bgAction: ActionDefinition<Record<string, never>, BackgroundTaskCollection> = {
    capability_id: "bgsemantics.tasks", version: 1, operation: "query",
    action: {
      title: "后台任务探针", description: "测试休眠聚合语义", kind: "query", scope: "project", scheduling: "concurrent",
      audiences: ["user"], subject_kinds: ["probe_task"], permissions: [READ], home_aggregate: true, output_type: BACKGROUND_TASKS_OUTPUT_TYPE,
      input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "object" },
    },
  };
  let mode: "approval" | "verify" | "expired-failed" | "clean" = "approval";
  const makeBgPlugin = (): PluginDefinition => ({
    manifest: {
      schema_version: 1, host_api_version: 1, plugin_id: BG_PLUGIN_ID, version: "1.0.0", name: "bgsemantics", kind: "app",
      publisher: { publisher_id: "example", signature: "bgsemantics" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
      permissions: [{ permission: READ, required: true, reason: "读后台任务" }],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
      actions: [bgAction],
    },
    async start() {
      return {
        kind: "app", views: [],
        actions: [{
          ...bgAction,
          handle(): BackgroundTaskCollection {
            const locale = activeLocale() ?? "zh";
            const nowIso = new Date().toISOString();
            const expiredIso = new Date(Date.now() - 15 * 60_000).toISOString();
            if (mode === "clean") return { source: { surface: "bgsemantics", title: "Probe", icon: "code" }, tasks: [] };
            if (mode === "expired-failed") {
              return {
                source: { surface: "bgsemantics", title: "Probe", icon: "code" },
                tasks: [{
                  subject: { kind: "probe_task", id: "failed-img" }, title: locale === "en" ? "Failed image" : "生图失败",
                  state: "failed", waiting: false, updated_at: expiredIso, step: { text: locale === "en" ? "Failed" : "失败" },
                  details: [], executor: { kind: "plugin", label: "Probe" }, serves: [], scope: "project", commands: [], decisions: [],
                  open: { kind: "surface", surface: "bgsemantics", id: null, title: "Probe", label: "Open" }, reports_to: "assistant",
                }],
              };
            }
            const state = mode === "approval" ? "approval" : "verify";
            return {
              source: { surface: "bgsemantics", title: "Probe", icon: "code" },
              tasks: [{
                subject: { kind: "probe_task", id: "sess-1" }, title: locale === "en" ? "Review session" : "待审会话",
                state, waiting: state === "approval", updated_at: nowIso,
                step: { text: locale === "en" ? `step:${state}:en` : `step:${state}:zh` },
                details: [], executor: { kind: "plugin", label: "Probe" }, serves: [], scope: "project", commands: [], decisions: [],
                open: { kind: "surface", surface: "bgsemantics", id: null, title: "Probe", label: "Open" },
              }],
            };
          },
        }],
      };
    },
  });
  const startHost = (opened: string[]) => {
    const host = new MolisWorkLocalHost({
      homeDirectory: home, completeText: null, pluginFixtures: { project: [makeBgPlugin()] },
      onRuntimeOpen: ref => { opened.push(ref.project_id); },
    });
    host.configurePersonalPlanning(home, withCatalog);
    hosts.push(host);
    return host;
  };
  const projects = [{ project_id: proj.project_id, display_name: "SemanticsProj" }];

  // 1. Same-process sleep keeps waiting-approval resting summary, and switches cleanly across zh/en locales.
  const opened1: string[] = [];
  const host1 = startHost(opened1);
  const ports1 = homeAggregatePorts(host1);
  await runWithLocale("zh", async () => {
    await homeBackgroundTasks(ports1, projects);
    await ports1.resting!.readings.pass;
  });
  assert.equal(await host1.sleepIfIdle(proj, 0), true);
  opened1.length = 0;
  const zhResting = await runWithLocale("zh", () => homeBackgroundTasks(ports1, projects));
  assert.equal(zhResting.tasks[0]?.state, "approval");
  assert.equal(zhResting.tasks[0]?.step?.text, "step:approval:zh");
  assert.equal(zhResting.tasks[0]?.resting, true);
  assert.deepEqual(opened1, [], "same-process zh resting hit opens zero projects");

  // Switching to English must not serve the zh resting reading.
  const enMiss = await runWithLocale("en", () => homeBackgroundTasks(ports1, projects));
  assert.equal(enMiss.tasks.length, 0, "en read does not reuse zh cached strings");
  await ports1.resting!.readings.pass;
  assert.deepEqual(opened1, [proj.project_id], "en miss wakes quietly in en");
  assert.equal(await host1.sleepIfIdle(proj, 0), true);
  opened1.length = 0;
  const enResting = await runWithLocale("en", () => homeBackgroundTasks(ports1, projects));
  assert.equal(enResting.tasks[0]?.step?.text, "step:approval:en");
  assert.equal(enResting.tasks[0]?.resting, true);
  assert.deepEqual(opened1, []);

  // 2. Writing to a Home-level aggregate DB (images/images.db) invalidates the sleeping project immediately.
  await mkdir(join(home, "images"), { recursive: true });
  const imgDb = new DatabaseSync(join(home, "images", "images.db"));
  try {
    imgDb.exec("CREATE TABLE probe (id INTEGER PRIMARY KEY); INSERT INTO probe VALUES (1);");
  } finally {
    imgDb.close();
  }
  const afterImagesWrite = await runWithLocale("zh", () => homeBackgroundTasks(ports1, projects));
  assert.equal(afterImagesWrite.tasks.length, 0, "creating/writing images.db invalidates sleeping project immediately");
  await ports1.resting!.readings.pass;
  assert.deepEqual(opened1, [proj.project_id]);
  assert.equal(await host1.sleepIfIdle(proj, 0), true);
  await host1.close();

  // 3. Restarting Host must NOT replay a pre-restart waiting-approval task from disk; it must wake once and reconcile to verify.
  mode = "verify";
  const opened2: string[] = [];
  const host2 = startHost(opened2);
  const ports2 = homeAggregatePorts(host2);
  const afterRestart = await runWithLocale("zh", () => homeBackgroundTasks(ports2, projects));
  assert.equal(afterRestart.tasks.length, 0, "pre-restart approval task is not replayed blindly after restart");
  await ports2.resting!.readings.pass;
  assert.deepEqual(opened2, [proj.project_id], "project wakes quietly once to reconcile pre-restart approval state");
  assert.equal(await host2.sleepIfIdle(proj, 0), true);
  const reconciled = await runWithLocale("zh", () => homeBackgroundTasks(ports2, projects));
  assert.equal(reconciled.tasks[0]?.state, "verify");
  assert.equal(reconciled.tasks[0]?.resting, true);
  await host2.close();

  // 4. Restarting again with `verify` (non-process-bound) serves directly from disk with zero opens.
  const opened3: string[] = [];
  const host3 = startHost(opened3);
  const ports3 = homeAggregatePorts(host3);
  const verifyPersisted = await runWithLocale("zh", () => homeBackgroundTasks(ports3, projects));
  assert.equal(verifyPersisted.tasks[0]?.state, "verify");
  assert.equal(verifyPersisted.tasks[0]?.resting, true);
  await ports3.resting!.readings.pass;
  assert.deepEqual(opened3, [], "post-restart verify state persists across restarts with zero opens");

  // 5. Time-expired `reports_to` failed task (>10 min old) fails `stillValid` and re-reads cleanly instead of freezing forever.
  mode = "expired-failed";
  await host3.withProject(proj, () => undefined);
  await runWithLocale("zh", () => homeBackgroundTasks(ports3, projects));
  assert.equal(await host3.sleepIfIdle(proj, 0), true);
  mode = "clean";
  opened3.length = 0;
  const expiredRead = await runWithLocale("zh", () => homeBackgroundTasks(ports3, projects));
  assert.equal(expiredRead.tasks.length, 0, "expired reported failure (>10m) is rejected by stillValid");
  await ports3.resting!.readings.pass;
  assert.deepEqual(opened3, [proj.project_id], "expired reported failure triggers quiet refresh");
  await host3.close();

  // 6. Assistant DB per-project isolation (no wake storm on notices/rounds/main works) and third-party Home library invalidation.
  const projOtherCreated = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "SleepingSibling", actor_id: "user" }));
  const projOther = molisWorkHostProjectReference({ projectId: projOtherCreated.project_id, databasePath: projOtherCreated.database_path });
  const bothProjects = [...projects, { project_id: projOther.project_id, display_name: "SleepingSibling" }];
  await mkdir(join(home, "assistant"), { recursive: true });
  const assistantDb = new DatabaseSync(join(home, "assistant", "assistant.db"));
  try {
    assistantDb.exec(`
      CREATE TABLE assistant_works (work_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL);
      CREATE TABLE assistant_observed (actor_id TEXT NOT NULL, work_id TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(actor_id, work_id));
      CREATE TABLE assistant_notices (notice_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, dedupe TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE assistant_rounds (work_id TEXT NOT NULL, run_id TEXT NOT NULL, position INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(work_id, run_id));
    `);
  } finally {
    assistantDb.close();
  }
  mode = "verify";
  const opened4: string[] = [];
  const host4 = startHost(opened4);
  const ports4 = homeAggregatePorts(host4);
  await host4.withProject(proj, () => undefined);
  await host4.withProject(projOther, () => undefined);
  await runWithLocale("zh", async () => {
    await homeBackgroundTasks(ports4, bothProjects);
    await ports4.resting!.readings.pass;
  });
  assert.equal(await host4.sleepIfIdle(proj, 0), true);
  assert.equal(await host4.sleepIfIdle(projOther, 0), true);
  opened4.length = 0;
  // Unrelated writes (notice, round, personal work, project main conversation) must NOT invalidate either sleeping project.
  const assistantUnrelated = new DatabaseSync(join(home, "assistant", "assistant.db"));
  try {
    assistantUnrelated.prepare("INSERT INTO assistant_notices VALUES ('n1','user','w-main','done','new','d1','2026-11-24T00:00:00Z','{}')").run();
    assistantUnrelated.prepare("INSERT INTO assistant_rounds VALUES ('w-main','r1',1,'{\"text\":\"long chat\"}')").run();
    assistantUnrelated.prepare("INSERT INTO assistant_works VALUES ('w-personal','user',1,'2026-11-24T00:00:00Z',0,?)")
      .run(JSON.stringify({ work_id: "w-personal", scope: { kind: "personal" } }));
    assistantUnrelated.prepare("INSERT INTO assistant_works VALUES ('w-main','user',1,'2026-11-24T00:00:00Z',0,?)")
      .run(JSON.stringify({ work_id: "w-main", main: true, project_ref: { project_id: proj.project_id } }));
  } finally {
    assistantUnrelated.close();
  }
  const afterUnrelatedAssistant = await runWithLocale("zh", () => homeBackgroundTasks(ports4, bothProjects));
  assert.equal(afterUnrelatedAssistant.tasks.filter(task => task.resting === true).length, 2, "unrelated assistant writes keep both sleeping projects cached");
  await ports4.resting!.readings.pass;
  assert.deepEqual(opened4, [], "unrelated assistant writes trigger zero wakes");
  // Writing a non-main project work for `proj` invalidates ONLY `proj`, leaving `projOther` asleep.
  const assistantProjectWork = new DatabaseSync(join(home, "assistant", "assistant.db"));
  try {
    assistantProjectWork.prepare("INSERT INTO assistant_works VALUES ('w-task-1','user',1,'2026-11-24T00:01:00Z',0,?)")
      .run(JSON.stringify({ work_id: "w-task-1", project_ref: { project_id: proj.project_id } }));
  } finally {
    assistantProjectWork.close();
  }
  const afterTargetedWork = await runWithLocale("zh", () => homeBackgroundTasks(ports4, bothProjects));
  assert.deepEqual(afterTargetedWork.tasks.map(task => task.project_id), [projOther.project_id], "only the affected project invalidates while sibling stays resting");
  await ports4.resting!.readings.pass;
  assert.deepEqual(opened4, [proj.project_id], "only the affected project wakes quietly");
  assert.equal(await host4.sleepIfIdle(proj, 0), true);
  // Third-party Home library registered in plugin-libraries/plugin-libraries.db invalidates sleeping projects on write.
  await mkdir(join(home, "plugin-libraries"), { recursive: true });
  await mkdir(join(home, "third-party-agg"), { recursive: true });
  const libLedger = new DatabaseSync(join(home, "plugin-libraries", "plugin-libraries.db"));
  try {
    libLedger.exec(`
      CREATE TABLE plugin_home_libraries (
        plugin_id TEXT PRIMARY KEY, publisher_signature TEXT NOT NULL, store_name TEXT NOT NULL UNIQUE,
        version INTEGER NOT NULL, schema_digest TEXT NOT NULL, created_at TEXT NOT NULL
      );
      INSERT INTO plugin_home_libraries VALUES ('example.third-party.agg', 'sig-1', 'third-party-agg', 1, '${"a".repeat(64)}', '2026-11-24T00:00:00Z');
    `);
  } finally {
    libLedger.close();
  }
  const thirdPartyDb = new DatabaseSync(join(home, "third-party-agg", "third-party-agg.db"));
  try {
    thirdPartyDb.exec("CREATE TABLE jobs (id INTEGER PRIMARY KEY); INSERT INTO jobs VALUES (1);");
  } finally {
    thirdPartyDb.close();
  }
  opened4.length = 0;
  const afterThirdPartyWrite = await runWithLocale("zh", () => homeBackgroundTasks(ports4, bothProjects));
  assert.equal(afterThirdPartyWrite.tasks.length, 0, "installed third-party Home library mutation invalidates sleeping projects");
  await ports4.resting!.readings.pass;
  assert.deepEqual(opened4.sort(), [proj.project_id, projOther.project_id].sort());
  await host4.close();
});
