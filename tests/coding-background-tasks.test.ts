import type { BackgroundTasksReadResult, HomeBackgroundTaskRow, HomeBackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { homeBackgroundTaskOf, LOCALE_COOKIE, LocalProjectDatabase, REPORTED_ENDED_SHOWN_MS } from "@molis-ai/molis-work-app-local-host";
import { BACKGROUND_TASKS_OUTPUT_TYPE, LOCAL_PERSON_ACTOR_ID, PERSONAL_SPACE_PROJECT_ID, type ActionClient, type BackgroundTaskCollection } from "@molis-ai/molis-work-contracts/platform/actions";
import type { OverviewIndexRow, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import * as codingPackage from "@molis-ai/molis-work-plugin-coding";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { checkOverviewRow, isProjectReadQuery } from "@molis-ai/molis-work-plugin-sdk";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { startProjectPlugins } from "./fixtures/plugin-callers.js";
import { openTestHome } from "./fixtures/test-home.js";

/*
 * PG-043 (C4), V17 (batch 108): the title bar's list of background work is read from the overview, where each plugin writes a
 * `background_task` row with the business write it sums up; the Host reads no plugin's tables and opens no project for it. Coding writes
 * its sessions' rows from its own store (W5-01-CODING-32, 33, 34); a command it left running is stopped from the project's own panel by
 * Coding's own action, bound to the route the session already had (35); the Home and the page know no plugin, and a row carries no
 * command (36, 37, 38); reading writes nothing (39); every state word has its English (50).
 */

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

test("WLHR-01: Coding reports pending IDs for its bound Agent session; the workbench gets the original review from the Host", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Coding reviews", ["coding"]);
  await startProjectPlugins(home.host, project.reference);
  const { project_id, database_path } = project, sessionId = "coding-session", runtimeSessionId = "runtime-session";
  const store = new LocalProjectDatabase(database_path), sessions = codingSessions(store, { home: home.home, project_id }), at = new Date().toISOString();
  try {
    await sessions.create(noEffect, { project_id, session_id: sessionId, title: "Revise the quote", runtime_id: "prologue", at });
    await sessions.setRuntimeSession(noEffect, project_id, sessionId, runtimeSessionId, at);
    await sessions.setState(noEffect, project_id, sessionId, "waiting-approval", at);
  } finally { store.close(); }
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user" as const, project_id, permissions: ["artifact:read"] };
  const client: ActionClient = home.host.actionClient(project.reference);
  const view = (await client.discover(caller)).find(action => action.capability_id === "coding.background.tasks");
  assert.ok(view?.provider.plugin_id && view.provider.plugin_install_id);
  const agents = home.host.ensureAgentService(home.home, () => { throw new Error("The served Home owns the Agent service"); });
  await agents.ready;
  const queue: AgentReviewQueue = agents.agentHost.reviews;
  const owner = { kind: "agent-review" as const, project_id, plugin_id: view.provider.plugin_id, install_id: view.provider.plugin_install_id };
  for (const [id, session_id, install_id] of [["edit-quote", runtimeSessionId, owner.install_id], ["edit-other", "other-session", owner.install_id], ["edit-old", runtimeSessionId, "other-install"]]) {
    queue.request({ review_id: id, reference: { owner: { ...owner, install_id }, id, version: "proposal-1" }, project_id, plugin_id: owner.plugin_id,
      kind: "text-edit", run: { session_id, run_id: "test-run" }, requested_at: at, expires_at: null,
      document: { kind: "text-edit", target_path: id + ".md", exists: true, before_text: "Before", after_text: "New quote" } });
    queue.registerDecisionHandler(id, async (_input, commit) => await commit());
  }
  const raw = await client.invoke(caller, { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, {}) as BackgroundTaskCollection;
  const task = raw.tasks.find(one => one.subject.id === sessionId);
  assert.deepEqual(task?.held_reviews, { session_id: runtimeSessionId, ids: ["edit-quote"] });
  assert.deepEqual(task?.decisions, []);
  assert.doesNotMatch(JSON.stringify(task), /New quote|edit-quote\.md/);
  const table = await home.web.post<BackgroundTasksReadResult>(`/projects/${project_id}/api/mainline/tasks`, {});
  const row = table.tasks.find(one => one.subject.id === sessionId);
  assert.deepEqual(row?.decisions.map(decision => decision.id), ["edit-quote"]);
  assert.match(JSON.stringify(row?.decisions), /New quote/);
  const overview = await home.web.get<{ background_tasks: HomeBackgroundTasksReadResult }>("/api/attention");
  const summary = overview.background_tasks.tasks.find(one => one.subject.id === sessionId);
  assert.ok(summary, "the session still appears in the Home summary");
  assert.doesNotMatch(JSON.stringify(summary), /held_reviews|edit-quote|New quote/);
  // The overview row is the session's state alone: no review, no proposal, no command.
  const reread = new LocalProjectDatabase(database_path);
  const kept = JSON.stringify(reread.db.prepare("SELECT * FROM plugin_overview_rows").all());
  reread.close();
  assert.match(kept, /Revise the quote/);
  assert.doesNotMatch(kept, /held_reviews|edit-quote|New quote|coding\.background\.stop/);
  // A session waiting on the person keeps no round going: the project sleeps, and the Home still lists it from the overview without opening it.
  assert.equal(await home.host.sleepIfIdle(project.reference, 0), true);
  const asleep = await home.web.get<{ background_tasks: HomeBackgroundTasksReadResult }>("/api/attention");
  assert.ok(asleep.background_tasks.tasks.some(one => one.subject.id === sessionId), "listed while the project sleeps");
  assert.ok(!home.host.status().projects.some((one: { project_id: string }) => one.project_id === project_id), "reading the list did not open the project");
});

test("W5-01-CODING-32 UPP-37 Coding declares its background tasks as a read-only project query and its overview rows as `background_task`; its reader and the Host's old one are gone", () => {
  const declared = codingManifest.actions?.find(action => action.capability_id === "coding.background.tasks");
  assert.ok(declared, "Coding's Manifest declares the query");
  assert.equal(declared.version, 1);
  assert.equal(declared.operation, "query");
  assert.equal(declared.action.scope, "project");
  assert.ok(!("home_aggregate" in declared.action), "the Home no longer asks it across projects");
  assert.equal(declared.action.output_type, BACKGROUND_TASKS_OUTPUT_TYPE);
  assert.ok(isProjectReadQuery(declared), "it passes the rule the project's panel checks again before each call (S-49)");
  assert.deepEqual(codingManifest.overview_projection?.kinds, ["background_task"], "its sessions reach the Home as overview rows");
  assert.ok(declared.action.permissions.every(permission => permission === "artifact:read"), "it asks for nothing beyond reading");
  assert.ok(!declared.action.permissions.includes("model:invoke"));
  // The Host no longer opens Coding's tables for the Home: the reader is not part of what the package gives out.
  for (const name of ["listCodingBackgroundSessions", "holdsCodingSessions", "CodingSqliteDatabase"]) assert.ok(!(name in codingPackage), `${name} is no longer exported`);
  for (const file of ["web-catalog.ts", "web-catalog-routes.ts", "web-catalog-settings.ts"]) assert.doesNotMatch(source(`apps/local-host/src/${file}`), /listCodingBackgroundSessions|holdsCodingSessions|codingBackgroundTasks|coding-background-tasks/, file);
});

test("W5-01-CODING-33 UPP-37 the Home lists the Coding sessions under way or waiting in every partition, newest first, from the overview rows Coding writes; the stop route (CODING-35) stays in the project and the English (CODING-50) follows", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const alpha = await home.createProject("Alpha", ["coding"]), beta = await home.createProject("Beta", ["coding"]), unopened = await home.createProject("Unopened", ["coding"]);
  const without = await home.createProject("Without Coding");
  for (const project of [alpha, beta, without]) await startProjectPlugins(home.host, project.reference);
  const later = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
  const seed = async (project: { project_id: string; database_path: string }, sessions: Array<[id: string, state: string, at: string, options?: { steps?: { mine: number; subtasks: number; unowned: number }; commands?: string[] }]>) => {
    const store = new LocalProjectDatabase(project.database_path), coding = codingSessions(store, { home: home.home, project_id: project.project_id });
    try {
      for (const [id, state, at, options] of sessions) {
        await coding.create(noEffect, { project_id: project.project_id, session_id: id, title: `${id} 的任务`, runtime_id: "prologue", at });
        await coding.setState(noEffect, project.project_id, id, state as never, at);
        if (options?.steps) await coding.setSteps(noEffect, project.project_id, id, options.steps);
        if (options?.commands) await coding.setBackground(noEffect, project.project_id, id, options.commands.map((task_id, index) => ({ task_id, summary: `命令 ${task_id}`, started_at_ms: index + 1 })));
      }
    } finally { store.close(); }
  };
  await seed(alpha, [
    ["a1", "running", later(10), { steps: { mine: 0, subtasks: 2, unowned: 0 } }],
    ["a2", "done", later(30)],
    ["a3", "waiting-approval", later(11)],
    // The round ended, but the person holds one of its open steps: it waits on them. One with only a subtask's step does not.
    ["a4", "done", later(20), { steps: { mine: 1, subtasks: 0, unowned: 0 } }],
    ["a5", "done", later(25), { steps: { mine: 0, subtasks: 1, unowned: 1 } }],
    ["a6", "paused", later(12)],
    ["a7", "waiting-answer", later(13), { steps: { mine: 0, subtasks: 0, unowned: 3 } }],
    ["a8", "queued", later(14)],
    // Over, but a command it started is still running.
    ["a9", "done", later(15), { commands: ["t9"] }],
  ]);
  await seed(beta, [
    // Recorded as running before this Home process started: no round survives a restart, so it was cut off.
    ["b1", "running", "2020-01-01T00:00:00.000Z"], ["b2", "reconcile-required", "2019-01-01T00:00:00.000Z"], ["b3", "idle", later(60)],
    ["b4", "running", later(2), { commands: ["t1"] }],
  ]);
  await seed(unopened, [["u1", "running", later(99)]]);
  // Coding is not enabled in the fourth project, whose database holds a session (and its row) all the same: the Home does not read its rows there.
  await seed(without, [["w1", "running", later(98)]]);
  assert.ok(!home.host.status().projects.some((project: { project_id: string }) => project.project_id === unopened.project_id), "the Home never opened the third project");

  const rows = (await home.web.get<{ background_tasks: HomeBackgroundTasksReadResult }>("/api/attention")).background_tasks.tasks;
  assert.deepEqual(rows.map(row => [row.project_name, row.subject.id, row.state, row.waiting]), [
    ["Unopened", "u1", "running", false],
    ["Alpha", "a4", "answer", true], ["Alpha", "a9", "round-ended", false], ["Alpha", "a8", "queued", true], ["Alpha", "a7", "answer", true],
    ["Alpha", "a6", "paused", true], ["Alpha", "a3", "approval", true], ["Alpha", "a1", "running", false],
    ["Beta", "b4", "running", false], ["Beta", "b1", "interrupted", false], ["Beta", "b2", "verify", true],
  ], "a finished session with nothing left for the person is not listed; a session cut off by a restart reads as interrupted, not as running; the unopened project is listed at once");
  assert.ok(!home.host.status().projects.some((project: { project_id: string }) => project.project_id === unopened.project_id), "listing it did not open it");
  assert.ok(rows.every(row => row.origin.surface === "coding" && row.subject.kind === codingManifest.plugin_id && row.scope === "project" && row.executor.kind === "plugin"));
  assert.ok(rows.every(row => row.serves.length === 1 && row.serves[0]!.id === row.subject.id && row.open?.kind === "item" && row.open.surface === "coding" && row.open.id === row.subject.id));
  assert.ok(rows.every(row => row.commands.length === 0 && row.decisions.length === 0), "a row carries no command and no decision: they are read in the project");
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, "each row has its own id");
  assert.equal(rows[1]!.title, "a4 的任务");
  const said = (list: HomeBackgroundTaskRow[]) => Object.fromEntries(list.map(row => [row.subject.id, row.step?.text]));
  assert.deepEqual(said(rows), { u1: "进行中", a4: "等你处理", a9: "已完成", a8: "等待中", a7: "等你处理", a6: "已暂停", a3: "等你处理", a1: "进行中", b4: "进行中", b1: "已中断", b2: "需要核对" });
  assert.equal(rows.filter(row => row.waiting).length, 6, "the button counts the sessions that wait on the person");

  // W5-01-CODING-35: a command a session left running is stopped from the project's own panel by Coding's own action, with the session
  // and the command as its input; the action is bound to the route the session's panel already used.
  const stopRoute = codingManifest.routes?.find(route => route.route_id === "coding.background-stop");
  assert.deepEqual([stopRoute?.method, stopRoute?.path], ["POST", "/sessions/:sessionId/background/:taskId/stop"]);
  const stopAction = codingManifest.actions?.find(action => action.capability_id === "coding.background.stop");
  assert.deepEqual([stopAction?.version, stopAction?.operation, stopAction?.action.audiences], [1, "command", ["user"]]);
  const panel = await home.web.post<BackgroundTasksReadResult>(`/projects/${alpha.project_id}/api/mainline/tasks`, {});
  const commands = panel.tasks.flatMap(row => row.commands.map(command => ({ row, ...command })));
  assert.deepEqual(commands.map(command => [command.role, command.action.capability_id, command.action.version, command.input, command.summary]), [
    ["stop", "coding.background.stop", 1, { session_id: "a9", task_id: "t9" }, "命令 t9"]]);
  assert.ok(commands.every(command => command.action.provider_id === command.row.source.provider_id), "the action is the answering provider's own");

  // W5-01-CODING-50: the same read in the selected language.
  const english = await fetch(home.origin + "/api/attention", { headers: { cookie: LOCALE_COOKIE + "=en", accept: "application/json" } });
  assert.equal(english.status, 200);
  const localized: HomeBackgroundTaskRow[] = (await english.json()).background_tasks.tasks;
  const unsaid = ({ step: _step, ...row }: HomeBackgroundTaskRow) => row;
  assert.deepEqual(localized.map(unsaid), rows.map(unsaid));
  assert.deepEqual(said(localized), { u1: "In progress", a4: "Needs your attention", a9: "Completed", a8: "Waiting", a7: "Needs your attention", a6: "Paused",
    a3: "Needs your attention", a1: "In progress", b4: "In progress", b1: "Interrupted", b2: "Needs a check" });
});

