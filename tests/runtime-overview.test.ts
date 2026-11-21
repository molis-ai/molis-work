import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalWebCoreFactory, decideRuntimeRun, expiredOwnerKey, expiredSeen, LocalProjectDatabase, markExpiredSeen, runtimeExpiredSeenRequest, runtimeOverview, runtimeRunDecisionRequest, type HomeAggregatePorts, type RuntimeOverviewPorts, type RunsClient } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts, isDesktopShellRequest, NATIVE_DESKTOP_BOOTSTRAP_SCRIPT, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ActionError, defineRunDecisionAction, defineRunsOverviewAction, RUN_MISSED_KEPT_MS, type ActionCallContext, type ActionDefinition, type ActionView, type RunsOverview,
  type RunsWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { createProject, LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";

/**
 * RES-05: the Host finds every owner of runs by type — the project ones in each open project, the Home ones in the Home — asks each once,
 * and puts the answers side by side; one that fails or sends what cannot be drawn is named by its code and costs the others nothing.
 */

const NOW = "2026-11-11T09:00:00.000Z";
const reference = (projectId: string): LocalHostProjectReference => ({ project_id: projectId, storage_key: `/tmp/${projectId}` });
const context = (projectId: string): ActionCallContext => ({ actor_id: "owner", project_id: projectId, audience: "user", permissions: [] });
const view = (definition: ActionDefinition, provider: string, projectId: string | null, available = true): ActionView => ({
  capability_id: definition.capability_id, version: definition.version, operation: definition.operation, action: definition.action,
  provider: { provider_id: provider, title: provider, kind: "plugin", ...(projectId ? { project_id: projectId } : {}) },
  availability: available ? { available: true } : { available: false, code: "actions.plugin_disabled", reason: "停用了" },
});
const projectOverview = (id: string) => defineRunsOverviewAction(`${id}.runs.overview`, 1, id, [], "project");
const projectDecision = (id: string) => defineRunDecisionAction(`${id}.runs.decide`, 1, id, [], "project");
const homeOverview = defineRunsOverviewAction("assistant.runs.overview", 1, "助理", [], "home");
const homeDecision = defineRunDecisionAction("assistant.runs.decide", 1, "助理", [], "home");
const run = (id: string, due: string, needs: Array<"network" | "model"> = [], project: string | null = null) =>
  ({ run_id: id, title: id, due_at: due, project_id: project, open: null, needs });

function harness(answers: Record<string, (input: unknown) => unknown>, options: { online?: boolean; model?: boolean; seen?: Record<string, string> } = {}) {
  const calls: string[] = [];
  const projects = [reference("p1"), reference("p2")];
  const projectViews = (projectId: string) => [view(projectOverview("schedule"), "schedule", projectId), view(projectDecision("schedule"), "schedule", projectId),
    view(projectOverview("feed"), "feed", projectId), view(projectDecision("feed"), "feed", projectId)];
  const answer = (key: string, input: unknown) => { calls.push(key); const respond = answers[key]; if (!respond) throw new ActionError("actions.not_found", "没有"); return respond(input); };
  const aggregate: HomeAggregatePorts = {
    openProjects: () => projects, whileOpen: async (_reference, work) => work(),
    client: project => ({ discover: async () => projectViews(project.project_id),
      invoke: async (_caller, action, input) => answer(`${project.project_id}:${action.capability_id}`, input) }),
    context: async project => context(project.project_id), projectPlugins: async () => () => true,
  };
  const homeViews = [view(homeOverview, "assistant", null), view(homeDecision, "assistant", null)];
  const client = (scope: string | null): RunsClient => ({
    discover: async () => scope === null ? homeViews : projectViews(scope),
    invoke: async (action, input) => answer(`${scope ?? "home"}:${action.capability_id}`, input),
  });
  const ports: RuntimeOverviewPorts = {
    aggregate, within: async (scope, work) => scope === null || projects.some(project => project.project_id === scope) ? work(client(scope)) : undefined,
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

test("RES-05 every owner found by type is asked once and the answers are put side by side, sorted, each with where it came from", async () => {
  const { ports, calls } = harness({
    "p1:schedule.runs.overview": overview("schedule", [run("t2", "2026-11-11T12:00:00.000Z", ["model"], "elsewhere")], [{ ...run("t0", "2026-11-11T06:00:00.000Z"), missed_at: NOW }]),
    "p2:schedule.runs.overview": overview("schedule", []),
    "p1:feed.runs.overview": overview("feed", [run("pull", "2026-11-11T10:00:00.000Z", ["network"])]),
    "p2:feed.runs.overview": overview("feed", []),
    "home:assistant.runs.overview": overview("assistant", [run("fu", "2026-11-11T11:00:00.000Z", ["model"])], [{ ...run("fu-old", "2026-11-11T08:00:00.000Z"), missed_at: NOW }]),
  });
  const result = await runtimeOverview(ports);
  assert.equal(result.state, "running");
  assert.deepEqual(calls.sort(), ["home:assistant.runs.overview", "p1:feed.runs.overview", "p1:schedule.runs.overview", "p2:feed.runs.overview", "p2:schedule.runs.overview"],
    "each owner once, never the decision actions");
  assert.deepEqual(result.upcoming.map(row => [row.run_id, row.project_id, row.source.scope_project_id, row.source.provider_id]), [
    ["pull", "p1", "p1", "feed"], ["fu", null, null, "assistant"], ["t2", "p1", "p1", "schedule"]], "by time; a project owner's run is that project's whatever it says");
  assert.deepEqual(result.missed.map(row => [row.run_id, row.source.surface]), [["fu-old", "assistant"], ["t0", "schedule"]], "latest first");
  assert.deepEqual(result.gaps.map(gap => gap.cause), ["sleep"]);
  assert.deepEqual(result.unavailable_sources, []);
});

test("RES-05 one owner that fails, times out or answers what cannot be drawn is named by its code; the others are listed as usual", async () => {
  const { ports } = harness({
    "p1:schedule.runs.overview": () => { throw new ActionError("schedule.unreadable", "PRIVATE owner words"); },
    "p2:schedule.runs.overview": () => new Promise(() => undefined),
    "p1:feed.runs.overview": () => ({ source: { surface: "bad surface!", title: "x" }, upcoming: [], missed: [], expired: 0 }),
    "p2:feed.runs.overview": overview("feed", [run("pull", "2026-11-11T10:00:00.000Z", ["network"])]),
    "home:assistant.runs.overview": overview("assistant", [run("fu", "2026-11-11T11:00:00.000Z", ["model"])]),
  }, { online: false });
  const result = await runtimeOverview(ports);
  assert.deepEqual(result.upcoming.map(row => [row.run_id, row.waiting]), [["pull", true], ["fu", false]], "without a network the pull waits; the model one does not");
  assert.deepEqual(result.waiting, { network: true, model: false });
  assert.deepEqual(result.unavailable_sources.map(issue => [issue.project_id, issue.provider_id, issue.code]).sort(), [
    ["p1", "feed", "actions.output_invalid"], ["p1", "schedule", "schedule.unreadable"], ["p2", "schedule", "actions.timeout"]]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/u, "what an owner said in its error stays out");
});

test("RES-05 现在做 and 跳过 go to the decision action of the same provider in the same place; an owner no longer there is gone", async () => {
  const decided: unknown[] = [];
  const { ports } = harness({
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

test("BL-missed-runs-never-expire the runs expired and not yet told are counted together and by owner, each owner asked from its own mark", async () => {
  const asked: Record<string, string | null> = {};
  const counting = (key: string, source: string, title: string, expired: number) => (input: unknown) => {
    asked[key] = (input as RunsWindow).expired_after; return overview(source, [], [], expired, title)(input);
  };
  const answers = {
    "p1:schedule.runs.overview": counting("p1:schedule", "schedule", "定时任务", 2), "p2:schedule.runs.overview": counting("p2:schedule", "schedule", "定时任务", 1),
    "p1:feed.runs.overview": counting("p1:feed", "feed", "Feed 来源", 1), "p2:feed.runs.overview": counting("p2:feed", "feed", "Feed 来源", 0),
    "home:assistant.runs.overview": counting("home:assistant", "assistant", "助理定时", 0),
  };
  const told = "2026-11-10T09:00:00.000Z", earlier = "2026-11-08T09:00:00.000Z";
  const result = await runtimeOverview(harness(answers, { seen: { [expiredOwnerKey("p1", "schedule")]: told, [expiredOwnerKey("p2", "feed")]: earlier,
    [expiredOwnerKey(null, "assistant")]: told } }).ports);
  assert.deepEqual(asked, { "p1:schedule": told, "p2:schedule": null, "p1:feed": null, "p2:feed": earlier, "home:assistant": told },
    "each owner counts only what it has not been told about: its own mark, or none");
  assert.deepEqual(result.expired, { count: 4, through: NOW, sources: [{ title: "定时任务", count: 3 }, { title: "Feed 来源", count: 1 }],
    owners: [expiredOwnerKey("p1", "schedule"), expiredOwnerKey("p2", "schedule"), expiredOwnerKey("p1", "feed"), expiredOwnerKey("p2", "feed"), expiredOwnerKey(null, "assistant")].sort() },
    "one count across projects, by owner, the moment it was made, and the owners that answered");
  const failing = await runtimeOverview(harness({ ...answers, "p1:feed.runs.overview": () => ({ source: { surface: "feed", title: "Feed" }, upcoming: [], missed: [] }) }).ports);
  assert.deepEqual(failing.unavailable_sources, [{ project_id: "p1", provider_id: "feed", code: "actions.output_invalid" }], "an owner that does not say how many expired is not drawn");
  assert.ok(!failing.expired.owners.includes(expiredOwnerKey("p1", "feed")), "and is not among the owners told: its mark stays where it was");
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
      "INSERT INTO schedule_missed_runs (project_id, run_id, kind, ref, title, due_at, missed_at) VALUES (?, ?, 'reminder', ?, ?, ?, ?)",
    ).run(project.project_id, `reminder:r1:${dueAt}`, "r1", "过期提醒", dueAt, missedAt);
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
