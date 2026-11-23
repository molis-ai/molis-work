import { fakeActionClient } from "@molis-ai/molis-work-test-kit";
import assert from "node:assert/strict";
import test from "node:test";
import { collectHomeAggregate, homeAggregatePorts, homeBackgroundTasks, HomeAggregateInputEach, MolisWorkLocalHost, molisWorkHostProjectReference, runtimeOverview } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import type { HomeAggregatePorts, RuntimeOverviewPorts } from "@molis-ai/molis-work-app-local-host";
import { ActionError, BACKGROUND_TASKS_OUTPUT_TYPE, RUNS_OVERVIEW_INPUT_TYPE, RUNS_OVERVIEW_OUTPUT_TYPE, type ActionCallContext, type ActionView, type BackgroundTaskCollection, type RunsOverview } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";

// T-319 (R-63, RAC-2437): a source that is not in the project's plugin manifest is not installed here and stays out of the Home;
// one that IS listed but unavailable (turned off, or refused by policy) is shown as an issue rather than silently skipped.
const TYPE = "com.example.homeagg.v1";
const PLUGIN = "io.example.homeagg.plugin";
const reference = (projectId: string): LocalHostProjectReference => ({ project_id: projectId, storage_key: `/tmp/${projectId}` });
const context = (projectId: string): ActionCallContext => ({ actor_id: "owner", project_id: projectId, audience: "user", permissions: ["home:read", "homeagg:read"] });
const unavailableView = (projectId: string): ActionView => ({
  capability_id: "homeagg.running.read", version: 1, operation: "query",
  provider: { provider_id: "example.plugin", title: "Example", kind: "plugin", plugin_id: PLUGIN, project_id: projectId },
  availability: { available: false, code: "actions.plugin_disabled", reason: "策略拒绝了这个项目的读取" },
  action: { title: "运行中的工作", description: "首页聚合的只读查询", kind: "query", scope: "project", audiences: ["user"], permissions: ["homeagg:read"], subject_kinds: [],
    input_schema: { type: "object" }, output_schema: { type: "object" }, output_type: TYPE, home_aggregate: true },
});

test("RAC-2437 the Home reports a source listed in the project's plugin manifest as an issue, and skips one the manifest does not list", async () => {
  const a = reference("project-a"), b = reference("project-b");
  const ports: HomeAggregatePorts = {
    openProjects: () => [a, b],
    whileOpen: async (_reference, work) => work(),
    client: projectReference => (fakeActionClient({ discover: async () => [unavailableView(projectReference.project_id)],
      invoke: async () => assert.fail("an unavailable source is never invoked") })),
    context: async projectReference => context(projectReference.project_id),
    // The manifest fact: A does not list the plugin, B does. Same provider, same refusal in both projects.
    projectPlugins: async projectReference => (pluginId: string) => projectReference.project_id === b.project_id && pluginId === PLUGIN,
  };
  const result = await collectHomeAggregate(ports, TYPE, {});
  assert.deepEqual(result.answers, []);
  assert.deepEqual(result.issues.map(issue => ({ project_id: issue.project_id, code: issue.code })), [{ project_id: b.project_id, code: "actions.plugin_disabled" }],
    "only the project that lists the plugin shows that its source is unavailable");
});

test("RAC-2437 a Host with no catalog refuses the manifest lookup, and the Home records that refusal as the project's issue", async () => {
  const bare = new MolisWorkLocalHost();
  try {
    await assert.rejects(bare.projectPluginReach("project-a"), { code: "host.catalog_unavailable" });
  } finally { await bare.close(); }
  const a = reference("project-a");
  const answering = { ...unavailableView(a.project_id), availability: { available: true } };
  const ports: HomeAggregatePorts = {
    openProjects: () => [a],
    whileOpen: async (_reference, work) => work(),
    client: () => ({ discover: async () => [answering], invoke: async () => ({ project: a.project_id }) }),
    context: async projectReference => context(projectReference.project_id),
    projectPlugins: async () => { throw new ActionError("host.catalog_unavailable", "项目目录尚未就绪，请稍后重试"); },
  };
  const result = await collectHomeAggregate(ports, TYPE, {});
  assert.deepEqual(result.answers.map(answer => ({ project: answer.project_id, output: answer.output })), [{ project: a.project_id, output: { project: a.project_id } }],
    "the failed lookup is reported, but it does not cost the answers other sources can still give");
  assert.deepEqual(result.issues.map(issue => ({ project_id: issue.project_id, source: issue.source, code: issue.code })),
    [{ project_id: a.project_id, source: null, code: "host.catalog_unavailable" }],
    "the refused lookup is what the person sees, not a silently empty Home");
});