test("W5-01-CODING-51 stopping and starting Coding again is not a Home restart: a round recorded as running is still running, not cut off", { timeout: 90_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Reopened", ["coding"]);
  await startProjectPlugins(home.host, project.reference);
  const store = new LocalProjectDatabase(project.database_path);
  t.after(() => store.close());
  const coding = codingSessions(store, { home: home.home, project_id: project.project_id }), at = new Date().toISOString();
  await coding.create(noEffect, { project_id: project.project_id, session_id: "r1", title: "在跑的任务", runtime_id: "prologue", at });
  await coding.setState(noEffect, project.project_id, "r1", "running", at);
  // The person closes the project and opens it again: Coding stops and starts, with a new activation; the Home process does not restart.
  assert.equal(await home.host.closeProject(project.reference), true);
  await startProjectPlugins(home.host, project.reference);
  const attention = await home.web.get<{ background_tasks: HomeBackgroundTasksReadResult }>("/api/attention");
  const row = attention.background_tasks.tasks.find(item => item.subject.id === "r1");
  assert.deepEqual(row && [row.state, row.waiting, row.step, row.details], ["running", false, { text: "进行中" }, []],
    "the round goes on in the Home's agent host; only the Home process starting would cut it");
  // BL-540: the boundary comes from the platform's Home Host startup timestamp (`context.host_started_at`), never `process`.
  assert.match(source("plugins/native/coding/src/plugin.ts"), /context\.host_started_at/);
  assert.doesNotMatch(source("plugins/native/coding/src/plugin.ts"), /\bprocess\./);
});

