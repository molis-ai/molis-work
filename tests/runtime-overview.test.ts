import { openTestHome } from "./fixtures/test-home.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalWebCoreFactory, decideRuntimeRun, expiredOwnerKey, expiredSeen, LocalProjectDatabase, markExpiredSeen, runningPartitionPlatformServices, runtimeExpiredSeenRequest, runtimeOverview, runtimeRunDecisionRequest, scheduledRunsOf, type RuntimeOverviewPorts, type RunsClient } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts, isDesktopShellRequest, NATIVE_DESKTOP_BOOTSTRAP_SCRIPT, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ActionError, defineRunDecisionAction, defineRunsOverviewAction, RUN_MISSED_KEPT_MS, type ActionDefinition, type ActionView, type RunsOverview,
  type RunsWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { OverviewIndexRow } from "@molis-ai/molis-work-contracts/platform/plugin";
import { scheduleManifest } from "@molis-ai/molis-work-plugin-schedule";
import { writeMainOverviewRows } from "./fixtures/overview-rows.js";
import { createProject, LocalHostHttpClient, projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";

/**
 * RES-05, V17: the partitions' runs come from the overview, where each plugin wrote them as `scheduled_run` rows (no project is asked or
 * opened); the Home's own owners are found by type and asked once. All are put side by side; a Home owner that fails or sends what cannot
 * be drawn is named by its code and costs the others nothing.
 */

const NOW = "2026-11-11T09:00:00.000Z";
const reference = (projectId: string): LocalHostProjectReference => ({ project_id: projectId, storage_key: `/tmp/${projectId}` });
const view = (definition: ActionDefinition, provider: string, projectId: string | null, available = true): ActionView => ({
  capability_id: definition.capability_id, version: definition.version, operation: definition.operation, action: definition.action,
  provider: { provider_id: provider, title: provider, kind: "plugin", ...(projectId ? { project_id: projectId, plugin_id: provider } : {}) },
  availability: available ? { available: true } : { available: false, code: "actions.plugin_disabled", reason: "停用了" },
});
const projectDecision = (id: string) => defineRunDecisionAction(`${id}.runs.decide`, 1, id, [], "project");
const homeOverview = defineRunsOverviewAction("assistant.runs.overview", 1, "助理", [], "home");
const homeDecision = defineRunDecisionAction("assistant.runs.decide", 1, "助理", [], "home");
const run = (id: string, due: string, needs: Array<"network" | "model"> = [], project: string | null = null) =>
  ({ run_id: id, title: id, due_at: due, project_id: project, open: null, needs });
const MANIFESTS = new Map([["schedule", { plugin_id: "schedule", name: "定时任务" }], ["feed", { plugin_id: "feed", name: "Feed 来源" }]]);
/** One `scheduled_run` row as the overview index hands it over. */
const row = (partition: string, plugin: string, id: string, due: string, more: { missed_at?: string; needs?: string[]; open?: { surface: string; id: string } } = {}): OverviewIndexRow =>
  ({ partition_id: partition, install_id: `install-${plugin}`, plugin_id: plugin, kind: "scheduled_run", row_id: id,
    fields: { title: id, due_at: due, updated_at: NOW, needs: more.needs ?? [], open: more.open ?? { surface: plugin, id }, ...(more.missed_at ? { missed_at: more.missed_at } : {}) } });

function harness(rows: readonly OverviewIndexRow[], answers: Record<string, (input: unknown) => unknown>, options: { online?: boolean; model?: boolean; seen?: Record<string, string> } = {}) {
  const calls: string[] = [];
  const projects = [reference("p1"), reference("p2")];
  const projectViews = (projectId: string) => [view(projectDecision("schedule"), "schedule", projectId), view(projectDecision("feed"), "feed", projectId)];
  const answer = (key: string, input: unknown) => { calls.push(key); const respond = answers[key]; if (!respond) throw new ActionError("actions.not_found", "没有"); return respond(input); };
  const homeViews = [view(homeOverview, "assistant", null), view(homeDecision, "assistant", null)];
  const client = (scope: string | null): RunsClient => ({
    discover: async () => scope === null ? homeViews : projectViews(scope),
    invoke: async (action, input) => answer(`${scope ?? "home"}:${action.capability_id}`, input),
  });
  const ports: RuntimeOverviewPorts = {
    projectRuns: async (window, bounds) => {
      assert.equal(window.now.toISOString(), NOW);
      assert.equal(window.until.getTime() - window.now.getTime(), 48 * 3_600_000, "the next two days");
      return scheduledRunsOf(rows, MANIFESTS, window, bounds);
    },
    within: async (scope, work) => scope === null || projects.some(project => project.project_id === scope) ? work(client(scope)) : undefined,
    now: () => new Date(NOW), online: () => options.online ?? true, model: () => options.model ?? true,
    gaps: () => [{ from: "2026-11-11T01:00:00.000Z", to: "2026-11-11T07:00:00.000Z", cause: "sleep" }],
    expiredSeen: () => options.seen ?? {},
  };
  return { ports, calls };
}

const overview = (source: string, upcoming: unknown[], missed: unknown[] = [], expired = 0, title = source) => (input: unknown) => {
  const window = input as RunsWindow;
  assert.equal(window.now, NOW);
  assert.equal(Date.parse(window.upcoming_until) - Date.parse(window.now), 48 * 3_600_000, "the next two days");
  return { source: { surface: source, title }, upcoming, missed, expired } as RunsOverview;
};

test("RES-05 UPP-37 the partitions' runs are read from the overview and the Home owners asked once; all side by side, sorted, each with where it came from", async () => {
  const { ports, calls } = harness([
    row("p1", "schedule", "t2", "2026-11-11T12:00:00.000Z", { needs: ["model"] }),
    row("p1", "schedule", "t0", "2026-11-11T06:00:00.000Z", { missed_at: NOW }),
    row("p1", "feed", "pull", "2026-11-11T10:00:00.000Z", { needs: ["network"] }),
    // Past the two days, or gone by: not listed.
    row("p2", "feed", "far", "2026-11-14T10:00:00.000Z"), row("p2", "schedule", "past", "2026-11-11T08:00:00.000Z"),
  ], {
    "home:assistant.runs.overview": overview("assistant", [run("fu", "2026-11-11T11:00:00.000Z", ["model"])], [{ ...run("fu-old", "2026-11-11T08:00:00.000Z"), missed_at: NOW }]),
  });
  const result = await runtimeOverview(ports);
  assert.equal(result.state, "running");
  assert.deepEqual(calls, ["home:assistant.runs.overview"], "only the Home owner is asked; no project is");
  assert.deepEqual(result.upcoming.map(item => [item.run_id, item.project_id, item.source.scope_project_id, item.source.provider_id, item.source.title]), [
    ["pull", "p1", "p1", "feed", "Feed 来源"], ["fu", null, null, "assistant", "assistant"], ["t2", "p1", "p1", "schedule", "定时任务"]], "by time; a partition's run is that partition's");
  assert.deepEqual(result.missed.map(item => [item.run_id, item.source.surface]), [["fu-old", "assistant"], ["t0", "schedule"]], "latest first");
  assert.deepEqual(result.gaps.map(gap => gap.cause), ["sleep"]);
  assert.deepEqual(result.unavailable_sources, []);
});

test("RES-05 a Home owner that fails, times out or answers what cannot be drawn is named by its code; the partitions' runs are listed as usual", async () => {
  const { ports } = harness([row("p2", "feed", "pull", "2026-11-11T10:00:00.000Z", { needs: ["network"] }), row("p1", "schedule", "t1", "2026-11-11T11:00:00.000Z", { needs: ["model"] })], {
    "home:assistant.runs.overview": () => { throw new ActionError("assistant.unreadable", "PRIVATE owner words"); },
  }, { online: false });
  const result = await runtimeOverview(ports);
  assert.deepEqual(result.upcoming.map(item => [item.run_id, item.waiting]), [["pull", true], ["t1", false]], "without a network the pull waits; the model one does not");
  assert.deepEqual(result.waiting, { network: true, model: false });
  assert.deepEqual(result.unavailable_sources.map(issue => [issue.project_id, issue.provider_id, issue.code]), [[null, "assistant", "assistant.unreadable"]]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/u, "what an owner said in its error stays out");
  const stalled = await runtimeOverview(harness([], { "home:assistant.runs.overview": () => new Promise(() => undefined) }).ports);
  assert.deepEqual(stalled.unavailable_sources.map(issue => issue.code), ["actions.timeout"]);
  const undrawable = await runtimeOverview(harness([], { "home:assistant.runs.overview": () => ({ source: { surface: "bad surface!", title: "x" }, upcoming: [], missed: [], expired: 0 }) }).ports);
  assert.deepEqual(undrawable.unavailable_sources.map(issue => issue.code), ["actions.output_invalid"]);
});

test("RES-05 现在做 and 跳过 go to the decision action of the same owner in the same place (in a partition, its plugin); an owner no longer there is gone", async () => {
  const decided: unknown[] = [];
  const { ports } = harness([], {
    "p1:feed.runs.decide": input => { decided.push(input); return { state: "started" }; },
    "home:assistant.runs.decide": input => { decided.push(input); return { state: "skipped" }; },
  });
  assert.deepEqual(await decideRuntimeRun(ports, runtimeRunDecisionRequest({ scope_project_id: "p1", provider_id: "feed", run_id: "pull:1", decision: "run_now" })), { state: "started" });
  assert.deepEqual(await decideRuntimeRun(ports, runtimeRunDecisionRequest({ scope_project_id: null, provider_id: "assistant", run_id: "followup:a:1", decision: "skip" })), { state: "skipped" });
  assert.deepEqual(decided, [{ run_id: "pull:1", decision: "run_now" }, { run_id: "followup:a:1", decision: "skip" }]);
  assert.deepEqual(await decideRuntimeRun(ports, runtimeRunDecisionRequest({ scope_project_id: "closed", provider_id: "feed", run_id: "pull:1", decision: "skip" })), { state: "gone" });
  assert.deepEqual(await decideRuntimeRun(ports, runtimeRunDecisionRequest({ scope_project_id: "p1", provider_id: "nobody", run_id: "x", decision: "skip" })), { state: "gone" });
  for (const bad of [{ scope_project_id: "p1", provider_id: "feed", run_id: "x", decision: "later" }, { provider_id: "feed", run_id: "x", decision: "skip" }])
    assert.throws(() => runtimeRunDecisionRequest(bad), { code: "actions.input_invalid" });
});

test("BL-missed-runs-never-expire UPP-37 the runs expired and not yet told are counted together and by owner, each owner from its own mark", async () => {
  const asked: Record<string, string | null> = {};
  const told = "2026-11-10T09:00:00.000Z", earlier = "2026-11-08T09:00:00.000Z";
  const rows = [
    // p1's Schedule was told at `told`: of its runs past their seven days, one due after `told` less seven days and one missed after `told` count.
    row("p1", "schedule", "a", "2026-11-03T10:00:00.000Z", { missed_at: "2026-11-03T10:00:00.000Z" }),
    row("p1", "schedule", "b", "2026-11-02T10:00:00.000Z", { missed_at: "2026-11-02T10:00:00.000Z" }),
    row("p1", "schedule", "c", "2026-11-01T10:00:00.000Z", { missed_at: "2026-11-10T10:00:00.000Z" }),
    // Never told: every expired one counts.
    row("p2", "schedule", "d", "2026-11-01T10:00:00.000Z", { missed_at: "2026-11-01T10:00:00.000Z" }),
    row("p1", "feed", "e", "2026-11-02T10:00:00.000Z", { missed_at: "2026-11-02T10:00:00.000Z" }),
    // Told at `earlier`, before which this one had already expired.
    row("p2", "feed", "f", "2026-11-01T08:00:00.000Z", { missed_at: "2026-11-01T08:00:00.000Z" }),
  ];
  const result = await runtimeOverview(harness(rows, { "home:assistant.runs.overview": input => { asked.home = (input as RunsWindow).expired_after; return overview("assistant", [], [], 0, "助理定时")(input); } },
    { seen: { [expiredOwnerKey("p1", "schedule")]: told, [expiredOwnerKey("p2", "feed")]: earlier, [expiredOwnerKey(null, "assistant")]: told } }).ports);
  assert.deepEqual(asked, { home: told }, "the Home owner counts only what it has not been told about");
  assert.deepEqual(result.expired, { count: 4, through: NOW, sources: [{ title: "定时任务", count: 3 }, { title: "Feed 来源", count: 1 }],
    owners: [expiredOwnerKey("p1", "schedule"), expiredOwnerKey("p2", "schedule"), expiredOwnerKey("p1", "feed"), expiredOwnerKey("p2", "feed"), expiredOwnerKey(null, "assistant")].sort() },
    "one count across partitions, by owner, the moment it was made, and the owners read");
  assert.deepEqual(result.missed, [], "none of them is listed: their seven days are over");
  assert.throws(() => runtimeExpiredSeenRequest({ through: "later" }), ActionError);
  assert.deepEqual(runtimeExpiredSeenRequest({ through: NOW }), { through: NOW });
});

test("BL-missed-runs-never-expire the marks are kept in the Home owner by owner: a restart reads them back, only the owners told move, never back or past now", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-work-expired-seen-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const a = expiredOwnerKey("p1", "feed"), b = expiredOwnerKey("p2", "feed"), assistant = expiredOwnerKey(null, "assistant");
  assert.deepEqual(expiredSeen(home), {}, "nothing told yet: every expired run still kept is counted once");
  assert.deepEqual(markExpiredSeen(home, NOW, [a, assistant], new Date(NOW)), { [a]: NOW, [assistant]: NOW });
  assert.deepEqual(expiredSeen(home), { [a]: NOW, [assistant]: NOW }, "read back as a restarted Host reads it; p2 was closed and keeps no mark");
  assert.equal(markExpiredSeen(home, "2026-11-01T00:00:00.000Z", [a, b], new Date(NOW))[a], NOW, "an older summary read late does not move a mark back");
  assert.equal(expiredSeen(home)[b], "2026-11-01T00:00:00.000Z", "but gives an owner with none its first");
  assert.equal(markExpiredSeen(home, "2027-01-01T00:00:00.000Z", [a], new Date("2026-11-12T00:00:00.000Z"))[a], "2026-11-12T00:00:00.000Z", "never past now");
  assert.equal(markExpiredSeen(home, NOW, [], new Date("2027-03-01T00:00:00.000Z"))[b], "2026-11-01T00:00:00.000Z",
    "a mark is not dropped for its age: an owner closed for months still keeps what it was told");
  mkdirSync(join(home, "run"), { recursive: true });
  writeFileSync(join(home, "run", "expired-seen.json"), "{ torn");
  assert.deepEqual(expiredSeen(home), {}, "a torn file counts as nothing told");
  writeFileSync(join(home, "run", "expired-seen.json"), JSON.stringify({ schema_version: 2, seen: { [a]: NOW } }));
  assert.deepEqual(expiredSeen(home), {}, "a version this one did not write is not read");
});