test("RAC-2779 keeps both code-only issues in phase order while another project answers", async () => {
  const a = reference("project-a"), b = reference("project-b");
  const privateCatalog = "PRIVATE_CATALOG_BODY", privateDiscovery = "PRIVATE_DISCOVERY_BODY";
  let aInvoked = false;
  const answering = { ...unavailableView(b.project_id), availability: { available: true } };
  const ports: HomeAggregatePorts = {
    openProjects: () => [a, b],
    projectPlugins: async project => {
      if (project.project_id === a.project_id) throw new ActionError("host.catalog_unavailable", privateCatalog);
      return () => true;
    },
    whileOpen: async (_project, work) => work(),
    context: async project => context(project.project_id),
    client: project => ({
      discover: async () => {
        if (project.project_id === a.project_id) throw new ActionError("actions.timeout", privateDiscovery);
        return [answering];
      },
      invoke: async () => {
        if (project.project_id === a.project_id) { aInvoked = true; return assert.fail("A must not invoke"); }
        return { project: "project-b" };
      },
    }),
  };
  const result = await collectHomeAggregate(ports, TYPE, {});
  assert.deepEqual(result.issues, [
    { project_id: "project-a", source: null, code: "host.catalog_unavailable" },
    { project_id: "project-a", source: null, code: "actions.timeout" },
  ]);
  assert.equal(aInvoked, false);
  assert.deepEqual(result.answers, [{ project_id: "project-b", source: {
    capability_id: "homeagg.running.read", version: 1, provider_id: "example.plugin",
  }, plugin_id: PLUGIN, subject_kinds: [], output: { project: "project-b" } }]);
  assert.ok(!JSON.stringify(result).includes(privateCatalog));
  assert.ok(!JSON.stringify(result).includes(privateDiscovery));
});

test("RAC-2780 a closing project stays silent after its catalog fails, while another project answers", async () => {
  const a = reference("project-a"), b = reference("project-b");
  const answering = { ...unavailableView(b.project_id), availability: { available: true } };
  const ports: HomeAggregatePorts = {
    openProjects: () => [a, b],
    projectPlugins: async project => {
      if (project.project_id === a.project_id) throw new ActionError("host.catalog_unavailable", "private catalog error");
      return () => true;
    },
    whileOpen: async (_project, work) => work(),
    context: async project => context(project.project_id),
    client: project => ({
      discover: async () => {
        if (project.project_id === a.project_id) throw new ActionError("host.project_closing", "closing");
        return [answering];
      },
      invoke: async () => project.project_id === a.project_id ? assert.fail("A must not invoke") : { project: "project-b" },
    }),
  };
  const result = await collectHomeAggregate(ports, TYPE, {});
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.answers, [{ project_id: "project-b", source: {
    capability_id: "homeagg.running.read", version: 1, provider_id: "example.plugin",
  }, plugin_id: PLUGIN, subject_kinds: [], output: { project: "project-b" } }]);
});

test("RAC-2781 deferred discovery obeys the real parent's exact cancellation reason", async () => {
  const a = reference("project-a"), parent = new AbortController();
  const parentReason = new Error("parent cancelled aggregate");
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const ports: HomeAggregatePorts = {
    openProjects: () => [a],
    projectPlugins: async () => { throw new ActionError("host.catalog_unavailable", "private catalog error"); },
    whileOpen: async (_project, work) => work(),
    context: async project => context(project.project_id),
    client: () => (fakeActionClient({ discover: async () => { entered(); await held; return []; },
      invoke: async () => assert.fail("discovery never finished") })),
  };
  const pending = collectHomeAggregate(ports, TYPE, {}, parent.signal);
  // Observe pending before abort so its rejection can never be unhandled.
  const observed = assert.rejects(pending, error => error === parentReason);
  try {
    await reached;
    parent.abort(parentReason);
    await observed;
  } finally {
    release();
    await observed.catch(() => {});
  }
});

test("SYS-05 the same captured authority outlives discovery and is released after all providers", async () => {
  const project = reference("captured-authority");
  const views = ["first", "second"].map(id => ({ ...unavailableView(project.project_id), capability_id: "homeagg." + id, availability: { available: true } }));
  let contexts = 0, captured: AbortSignal | undefined, discovery: AbortSignal | undefined;
  const providers: AbortSignal[] = [];
  const validate = async () => { assert.ok(captured); captured.throwIfAborted(); };
  const ports: HomeAggregatePorts = {
    openProjects: () => [project], projectPlugins: async () => () => true, whileOpen: async (_project, work) => work(),
    context: async (_project, signal) => { contexts++; captured = signal; return { ...context(project.project_id), signal, validate_authority: validate }; },
    client: () => ({ discover: async caller => { discovery = caller.signal; assert.notEqual(discovery, captured); return views; },
      invoke: async (caller, source) => {
        assert.equal(caller.validate_authority, validate); assert.equal(caller.query_only, true);
        assert.equal(discovery?.aborted, true, "only the completed discovery deadline has been disposed");
        assert.ok(caller.signal); assert.notEqual(caller.signal, captured); providers.push(caller.signal);
        await caller.validate_authority!(source); return source.capability_id;
      } }),
  };
  const result = await collectHomeAggregate(ports, TYPE, {});
  assert.deepEqual(result.answers.map(answer => answer.output), ["homeagg.first", "homeagg.second"]);
  assert.deepEqual(result.issues, []); assert.equal(contexts, 1);
  assert.notEqual(providers[0], providers[1]); assert.ok(providers.every(signal => signal.aborted));
  assert.equal(captured?.aborted, true, "collection cleanup releases the captured context after both providers");
});