test("W5-01-CODING-34 Coding's reader lists the sessions that are active or hold the person's open steps, tolerates a column it cannot parse, and writes nothing", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Reader", ["coding"]);
  const store = new LocalProjectDatabase(project.database_path);
  t.after(() => store.close());
  const coding = codingSessions(store), projectId = project.project_id;
  const add = async (id: string, state: string, at: string) => {
    await coding.create(noEffect, { project_id: projectId, session_id: id, title: `session ${id}`, runtime_id: "prologue", at });
    await coding.setState(noEffect, projectId, id, state as never, at);
  };
  await add("idle", "idle", "2026-10-01T10:00:00.000Z");
  await add("running", "running", "2026-10-01T11:00:00.000Z");
  await add("done-with-steps", "done", "2026-10-01T12:00:00.000Z");
  await add("done-subtask-only", "done", "2026-10-01T12:30:00.000Z");
  await add("archived", "running", "2026-10-01T13:00:00.000Z");
  await add("bad-json", "queued", "2026-10-01T14:00:00.000Z");
  await coding.setSteps(noEffect, projectId, "done-with-steps", { mine: 2, subtasks: 0, unowned: 0 });
  await coding.setSteps(noEffect, projectId, "done-subtask-only", { mine: 0, subtasks: 3, unowned: 0 });
  await coding.setBackground(noEffect, projectId, "running", [{ task_id: "t1", summary: "dev server", started_at_ms: 1 }]);
  await coding.archive(noEffect, projectId, "archived", "2026-10-01T13:30:00.000Z");
  store.db.prepare("UPDATE coding_sessions SET steps_json = 'not json', background_json = '{' WHERE session_id = 'bad-json'").run();
  const everything = () => JSON.stringify(store.db.prepare("SELECT * FROM coding_sessions ORDER BY session_id").all());
  const before = everything();

  const sessions = coding.backgroundSessions();
  assert.deepEqual(sessions.map(session => [session.session_id, session.state, session.active]), [
    ["bad-json", "queued", true],
    ["done-with-steps", "done", false],
    ["running", "running", true],
  ], "newest first; an idle session, an archived one and one whose only open steps belong to subtasks are not listed");
  assert.deepEqual(sessions[1]!.steps, { mine: 2, subtasks: 0, unowned: 0 });
  assert.deepEqual(sessions[2]!.commands, [{ task_id: "t1", summary: "dev server", started_at_ms: 1 }]);
  assert.equal(sessions[0]!.steps, undefined, "a step record that does not parse is absent, not a guess");
  assert.equal(sessions[0]!.commands, undefined);
  assert.ok(codingPackage.CODING_ACTIVE_STATES.includes("running") && !(codingPackage.CODING_ACTIVE_STATES as readonly string[]).includes("done"));
  assert.equal(everything(), before, "reading the list changed no row");
});