test("BL-missed-runs-never-expire /api/runtime/expired/seen isolates homes, ignores empty polls, and returns 409 on cache miss without writing", async t => {
  const homeA = mkdtempSync(join(tmpdir(), "molis-work-rt-http-a-"));
  const homeB = mkdtempSync(join(tmpdir(), "molis-work-rt-http-b-"));
  const token = "runtime-overview-http-test-token-0123456789";
  const create = createLocalWebCoreFactory({
    withCatalog: withMolisWorkProjectCatalog,
    desktopRenderer: desktopWorkbenchRendererPorts,
    cliAvailability: () => ({}),
    isDesktopShellRequest,
    nativeDesktopBootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT,
    ptyClientFilePath: () => "unused.js",
  });
  const serverA = create({ homeDirectory: homeA, controlToken: token });
  const serverB = create({ homeDirectory: homeB, controlToken: token });
  t.after(async () => {
    serverA.closeAllConnections();
    serverB.closeAllConnections();
    await new Promise<void>(resolve => serverA.close(() => resolve()));
    await new Promise<void>(resolve => serverB.close(() => resolve()));
    rmSync(homeA, { recursive: true, force: true });
    rmSync(homeB, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => serverA.listen(0, "127.0.0.1", resolve));
  await new Promise<void>(resolve => serverB.listen(0, "127.0.0.1", resolve));
  const addrA = serverA.address();
  const addrB = serverB.address();
  assert.ok(addrA && typeof addrA === "object" && addrB && typeof addrB === "object");
  const originA = `http://127.0.0.1:${addrA.port}`;
  const originB = `http://127.0.0.1:${addrB.port}`;
  const webA = new LocalHostHttpClient({ origin: originA, controlToken: token });
  const project = await createProject(webA, "Expired Summary Project");
  // Open project in Host A first so Schedule initializes its own tables and baseline cleanly.
  const openRes = await fetch(`${originA}/projects/${project.project_id}/?openPlugin=schedule`);
  assert.equal(openRes.status, 200);
  const db = new LocalProjectDatabase(project.database_path);
  try {
    const dueAt = new Date(Date.now() - RUN_MISSED_KEPT_MS - 2 * 86_400_000).toISOString();
    const missedAt = new Date(Date.now() - 86_400_000).toISOString();
    db.db.prepare(
      "INSERT INTO schedule_missed_runs (run_id, kind, ref, title, due_at, missed_at) VALUES (?, 'reminder', ?, ?, ?, ?)",
    ).run(`reminder:r1:${dueAt}`, "r1", "过期提醒", dueAt, missedAt);
    // The row Schedule keeps with it in the overview (V17), which the panel reads.
    await writeMainOverviewRows(homeA, db, project.project_id, scheduleManifest, rows => rows.upsert("scheduled_run",
      { row_id: `reminder:r1:${dueAt}`, title: "过期提醒", due_at: dueAt, missed_at: missedAt, updated_at: missedAt }));
  } finally {
    db.close();
  }

  const postSeen = async (origin: string, through: string) => {
    const response = await fetch(`${origin}/api/runtime/expired/seen`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "x-molis-work-control-token": token,
        "x-molis-work-idempotency-key": randomUUID(),
      },
      body: JSON.stringify({ through }),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };

  // Cache miss refuses with 409 and does not create run/expired-seen.json.
  const stale = await postSeen(originA, "2026-11-11T09:00:00.000Z");
  assert.equal(stale.status, 409);
  assert.equal(stale.body.applied, false);
  assert.equal(stale.body.code, "runtime.expired_summary_stale");
  assert.equal(existsSync(join(homeA, "run", "expired-seen.json")), false);

  // Read non-empty summary for homeA.
  const overviewRes = await fetch(`${originA}/api/runtime/overview`);
  assert.equal(overviewRes.status, 200);
  const first = await overviewRes.json() as { expired: { count: number; through: string } };
  assert.equal(first.expired.count, 1, JSON.stringify(first));
  const through = first.expired.through;

  // 260 empty polls on homeB must not evict homeA's cached non-empty summary.
  for (let i = 0; i < 260; i++) {
    const emptyRes = await fetch(`${originB}/api/runtime/overview`);
    assert.equal(emptyRes.status, 200);
  }

  // Different home cannot consume homeA's cached through.
  const wrongHome = await postSeen(originB, through);
  assert.equal(wrongHome.status, 409);
  assert.equal(wrongHome.body.applied, false);

  // homeA's cached entry survived all 260 empty polls and persists owner marks.
  const ok = await postSeen(originA, through);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.applied, true);
  assert.ok(Object.keys(expiredSeen(homeA)).length > 0, "owner marks persisted to run/expired-seen.json");
  const afterRes = await fetch(`${originA}/api/runtime/overview`);
  const after = await afterRes.json() as { expired: { count: number } };
  assert.equal(after.expired.count, 0, "acknowledged expired summary is not repeated");
});

test("B2R-02 a delayed Home provider cannot retain a revoked project in the runtime response", async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const { ports } = harness([
    row("p1", "schedule", "first", "2026-11-11T10:00:00.000Z"), row("p2", "schedule", "second", "2026-11-11T10:00:00.000Z"),
    row("p1", "schedule", "missed", "2026-11-11T06:00:00.000Z", { missed_at: NOW }),
    row("p1", "schedule", "expired", "2026-10-01T00:00:00.000Z", { missed_at: NOW }),
  ], { "home:assistant.runs.overview": async input => { entered.resolve(); await release.promise; return overview("assistant", [])(input); } });
  let denied = "";
  const pending = runtimeOverview({ ...ports, readableProjects: ids => ids.filter(id => id !== denied), projectRuns: async (...args) => {
    const runs = await ports.projectRuns(...args);
    return runs && { ...runs, refreshing: ["p1"], updating: true };
  } });
  await entered.promise;
  denied = "p1";
  release.resolve();
  const result = await pending;
  assert.deepEqual(result.upcoming.map(run => run.run_id), ["second"]);
  assert.equal(result.updating, undefined, "the only refreshing partition lost access");
  assert.deepEqual(result.missed, []);
  assert.equal(result.expired.count, 0);
  assert.ok(!result.expired.owners.includes(expiredOwnerKey("p1", "schedule")));
});