test("SYS-05 a context resolving after its discovery timeout cannot start a late discovery", { timeout: 6_000 }, async () => {
  const project = reference("late-context"), held = Promise.withResolvers<ActionCallContext>();
  let captured: AbortSignal | undefined, discoveries = 0, invocations = 0;
  const result = await collectHomeAggregate({ openProjects: () => [project], projectPlugins: async () => () => true,
    whileOpen: async (_project, work) => work(), context: async (_project, signal) => { captured = signal; return held.promise; },
    client: () => (fakeActionClient({ discover: async () => { discoveries++; return []; }, invoke: async () => { invocations++; return {}; } })),
  }, TYPE, {});
  assert.deepEqual(result, { answers: [], issues: [{ project_id: project.project_id, source: null, code: "actions.timeout" }] });
  assert.equal(captured?.aborted, true);
  held.resolve(context(project.project_id));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(discoveries, 0); assert.equal(invocations, 0);
});

test("RAC-2437 homeAggregatePorts wires the Host's own manifest lookup, which refuses when that Host has no catalog", async () => {
  const host = new MolisWorkLocalHost();
  try {
    await assert.rejects(homeAggregatePorts(host).projectPlugins(reference("project-a")), { code: "host.catalog_unavailable" },
      "the aggregate port must ask the Host, not answer an empty manifest by itself");
  } finally { await host.close(); }
});