const CODING = codingManifest as PluginManifest;
const PROJECT = { project_id: "p-1", display_name: "P" };
const indexRow = (fields: Record<string, unknown>, extra: Partial<OverviewIndexRow> = {}): OverviewIndexRow => ({ partition_id: "p-1", install_id: "install-1", plugin_id: CODING.plugin_id,
  kind: "background_task", row_id: "j", fields: { title: "任务", state: "running", waiting: false, updated_at: "2026-10-01T10:00:00.000Z", ...fields } as OverviewIndexRow["fields"], ...extra });

test("W5-01-CODING-36 UPP-37 the Home lists any plugin's `background_task` rows as they were written: its own surface and name, the partition's scope, no command", () => {
  const row = homeBackgroundTaskOf(indexRow({ open: { surface: "example", id: "job-1" }, started_at: "2026-10-01T09:00:00.000Z" }, { row_id: "job-1" }), CODING, PROJECT, undefined, Date.parse("2026-10-01T10:01:00.000Z"));
  assert.deepEqual(row && [row.id, row.subject, row.serves, row.origin.surface, row.executor, row.scope, row.open, row.started_at, row.commands, row.decisions, row.project_id, row.project_name], [
    "install-1:job-1", { kind: CODING.plugin_id, id: "job-1" }, [{ kind: CODING.plugin_id, id: "job-1" }], "example", { kind: "plugin", label: CODING.name }, "project",
    { kind: "item", surface: "example", id: "job-1", title: "任务", label: "任务" }, "2026-10-01T09:00:00.000Z", [], [], "p-1", "P"]);
  const personal = homeBackgroundTaskOf(indexRow({}), CODING, { project_id: PERSONAL_SPACE_PROJECT_ID, display_name: "个人空间" }, undefined, Date.now());
  assert.equal(personal?.scope, "personal", "a row of the personal space is the person's own");
  assert.equal(homeBackgroundTaskOf(indexRow({}), CODING, PROJECT, undefined, Date.now())?.open, null, "a row without a place to open opens nothing");
});