test("UPP-30 the runtime panel applies project readability to cached scheduled runs", async t => {
  let denied = "";
  const home = await openTestHome(t, { host: { overviewProjectAccess: (_caller, id) => id !== denied } });
  const a = await home.createProject("A"), b = await home.createProject("B");
  const now = new Date().toISOString(), due = new Date(Date.now() + 60_000).toISOString();
  for (const project of [a, b]) {
    await fetch(`${home.origin}/projects/${project.project_id}/?openPlugin=schedule`);
    const store = new LocalProjectDatabase(project.database_path);
    try {
      await writeMainOverviewRows(home.home, store, project.project_id, scheduleManifest, rows => rows.upsert("scheduled_run",
        { row_id: project.project_id, title: project.project_id, due_at: due, updated_at: now }));
    } finally { store.close(); }
  }
  const titles = async () => {
    const result = await fetch(`${home.origin}/api/runtime/overview`);
    assert.equal(result.status, 200);
    return ((await result.json()) as { upcoming: { title: string }[] }).upcoming.map(row => row.title);
  };
  const visible = await titles();
  assert.ok(visible.includes(a.project_id) && visible.includes(b.project_id));
  denied = a.project_id;
  const allowed = await titles();
  assert.ok(!allowed.includes(a.project_id) && allowed.includes(b.project_id));
  denied = "";
  const release = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>(), projected = Promise.withResolvers<void>();
  const index = runningPartitionPlatformServices(home.home)!.overview, readIndex = index.read.bind(index);
  t.mock.method(index, "read", (...args: Parameters<typeof readIndex>) => {
    const rows = readIndex(...args);
    if ([a, b].every(project => rows.some(row => row.row_id === project.project_id && row.kind === "scheduled_run"))) projected.resolve();
    return rows;
  });
  const query = defineRunsOverviewAction("fixture.pending.runs", 1, "Pending source", [], "home");
  home.host.actionRegistry().registerProvider({ provider: { provider_id: "fixture.pending", title: "Pending", kind: "system" }, definitions: [query],
    handlers: [{ ...query, async handle() { entered.resolve(); await release.promise; return { source: { title: "Pending", surface: "pending" }, upcoming: [], missed: [], expired: 0 }; } }] });
  const inFlight = titles();
  try {
    await Promise.all([entered.promise, projected.promise]);
    await home.web.delete(`/api/settings/projects/${a.project_id}/plugins`, { plugin_id: "schedule", expected_revision: await projectPluginRevision(home.web, a.project_id) });
  } finally { release.resolve(); }
  const afterRemoval = await inFlight;
  assert.ok(!afterRemoval.includes(a.project_id) && afterRemoval.includes(b.project_id), "B2R-02: removal while the Home run source waits applies to this response");
});