test("RAC-2437 through a real catalog, the judgement resolves a Manifest id to the project's plugin key: listed-and-denied is shown, unlisted or non-plugin_disabled keeps main's behaviour", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const home = await mkdtemp(join(tmpdir(), "home-aggregate-catalog-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const withHostCatalog = host.configurePersonalPlanning(home, withCatalog);
  const create = (displayName: string) => withHostCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: displayName, actor_id: "user" }));
  const listedProject = await create("启用 Feed 的项目"), bareProject = await create("没有 Feed 的项目");
  await withHostCatalog({ homeDirectory: home }, catalog => catalog.addProjectPlugin({ project_id: listedProject.project_id, plugin_id: "feed", actor_id: "user" }));
  const reference = (project: { project_id: string; database_path: string }) => molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const view = (code: string): ActionView => ({
    capability_id: "homeagg.catalog.read", version: 1, operation: "query",
    provider: { provider_id: "feed.home.aggregate", title: "Feed", kind: "plugin", plugin_id: "io.molis.work.feed", project_id: listedProject.project_id },
    availability: { available: false, code, reason: "策略拒绝了这个项目的读取" },
    action: { title: "运行中的工作", description: "首页聚合的只读查询", kind: "query", scope: "project", audiences: ["user"], permissions: ["homeagg:read"], subject_kinds: [],
      input_schema: { type: "object" }, output_schema: { type: "object" }, output_type: TYPE, home_aggregate: true },
  });
  const portsFor = (project: { project_id: string; database_path: string }, code: string): HomeAggregatePorts => ({
    openProjects: () => [reference(project)],
    whileOpen: async (_reference, work) => work(),
    client: () => (fakeActionClient({ discover: async () => [view(code)], invoke: async () => assert.fail("an unavailable source is never invoked") })),
    context: async projectReference => context(projectReference.project_id),
    projectPlugins: projectReference => host.projectPluginReach(projectReference.project_id),
  });
  try {
    const denied = await collectHomeAggregate(portsFor(listedProject, "actions.plugin_disabled"), TYPE, {});
    assert.deepEqual(denied.issues.map(issue => issue.code), ["actions.plugin_disabled"], "the project lists Feed, so its policy refusal is shown");
    const unlisted = await collectHomeAggregate(portsFor(bareProject, "actions.plugin_disabled"), TYPE, {});
    assert.deepEqual(unlisted.issues, [], "a project that does not list Feed hears nothing about it being off");
    const serviceDown = await collectHomeAggregate(portsFor(bareProject, "actions.service_unavailable"), TYPE, {});
    assert.deepEqual(serviceDown.issues.map(issue => issue.code), ["actions.service_unavailable"], "a source that cannot answer is still shown, as on main");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

// B103-01: with projects asleep, the Home answers one from its last read while it was not used since, marked resting; one not read yet,
// or used since that read, is read in the background (opened quietly, the page told) and not waited for; one closed on purpose is left.
test("B103-01 a sleeping project is answered from its last read until it is used again; one not read yet is read in the background", async () => {
  const a = reference("project-a"), b = reference("project-b"), c = reference("project-c");
  const answering = (projectId: string): ActionView => ({ ...unavailableView(projectId), availability: { available: true } as const });
  const rests = new Map<string, { state: "open" | "asleep" | "closed" | "never"; usedAt: number | undefined }>([
    [a.storage_key, { state: "open", usedAt: 5 }], [b.storage_key, { state: "never", usedAt: undefined }], [c.storage_key, { state: "closed", usedAt: undefined }]]);
  let quiet = 0;
  const woken: string[] = [], changed: string[] = [];
  const readings = { projects: new Map(), waking: new Set<string>(), pass: Promise.resolve() };
  const ports: HomeAggregatePorts = {
    openProjects: () => [a, b, c].filter(project => rests.get(project.storage_key)!.state === "open"),
    whileOpen: async (_reference, work) => work(),
    client: project => fakeActionClient({ discover: async () => [answering(project.project_id)], invoke: async () => { assert.ok(quiet > 0, "every read is quiet"); return { project: project.project_id }; } }),
    context: async project => context(project.project_id),
    projectPlugins: async () => () => true,
    resting: {
      closed: async () => [a, b, c].filter(project => rests.get(project.storage_key)!.state !== "open"),
      rest: project => rests.get(project.storage_key)!,
      wake: async (project, work) => { woken.push(project.project_id); return work(); },
      quietly: async work => { quiet += 1; try { return await work(); } finally { quiet -= 1; } },
      changed: projectId => { changed.push(projectId); },
      running: () => true,
      readings,
    },
  };
  const read = async () => (await collectHomeAggregate(ports, TYPE, {})).answers.map(answer => `${answer.project_id}${answer.resting ? ":resting" : ""}`).sort();
  assert.deepEqual(await read(), ["project-a"], "the project not read yet is not waited for");
  await readings.pass;
  assert.deepEqual([woken, changed], [["project-b"], ["project-b"]], "it was read in the background and the page told; the one closed on purpose was not");
  // B was opened to be read and went back to sleep unused (as the Host records it, used at 0); A went to sleep unused too.
  rests.set(a.storage_key, { state: "asleep", usedAt: 5 }); rests.set(b.storage_key, { state: "asleep", usedAt: undefined });
  woken.length = 0;
  assert.deepEqual(await read(), ["project-a:resting", "project-b:resting"]);
  await readings.pass;
  assert.deepEqual(woken, [], "neither was opened");
  // A was used before it slept again: its last read no longer holds.
  rests.set(a.storage_key, { state: "asleep", usedAt: 9 });
  assert.deepEqual(await read(), ["project-b:resting"]);
  await readings.pass;
  assert.deepEqual(woken, ["project-a"]);
  assert.deepEqual(await read(), ["project-a:resting", "project-b:resting"]);
  assert.equal(quiet, 0);
});

// B103-01: a read that never got into the project (it went to sleep between the list and the read) is not kept as its last reading, and
// an answer made from a per-provider input is shown for a sleeping project only while what it was made from (`keyOf`) is the same.
test("B103-01 a reading is kept only when it read the project, and shown asleep only while its input key holds", async () => {
  const a = reference("project-a"), b = reference("project-b");
  const answering = (projectId: string): ActionView => ({ ...unavailableView(projectId), availability: { available: true } as const });
  const rests = new Map<string, { state: "open" | "asleep" | "closed" | "never"; usedAt: number | undefined }>([
    [a.storage_key, { state: "open", usedAt: 5 }], [b.storage_key, { state: "never", usedAt: undefined }]]);
  let listed = [a];
  const woken: string[] = [];
  const readings = { projects: new Map(), waking: new Set<string>(), pass: Promise.resolve() };
  const ports: HomeAggregatePorts = {
    openProjects: () => listed,
    // A falls asleep after it was listed and before the read got in.
    whileOpen: async (project, work) => {
      if (project.project_id !== "project-a") return work();
      rests.set(a.storage_key, { state: "asleep", usedAt: 5 });
      return undefined;
    },
    client: project => fakeActionClient({ discover: async () => [answering(project.project_id)], invoke: async () => ({ project: project.project_id }) }),
    context: async project => context(project.project_id),
    projectPlugins: async () => () => true,
    resting: {
      closed: async () => [a, b].filter(project => !listed.includes(project) && rests.get(project.storage_key)!.state !== "open"),
      rest: project => rests.get(project.storage_key)!,
      wake: async (project, work) => { woken.push(project.project_id); return work(); },
      quietly: async work => work(),
      changed: () => undefined,
      running: () => true,
      readings,
    },
  };
  assert.deepEqual((await collectHomeAggregate(ports, TYPE, {})).answers, []);
  listed = [];
  assert.deepEqual((await collectHomeAggregate(ports, TYPE, {})).answers, [], "the empty read was not kept as its reading");
  await readings.pass;
  assert.deepEqual(woken.filter(id => id === "project-a"), ["project-a"], "so it is read in the background instead");

  let key = "k1";
  const each = new HomeAggregateInputEach(() => ({}), () => key), plain = new HomeAggregateInputEach(() => ({}));
  const read = async (input: unknown) => (await collectHomeAggregate(ports, TYPE, input)).answers.map(answer => `${answer.project_id}${answer.resting ? ":resting" : ""}`).sort();
  rests.set(a.storage_key, { state: "closed", usedAt: undefined });
  woken.length = 0;
  assert.deepEqual(await read(each), []);
  await readings.pass;
  assert.deepEqual(woken, ["project-b"]);
  rests.set(b.storage_key, { state: "asleep", usedAt: undefined });
  woken.length = 0;
  assert.deepEqual(await read(each), ["project-b:resting"], "same key: the last answer is shown");
  key = "k2";
  assert.deepEqual(await read(each), [], "the key changed: that answer no longer holds");
  await readings.pass;
  assert.deepEqual(woken, ["project-b"], "and it is read again");
  woken.length = 0;
  assert.deepEqual(await read(plain), [], "an input made per provider without a key is read only from open projects");
  await readings.pass;
  assert.deepEqual(woken, []);
});

test("B103-01 a background resting read discards its result if the project is closed on purpose or used by a person meanwhile", async () => {
  const closedMidRead = reference("project-closed-mid");
  const usedMidRead = reference("project-used-mid");
  const answering = (projectId: string): ActionView => ({ ...unavailableView(projectId), availability: { available: true } as const });
  const rests = new Map<string, { state: "open" | "asleep" | "closed" | "never"; usedAt: number | undefined }>([
    [closedMidRead.storage_key, { state: "never", usedAt: undefined }],
    [usedMidRead.storage_key, { state: "never", usedAt: undefined }],
  ]);
  let reads = 0;
  const changed: string[] = [];
  const readings = { projects: new Map(), waking: new Set<string>(), pass: Promise.resolve() };
  const ports: HomeAggregatePorts = {
    openProjects: () => [],
    whileOpen: async (_reference, work) => work(),
    client: project => fakeActionClient({
      discover: async () => [answering(project.project_id)],
      invoke: async () => {
        reads += 1;
        if (project.project_id === closedMidRead.project_id) {
          rests.set(closedMidRead.storage_key, { state: "closed", usedAt: undefined });
        }
        if (project.project_id === usedMidRead.project_id && reads === 2) {
          rests.set(usedMidRead.storage_key, { state: "open", usedAt: 42 });
        }
        return { version: reads };
      },
    }),
    context: async project => context(project.project_id),
    projectPlugins: async () => () => true,
    resting: {
      closed: async () => [closedMidRead, usedMidRead],
      rest: project => rests.get(project.storage_key)!,
      wake: async (_project, work) => work(),
      quietly: async work => work(),
      changed: projectId => { changed.push(projectId); },
      running: () => true,
      readings,
    },
  };
  await collectHomeAggregate(ports, TYPE, {});
  await readings.pass;
  assert.deepEqual(changed, [], "neither a purposefully closed project nor one used mid-read notifies or caches a stale reading");
  assert.equal(readings.projects.has(closedMidRead.storage_key), false);
  assert.equal(readings.projects.has(usedMidRead.storage_key), false);
  // Once the concurrently-used project sleeps, the next pass reads it fresh instead of serving the discarded pre-use reading.
  rests.set(usedMidRead.storage_key, { state: "asleep", usedAt: 42 });
  assert.deepEqual((await collectHomeAggregate(ports, TYPE, {})).answers, []);
  await readings.pass;
  assert.deepEqual(changed, [usedMidRead.project_id]);
  const fresh = await collectHomeAggregate<{ version: number }>(ports, TYPE, {});
  assert.deepEqual(fresh.answers.map(answer => answer.output.version), [3]);
});

test("resting persistence hydrates unopened projects with zero wakes on matching fingerprint, invalidates on fingerprint or key change, and prunes unknown keys", async () => {
  const a = reference("project-a");
  const b = reference("project-b");
  const source = { capability_id: "homeagg.running.read", version: 1, provider_id: "example.plugin" };
  const answering = (projectId: string): ActionView => ({ ...unavailableView(projectId), availability: { available: true } as const });
  const fp1 = "a".repeat(64);
  const fp2 = "b".repeat(64);
  let liveFp: string | null = fp1;
  let closedList = [a, b];
  let key = "k1";
  const woken: string[] = [];
  const removed: string[] = [];
  const pruned: string[][] = [];
  const kindPlain = JSON.stringify([TYPE, {}]);
  const kindEach = JSON.stringify([TYPE, "each"]);
  const disk = new Map<string, Map<string, { fingerprint: string; keys: Record<string, string>; result: { answers: Array<{ project_id: string; source: typeof source; plugin_id: string | null; subject_kinds: string[]; output: unknown }>; issues: Array<{ project_id: string; source: typeof source | null; code: string }> } }>>([
    [a.storage_key, new Map([
      [kindPlain, { fingerprint: fp1, keys: {}, result: { answers: [{ project_id: a.project_id, source, plugin_id: PLUGIN, subject_kinds: [], output: { project: "from-disk-a" } }], issues: [] } }],
      [kindEach, { fingerprint: fp1, keys: { [JSON.stringify(source)]: "k1" }, result: { answers: [{ project_id: a.project_id, source, plugin_id: PLUGIN, subject_kinds: [], output: { project: "from-disk-a-each" } }], issues: [] } }],
    ])],
  ]);
  const readings = { projects: new Map(), waking: new Set<string>(), pass: Promise.resolve() };
  const ports: HomeAggregatePorts = {
    openProjects: () => [],
    whileOpen: async (_ref, work) => work(),
    client: project => fakeActionClient({
      discover: async () => [answering(project.project_id)],
      invoke: async () => ({ project: `live-${project.project_id}` }),
    }),
    context: async project => context(project.project_id),
    projectPlugins: async () => () => true,
    resting: {
      closed: async () => closedList,
      rest: () => ({ state: "never", usedAt: undefined }),
      wake: async (project, work) => { woken.push(project.project_id); return work(); },
      quietly: async work => work(),
      changed: () => undefined,
      running: () => true,
      readings,
      persistence: {
        fingerprints: async projects => new Map(projects.map(project => [project.storage_key, liveFp])),
        load: project => disk.get(project.storage_key) ?? null,
        remove: storageKey => { removed.push(storageKey); disk.delete(storageKey); },
        prune: known => { pruned.push([...known].sort()); },
      },
    },
  };

  // First read: A hydrates from persisted snapshot with ZERO wakes; B has no persisted snapshot and wakes in background.
  const first = await collectHomeAggregate<{ project: string }>(ports, TYPE, {});
  assert.deepEqual(first.answers.map(answer => [answer.project_id, answer.output.project, answer.resting]), [
    ["project-a", "from-disk-a", true],
  ]);
  await readings.pass;
  assert.deepEqual(woken, ["project-b"], "only the project without a valid persisted snapshot wakes");
  assert.equal(pruned.length, 1, "prune runs on the initial project set");

  // Second read with same project set: prune does not re-scan unnecessarily, A stays hydrated with zero wakes.
  woken.length = 0;
  const second = await collectHomeAggregate<{ project: string }>(ports, TYPE, {});
  assert.equal(second.answers.find(answer => answer.project_id === "project-a")?.output.project, "from-disk-a");
  assert.equal(pruned.length, 1, "unchanged known project set skips redundant disk pruning");
  await readings.pass;
  assert.ok(!woken.includes("project-a"), "A never wakes on repeated reads");

  // Keyed input hydrates from disk when key matches, and invalidates immediately when key changes.
  woken.length = 0;
  const each = new HomeAggregateInputEach(() => ({}), () => key);
  const eachHit = await collectHomeAggregate<{ project: string }>(ports, TYPE, each);
  assert.deepEqual(eachHit.answers.map(answer => [answer.project_id, answer.output.project, answer.resting]), [
    ["project-a", "from-disk-a-each", true],
  ]);
  await readings.pass;
  assert.deepEqual(woken, ["project-b"], "A stayed resting on matching keyOf");
  woken.length = 0;
  key = "k2";
  const eachMiss = await collectHomeAggregate<{ project: string }>(ports, TYPE, each);
  assert.ok(!eachMiss.answers.some(answer => answer.project_id === "project-a"), "key change invalidates hydrated reading");
  await readings.pass;
  assert.ok(woken.includes("project-a"), "invalidated keyOf triggers background wake");

  // Fingerprint change invalidates hydrated in-memory reading and removes stale disk copy immediately.
  woken.length = 0;
  liveFp = fp2;
  const fpMiss = await collectHomeAggregate<{ project: string }>(ports, TYPE, {});
  assert.ok(!fpMiss.answers.some(answer => answer.project_id === "project-a"), "changed fingerprint never serves stale reading");
  assert.ok(removed.includes(a.storage_key), "stale persisted cache is removed on fingerprint mismatch");
  await readings.pass;
  assert.ok(woken.includes("project-a"));

  // Removing a project from the catalog triggers prune for the updated known set.
  closedList = [a];
  await collectHomeAggregate<{ project: string }>(ports, TYPE, {});
  assert.equal(pruned.length, 2);
  assert.deepEqual(pruned[1], [a.storage_key]);
});

test("runtimeOverview invalidates resting readings once an upcoming run reaches due_at within the same hour", async () => {
  const project = reference("project-due");
  const source = { capability_id: "schedule.runs.overview", version: 1, provider_id: "io.molis.work.schedule" };
  const fp = "c".repeat(64);
  let now = new Date("2026-11-22T10:15:00.000Z");
  const woken: string[] = [];
  const kind = JSON.stringify([RUNS_OVERVIEW_OUTPUT_TYPE, "each"]);
  const persistedOverview: RunsOverview = {
    source: { surface: "schedule", title: "定时任务" },
    upcoming: [{ run_id: "soon", title: "soon", due_at: "2026-11-22T10:30:00.000Z", project_id: project.project_id, open: null, needs: [] }],
    missed: [],
    expired: 0,
  };
  const disk = new Map([[project.storage_key, new Map([[kind, {
    fingerprint: fp,
    keys: { [JSON.stringify(source)]: JSON.stringify([null, Math.floor(now.getTime() / 3_600_000)]) },
    result: { answers: [{ project_id: project.project_id, source, plugin_id: "io.molis.work.schedule", subject_kinds: [], output: persistedOverview }], issues: [] },
  }]])]]);
  const readings = { projects: new Map(), waking: new Set<string>(), pass: Promise.resolve() };
  const view: ActionView = {
    capability_id: source.capability_id, version: 1, operation: "query",
    provider: { provider_id: source.provider_id, title: "Schedule", kind: "plugin", plugin_id: source.provider_id, project_id: project.project_id },
    availability: { available: true },
    action: {
      title: "overview", description: "runs overview", kind: "query", scope: "project", audiences: ["user"], permissions: [],
      subject_kinds: [], input_schema: { type: "object" }, output_schema: { type: "object" },
      input_type: RUNS_OVERVIEW_INPUT_TYPE, output_type: RUNS_OVERVIEW_OUTPUT_TYPE, home_aggregate: true,
    },
  };
  const ports: RuntimeOverviewPorts = {
    aggregate: {
      openProjects: () => [],
      whileOpen: async (_ref, work) => work(),
      client: () => fakeActionClient({
        discover: async () => [view],
        invoke: async () => ({
          source: { surface: "schedule", title: "定时任务" },
          upcoming: [],
          missed: [{ run_id: "soon", title: "soon", due_at: "2026-11-22T10:30:00.000Z", missed_at: "2026-11-22T10:35:00.000Z", project_id: project.project_id, open: null, needs: [] }],
          expired: 0,
        } satisfies RunsOverview),
      }),
      context: async ref => context(ref.project_id),
      projectPlugins: async () => () => true,
      resting: {
        closed: async () => [project],
        rest: () => ({ state: "never", usedAt: undefined }),
        wake: async (ref, work) => { woken.push(ref.project_id); return work(); },
        quietly: async work => work(),
        changed: () => undefined,
        running: () => true,
        readings,
        persistence: {
          fingerprints: async () => new Map([[project.storage_key, fp]]),
          load: ref => disk.get(ref.storage_key) ?? null,
          remove: () => undefined,
          prune: () => undefined,
        },
      },
    },
    within: async () => undefined,
    now: () => now,
    online: () => true,
    model: () => true,
    gaps: () => [],
    expiredSeen: () => ({}),
  };

  // At 10:15 (before 10:30 due_at, same hour): serves persisted overview with zero wakes.
  const beforeDue = await runtimeOverview(ports);
  assert.deepEqual(beforeDue.upcoming.map(row => row.run_id), ["soon"]);
  await readings.pass;
  assert.deepEqual(woken, []);

  // At 10:35 (STILL hour 10, but 10:30 has passed): invalidates cached upcoming run and wakes project to re-read.
  now = new Date("2026-11-22T10:35:00.000Z");
  const afterDue = await runtimeOverview(ports);
  assert.deepEqual(afterDue.upcoming, [], "past-due upcoming run is never served from stale resting cache");
  await readings.pass;
  assert.deepEqual(woken, [project.project_id]);
});

test("homeBackgroundTasks marks under-way readings non-persistable and refuses to serve under-way resting snapshots", async () => {
  const project = reference("project-running");
  const source = { capability_id: "coding.background.tasks", version: 1, provider_id: "io.molis.work.coding" };
  const fp = "d".repeat(64);
  const kind = JSON.stringify([BACKGROUND_TASKS_OUTPUT_TYPE, {}]);
  const runningCollection: BackgroundTaskCollection = {
    source: { surface: "coding", title: "Coding", icon: "code" },
    tasks: [{
      subject: { kind: "coding_session", id: "s1" },
      title: "active task",
      state: "running",
      waiting: false,
      details: [],
      updated_at: "2026-11-22T10:00:00.000Z",
      executor: { kind: "plugin", label: "Coding" },
      serves: [],
      scope: "project",
      commands: [],
      decisions: [],
      open: { kind: "item", surface: "coding", id: "s1", title: "active task", label: "Open" },
    }],
  };
  const verifiedCollection: BackgroundTaskCollection = {
    ...runningCollection,
    tasks: [{ ...runningCollection.tasks[0]!, state: "verify" }],
  };
  const view: ActionView = {
    capability_id: source.capability_id, version: 1, operation: "query",
    provider: { provider_id: source.provider_id, title: "Coding", kind: "plugin", plugin_id: source.provider_id, project_id: project.project_id },
    availability: { available: true },
    action: {
      title: "tasks", description: "bg tasks", kind: "query", scope: "project", audiences: ["user"], permissions: [],
      subject_kinds: ["coding_session"], input_schema: { type: "object" }, output_schema: { type: "object" },
      output_type: BACKGROUND_TASKS_OUTPUT_TYPE, home_aggregate: true,
    },
  };
  const woken: string[] = [];
  const readings = { projects: new Map(), waking: new Set<string>(), pass: Promise.resolve() };
  let openList: typeof project[] = [project];
  let liveOutput: BackgroundTaskCollection = runningCollection;
  const disk = new Map([[project.storage_key, new Map([[kind, {
    fingerprint: fp,
    keys: {},
    result: { answers: [{ project_id: project.project_id, source, plugin_id: source.provider_id, subject_kinds: ["coding_session"], output: runningCollection }], issues: [] },
  }]])]]);
  const ports: HomeAggregatePorts = {
    openProjects: () => openList,
    whileOpen: async (_ref, work) => work(),
    client: () => fakeActionClient({ discover: async () => [view], invoke: async () => liveOutput }),
    context: async ref => context(ref.project_id),
    projectPlugins: async () => () => true,
    resting: {
      closed: async () => openList.length ? [] : [project],
      rest: () => openList.length ? { state: "open", usedAt: 5 } : { state: "never", usedAt: undefined },
      wake: async (ref, work) => { woken.push(ref.project_id); return work(); },
      quietly: async work => work(),
      changed: () => undefined,
      running: () => true,
      readings,
      persistence: {
        fingerprints: async () => new Map([[project.storage_key, fp]]),
        load: ref => disk.get(ref.storage_key) ?? null,
        remove: () => undefined,
        prune: () => undefined,
      },
    },
  };

  // Reading an open project with a running task marks the in-memory reading non-persistable.
  const openRead = await homeBackgroundTasks(ports, [{ project_id: project.project_id, display_name: "Running" }]);
  assert.equal(openRead.tasks[0]?.state, "running");
  assert.equal(readings.projects.get(project.storage_key)?.get(kind)?.persistable, false);

  // Even if a stale cache file contains an under-way task after restart, homeBackgroundTasks refuses to serve it and wakes instead.
  readings.projects.clear();
  openList = [];
  liveOutput = verifiedCollection;
  const restarted = await homeBackgroundTasks(ports, [{ project_id: project.project_id, display_name: "Running" }]);
  assert.deepEqual(restarted.tasks, [], "stale running task from cache is never served as resting");
  await readings.pass;
  assert.deepEqual(woken, [project.project_id], "wakes to reconcile post-restart state");
});

test("collectHomeAggregate awaits pending sleep persistence and caches unopenable projects without repeat wakes until DB changes", async () => {
  const sleeping = reference("project-sleep-race");
  const broken = reference("project-broken");
  const source = { capability_id: "homeagg.running.read", version: 1, provider_id: "example.plugin" };
  const homeView = (projectId: string): ActionView => ({
    ...unavailableView(projectId),
    availability: { available: true },
  });
  const fpSleep = "e".repeat(64);
  const fpBroken = "f".repeat(64);
  const kind = JSON.stringify([TYPE, {}]);
  const readings = { projects: new Map(), waking: new Set<string>(), pass: Promise.resolve() };
  const woken: string[] = [];
  const removed: string[] = [];

  // Pre-seed an in-memory reading from before sleep (fingerprint still unstamped while sleep persistence is in flight).
  readings.projects.set(sleeping.storage_key, new Map([[kind, {
    usedAt: 42,
    persistable: true,
    result: { answers: [{ project_id: sleeping.project_id, source, plugin_id: PLUGIN, subject_kinds: [], output: { project: sleeping.project_id } }], issues: [] },
    keys: {},
  }]]));

  let releaseSleepPersist!: () => void;
  const sleepPersistGate = new Promise<void>(resolve => { releaseSleepPersist = resolve; });
  let pendingForSleep = true;
  let brokenLiveFp: string | null = null;
  let brokenStamp = "unreadable:stat-1";
  let brokenCanOpen = false;
  let brokenState: "never" | "open" = "never";

  const ports: HomeAggregatePorts = {
    openProjects: () => [],
    whileOpen: async (_ref, work) => work(),
    client: ref => fakeActionClient({
      discover: async () => [homeView(ref.project_id)],
      invoke: async () => ({ project: ref.project_id }),
    }),
    context: async ref => context(ref.project_id),
    projectPlugins: async () => () => true,
    resting: {
      closed: async () => [sleeping, broken],
      rest: ref => ref.project_id === sleeping.project_id
        ? { state: "asleep", usedAt: 42 }
        : { state: brokenState, usedAt: undefined },
      wake: async (ref, work) => {
        woken.push(ref.project_id);
        if (ref.project_id === broken.project_id && !brokenCanOpen) {
          throw new ActionError("actions.execution_failed", "corrupt sqlite db");
        }
        if (ref.project_id === broken.project_id) brokenState = "open";
        return work();
      },
      quietly: async work => work(),
      changed: () => undefined,
      running: () => true,
      readings,
      persistence: {
        awaitPending: async closed => {
          if (pendingForSleep && closed.some(item => item.storage_key === sleeping.storage_key)) {
            await sleepPersistGate;
          }
        },
        fingerprints: async closed => new Map(closed.map(item => [
          item.storage_key,
          item.storage_key === sleeping.storage_key ? fpSleep : brokenLiveFp,
        ])),
        observedToken: () => brokenStamp,
        load: () => null,
        remove: key => { removed.push(key); },
        prune: () => undefined,
      },
    },
  };

  // Start aggregate poll while sleep persistence is still running (fingerprint unstamped).
  const concurrentPoll = collectHomeAggregate<{ project: string }>(ports, TYPE, {});
  // Simulate persistProjectRestingReadings finishing and stamping the fingerprint before releasing the barrier.
  readings.projects.get(sleeping.storage_key)!.get(kind)!.fingerprint = fpSleep;
  pendingForSleep = false;
  releaseSleepPersist();

  const first = await concurrentPoll;
  assert.deepEqual(first.answers.map(answer => [answer.project_id, answer.resting]), [[sleeping.project_id, true]],
    "awaitPending preserves valid pre-sleep reading instead of wiping and re-waking");
  await readings.pass;
  assert.deepEqual(woken, [broken.project_id], "sleeping project is never re-woken; broken project is tried once");
  assert.equal(readings.projects.get(broken.storage_key)?.get(kind)?.persistable, false, "failed-open reading is never persistable");

  // Repeat polls with unchanged unreadable stamp do NOT re-wake the broken project.
  woken.length = 0;
  const second = await collectHomeAggregate<{ project: string }>(ports, TYPE, {});
  assert.equal(second.answers.length, 1);
  assert.equal(second.issues.length, 1);
  await readings.pass;
  assert.deepEqual(woken, [], "broken project does not thrash background wakes on repeat polls");

  // Once the broken DB file changes (stamp changes -> valid fingerprint), it retries once and succeeds.
  brokenCanOpen = true;
  brokenLiveFp = fpBroken;
  brokenStamp = "unreadable:stat-2";
  await collectHomeAggregate<{ project: string }>(ports, TYPE, {});
  await readings.pass;
  assert.deepEqual(woken, [broken.project_id], "repaired DB invalidates failed-open cache and wakes once");
  assert.ok(removed.includes(broken.storage_key));
});