test("W5-01-CODING-37, WLN-34, PWA-155 a row that is not well formed is never written, and the Home lists only what is under way or waits: ended rows go, a reported ending a short while", () => {
  // The SDK's check, run where a plugin writes a row and again where the index reads it back.
  for (const bad of [{ state: "made-up" }, { state: "" }, { waiting: "yes" }, { title: 7 }, { reports_to: "someone" }, { open: { surface: "../x", id: "1" } }, { updated_at: "yesterday" }]) {
    assert.ok("problem" in checkOverviewRow("background_task", { row_id: "j", title: "任务", state: "running", waiting: false, updated_at: "2026-10-01T10:00:00.000Z", ...bad }), JSON.stringify(bad));
  }
  const now = Date.parse("2026-10-01T10:00:00.000Z");
  const listed = (fields: Record<string, unknown>, startedAt?: string) => homeBackgroundTaskOf(indexRow(fields), CODING, PROJECT, startedAt, now)?.state ?? null;
  assert.deepEqual(["done", "saved", "partial", "failed", "running"].map(state => listed({ state })), [null, null, null, "failed", "running"],
    "ended rows (done, saved, partial) are left out; a failed one still waits for the person");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  assert.equal(listed({ state: "failed", reports_to: "assistant", updated_at: ago(60_000) }), "failed", "a reported ending stays a short while");
  assert.equal(listed({ state: "failed", reports_to: "assistant", updated_at: ago(REPORTED_ENDED_SHOWN_MS + 1) }), null, "and then goes");
  // A row under way that was written before this Host started was cut off by the restart.
  assert.equal(listed({ state: "running", updated_at: ago(1) }, new Date(now).toISOString()), "interrupted");
  assert.equal(listed({ state: "queued", updated_at: ago(1) }, new Date(now).toISOString()), "queued", "a queued one had not started, so was not cut off");
});

test("W5-01-CODING-38 the Home and the page name no plugin: the sources that read and draw the list never say Coding", () => {
  for (const path of ["apps/workbench/src/scripts/client/attention.ts", "apps/local-host/src/home-overview.ts"]) {
    assert.doesNotMatch(source(path), /coding/i, `${path} names a plugin`);
  }
});

test("W5-01-CODING-39 UPP-07 reading the list writes nothing in a project and opens none", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Quiet", ["coding"]);
  const store = new LocalProjectDatabase(project.database_path);
  t.after(() => store.close());
  const projectId = project.project_id, coding = codingSessions(store, { home: home.home, project_id: projectId });
  await coding.create(noEffect, { project_id: projectId, session_id: "q1", title: "q", runtime_id: "prologue", at: "2020-01-01T00:00:00.000Z" });
  await coding.setState(noEffect, projectId, "q1", "queued", "2020-01-01T00:00:00.000Z");
  const snapshot = () => JSON.stringify({ sessions: store.db.prepare("SELECT * FROM coding_sessions ORDER BY session_id").all(),
    rows: store.db.prepare("SELECT * FROM plugin_overview_rows ORDER BY row_id").all(),
    objects: store.db.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all(), journal: store.db.prepare("SELECT count(*) AS n FROM events").get() });
  const before = snapshot();
  const attention = await home.web.get<{ background_tasks: HomeBackgroundTasksReadResult }>("/api/attention");
  assert.deepEqual(attention.background_tasks.tasks.map(row => row.subject.id), ["q1"]);
  assert.equal(snapshot(), before, "the project's database is as it was");
  assert.ok(!home.host.status().projects.some((one: { project_id: string }) => one.project_id === projectId), "the project was not opened to be read");
});
