import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { homeAggregatePorts, homeBackgroundTasks, LOCALE_COOKIE, LocalProjectDatabase, type HomeBackgroundTaskRow } from "@molis-ai/molis-work-app-local-host";
import { BACKGROUND_TASKS_OUTPUT_TYPE } from "@molis-ai/molis-work-contracts/platform/actions";
import * as codingPackage from "@molis-ai/molis-work-plugin-coding";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { isHomeAggregateQuery } from "@molis-ai/molis-work-plugin-sdk";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { backgroundPlugin, backgroundRig } from "./fixtures/home-background-plugin.js";
import { startProjectPlugins } from "./fixtures/plugin-callers.js";
import { openTestHome } from "./fixtures/test-home.js";

/*
 * PG-043 (C4): the title bar's list of background work is gathered from the plugins that declare a `home_aggregate` query of one type,
 * not read from Coding's tables by the Host. Coding declares the query and answers it from its own store (W5-01-CODING-32, 33, 34);
 * a command it left running is stopped by Coding's own action, bound to the route the session already had (35); the Home and the
 * page know no plugin, and a row's command is only ever an action of the provider that answered (36, 37, 38); asking writes nothing and
 * a cancelled ask is not made (39); a failing project is written once (49, in tests/host-log-catches.test.ts); every sentence Coding
 * says has its English (50).
 */

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

test("W5-01-CODING-32 Coding declares its background tasks as a read-only project query the Home may gather; its reader and the Host's old one are gone", () => {
  const declared = codingManifest.actions?.find(action => action.capability_id === "coding.background.tasks");
  assert.ok(declared, "Coding's Manifest declares the query");
  assert.equal(declared.version, 1);
  assert.equal(declared.operation, "query");
  assert.equal(declared.action.scope, "project");
  assert.equal(declared.action.home_aggregate, true);
  assert.equal(declared.action.output_type, BACKGROUND_TASKS_OUTPUT_TYPE);
  assert.ok(isHomeAggregateQuery(declared), "it passes the rule the Home checks again before each call (S-49)");
  assert.ok(declared.action.permissions.every(permission => permission === "artifact:read"), "it asks for nothing beyond reading");
  assert.ok(!declared.action.permissions.includes("model:invoke"));
  // The Host no longer opens Coding's tables for the Home: the reader is not part of what the package gives out.
  for (const name of ["listCodingBackgroundSessions", "holdsCodingSessions", "CodingSqliteDatabase"]) assert.ok(!(name in codingPackage), `${name} is no longer exported`);
  for (const file of ["web-catalog.ts", "web-catalog-routes.ts", "web-catalog-settings.ts"]) assert.doesNotMatch(source(`apps/local-host/src/${file}`), /listCodingBackgroundSessions|holdsCodingSessions|codingBackgroundTasks|coding-background-tasks/, file);
});

test("W5-01-CODING-33 the Home lists the Coding sessions under way or waiting in every open project, newest first, through Coding's own query; the stop route (CODING-35) and the English (CODING-50) follow from the rows", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const alpha = await home.createProject("Alpha", ["coding"]), beta = await home.createProject("Beta", ["coding"]), unopened = await home.createProject("Unopened", ["coding"]);
  const without = await home.createProject("Without Coding");
  // The Home reads the projects that are open; the person opens one by looking at it, which starts its plugins.
  for (const project of [alpha, beta, without]) await startProjectPlugins(home.host, project.reference);
  const later = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
  const seed = async (project: { project_id: string; database_path: string }, sessions: Array<[id: string, state: string, at: string, options?: { steps?: { mine: number; subtasks: number; unowned: number }; commands?: string[] }]>) => {
    const store = new LocalProjectDatabase(project.database_path), coding = codingSessions(store);
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
    // Recorded as running before this Home process started: no round survives a restart, so it is waiting to be checked.
    ["b1", "running", "2020-01-01T00:00:00.000Z"], ["b2", "reconcile-required", "2019-01-01T00:00:00.000Z"], ["b3", "idle", later(60)],
    ["b4", "running", later(2), { commands: ["t1"] }],
  ]);
  await seed(unopened, [["u1", "running", later(99)]]);
  // Coding is not installed in the fourth project, whose database holds a session all the same: the Home does not ask it, and so does not see it.
  await seed(without, [["w1", "running", later(98)]]);
  assert.ok(!home.host.status().projects.some(project => project.project_id === unopened.project_id), "the Home never opened the third project");

  const attention = await home.web.get<{ background_tasks: HomeBackgroundTaskRow[] }>("/api/attention");
  const rows = attention.background_tasks;
  assert.deepEqual(rows.map(row => [row.project_name, row.subject.id, row.state, row.waiting]), [
    ["Alpha", "a4", "answer", true], ["Alpha", "a9", "round-ended", false], ["Alpha", "a8", "queued", true], ["Alpha", "a7", "answer", true],
    ["Alpha", "a6", "paused", true], ["Alpha", "a3", "approval", true], ["Alpha", "a1", "running", false],
    ["Beta", "b4", "running", false], ["Beta", "b1", "verify", false], ["Beta", "b2", "verify", true],
  ], "a finished session with nothing left for the person is not listed; a session cut off by a restart is shown as waiting to be checked, not as running");
  assert.ok(rows.every(row => row.origin.surface === "coding" && row.subject.kind === "coding_session" && row.scope === "project" && row.executor.kind === "plugin"));
  // A session is the event its rounds are done for, and where the row opens.
  assert.ok(rows.every(row => row.serves.length === 1 && row.serves[0]!.id === row.subject.id && row.open?.kind === "item" && row.open.surface === "coding" && row.open.id === row.subject.id));
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, "each row has its own id");
  assert.deepEqual(rows.map(row => row.project_id), [...Array(7).fill(alpha.project_id), ...Array(3).fill(beta.project_id)]);
  assert.equal(rows[0]!.title, "a4 的任务");
  const said = (list: HomeBackgroundTaskRow[]) => Object.fromEntries(list.map(row => [row.subject.id, [row.step?.text, ...row.details.map(({ text }) => text)]]));
  assert.deepEqual(said(rows), {
    a4: ["本轮已结束", "你负责 1 步"], a9: ["本轮已结束"], a8: ["挂起等待"],
    a7: ["等你回答", "没人认领 3 步"], a6: ["已暂停"], a3: ["等你审查"],
    a1: ["进行中", "2 步在子任务手上"], b4: ["进行中"], b1: ["服务重启前没有结束，打开后核对"], b2: ["需要核对"],
  });
  assert.equal(rows.filter(row => row.waiting).length, 6, "the button counts the sessions that wait on the person");

  // W5-01-CODING-35: a command a session left running is stopped by Coding's own action, with the session and the command as its
  // input; the action is bound to the route the session's panel already used.
  const stopRoute = codingManifest.routes?.find(route => route.route_id === "coding.background-stop");
  assert.deepEqual([stopRoute?.method, stopRoute?.path], ["POST", "/sessions/:sessionId/background/:taskId/stop"]);
  const stopAction = codingManifest.actions?.find(action => action.capability_id === "coding.background.stop");
  assert.deepEqual([stopAction?.version, stopAction?.operation, stopAction?.action.audiences], [1, "command", ["user"]]);
  const commands = rows.flatMap(row => row.commands.map(command => ({ row, ...command })));
  assert.deepEqual(commands.map(command => [command.role, command.action.capability_id, command.action.version, command.input, command.summary]), [
    ["stop", "coding.background.stop", 1, { session_id: "a9", task_id: "t9" }, "命令 t9"], ["stop", "coding.background.stop", 1, { session_id: "b4", task_id: "t1" }, "命令 t1"]]);
  assert.ok(commands.every(command => command.action.provider_id === command.row.source.provider_id), "the action is the answering provider's own");

  // W5-01-CODING-50: Coding answers the same read in the selected language, including the plural forms.
  const english = await fetch(home.origin + "/api/attention", { headers: { cookie: LOCALE_COOKIE + "=en", accept: "application/json" } });
  assert.equal(english.status, 200);
  const localized: HomeBackgroundTaskRow[] = (await english.json()).background_tasks;
  const unsaid = ({ step: _step, details: _details, open: _open, ...row }: HomeBackgroundTaskRow) => row;
  assert.deepEqual(localized.map(unsaid), rows.map(unsaid));
  assert.deepEqual(said(localized), {
    a4: ["The round ended", "1 step with you"], a9: ["The round ended"], a8: ["Queued"],
    a7: ["Waiting for your answer", "3 unclaimed steps"], a6: ["Paused"], a3: ["Waiting for your review"],
    a1: ["In progress", "2 steps with subtasks"], b4: ["In progress"], b1: ["This did not finish before the service restarted. Open it to check."], b2: ["Needs checking"],
  });
  assert.equal(localized[0]!.open?.label, "Open session");
});

test("W5-01-CODING-51 stopping and starting Coding again is not a Home restart: a round recorded as running is still running, not cut off", { timeout: 90_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Reopened", ["coding"]);
  await startProjectPlugins(home.host, project.reference);
  const store = new LocalProjectDatabase(project.database_path);
  t.after(() => store.close());
  const coding = codingSessions(store), at = new Date().toISOString();
  await coding.create(noEffect, { project_id: project.project_id, session_id: "r1", title: "在跑的任务", runtime_id: "prologue", at });
  await coding.setState(noEffect, project.project_id, "r1", "running", at);
  // The person closes the project and opens it again: Coding stops and starts, with a new activation; the Home process does not restart.
  assert.equal(await home.host.closeProject(project.reference), true);
  await startProjectPlugins(home.host, project.reference);
  const attention = await home.web.get<{ background_tasks: HomeBackgroundTaskRow[] }>("/api/attention");
  const row = attention.background_tasks.find(item => item.subject.id === "r1");
  assert.deepEqual(row && [row.state, row.waiting, row.step, row.details], ["running", false, { text: "进行中" }, []],
    "the round goes on in the Home's agent host; only the Home process starting would cut it");
  // The boundary the answer takes is the Home process's start, not the activation's.
  assert.match(source("plugins/native/coding/src/plugin.ts"), /new Date\(Date\.now\(\) - process\.uptime\(\) \* 1000\)\.toISOString\(\)/);
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

  const sessions = coding.backgroundSessions(projectId);
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
  assert.deepEqual(coding.backgroundSessions("another-project"), [], "only the project asked about");
  assert.equal(everything(), before, "reading the list changed no row");
});

const SOURCE = { surface: "example", title: "示例", icon: "list" };
const fixtureTask = (extra: Record<string, unknown> = {}, commands: unknown[] = []) => ({ subject: { kind: "homebg_task", id: "j" }, title: "任务", state: "running", details: [], waiting: false,
  updated_at: "2026-10-01T10:00:00.000Z", executor: { kind: "plugin", label: "示例" }, serves: [], scope: "project", commands, decisions: [], open: null, ...extra });

test("W5-01-CODING-36 the Home lists what any plugin declares for it: another plugin's tasks show on its own surface, in the projects where it is on and open, and nothing else is asked", { timeout: 60_000 }, async t => {
  const task = (project: string, updated: string) => fixtureTask({ subject: { kind: "homebg_task", id: `job-${project}` }, title: "导出", updated_at: updated, step: { text: "跑了 3 项" },
    serves: [{ kind: "note", id: "n1" }], open: { kind: "item", surface: "example", id: `job-${project}`, title: "导出", label: "打开" } },
    [{ role: "stop", action: { capability_id: "homebg.stop", version: 1 }, input: { job: "j1" }, summary: "导出到文件" }]);
  const plugin = backgroundPlugin(() => ({ source: SOURCE, tasks: [] }));
  const rig = await backgroundRig(t, plugin, ["A", "B", "Off", "Closed"], { off: ["Off"], closed: ["Closed"] });
  const a = rig.project("A").project_id, b = rig.project("B").project_id;
  plugin.state.answer = project => ({ source: SOURCE, tasks: [task(project, project === a ? "2026-10-01T10:00:00.000Z" : "2026-10-01T11:00:00.000Z")] });

  const rows = await homeBackgroundTasks(homeAggregatePorts(rig.host), rig.catalog);
  assert.deepEqual(rows.map(row => [row.project_name, row.origin, row.subject.id, row.state, row.waiting, row.step, row.serves, row.open?.id]), [
    ["B", SOURCE, `job-${b}`, "running", false, { text: "跑了 3 项" }, [{ kind: "note", id: "n1" }], `job-${b}`],
    ["A", SOURCE, `job-${a}`, "running", false, { text: "跑了 3 项" }, [{ kind: "note", id: "n1" }], `job-${a}`],
  ], "the plugin the Home has never heard of is listed, newest first; the project where it is off and the one never opened are not");
  assert.deepEqual(rows.map(row => row.commands), rows.map(row => [{ role: "stop", action: { capability_id: "homebg.stop", version: 1, provider_id: row.source.provider_id }, input: { job: "j1" }, summary: "导出到文件" }]),
    "its command is its own action, pinned to the provider the answer came from");
  assert.deepEqual(plugin.state.calls.map(call => call.project).sort(), [a, b].sort(), "one call in each open project where the plugin is on");
  assert.ok(plugin.state.calls.every(call => call.query_only), "each call is marked read-only");
});

test("W5-01-CODING-37, WLN-34 a plugin's answer is checked before the page draws it: a row that is not well formed draws nothing, and a command that is not the answering provider's own action is not offered", { timeout: 60_000 }, async t => {
  const plugin = backgroundPlugin(() => ({ source: SOURCE, tasks: [] }));
  const rig = await backgroundRig(t, plugin, ["A"]);
  const ask = async (answer: unknown) => { plugin.state.answer = () => answer; return await homeBackgroundTasks(homeAggregatePorts(rig.host), rig.catalog); };

  assert.deepEqual(await ask({ source: { ...SOURCE, surface: "../elsewhere" }, tasks: [fixtureTask()] }), [], "a surface that is not a plain name draws nothing");
  assert.deepEqual(await ask({ source: SOURCE, tasks: "none" }), [], "tasks that are not a list draw nothing");
  assert.deepEqual(await ask({ tasks: [fixtureTask()] }), []);
  const mixed = await ask({ source: SOURCE, tasks: [fixtureTask(), fixtureTask({ subject: { kind: "homebg_task", id: "" } }), fixtureTask({ subject: { kind: "someone_elses", id: "x" } }), fixtureTask({ waiting: "yes" }),
    fixtureTask({ title: 7 }), fixtureTask({ state: "" }), fixtureTask({ state: "made-up" }), fixtureTask({ details: Array(9).fill({ text: "x" }) }), fixtureTask({ details: [{ text: "x", count: 1.5 }] }), fixtureTask({ scope: "everywhere" }),
    fixtureTask({ executor: { kind: "person", label: "x" } }), fixtureTask({ serves: [{ kind: "note" }] }), fixtureTask({ open: { kind: "item", surface: "../x", id: "1", title: "t", label: "l" } }), null] });
  assert.deepEqual(mixed.map(item => item.subject.id), ["j"], "only the well-formed task of a mixed answer is kept; a kind the provider did not declare is not");

  // The refusal: a row cannot put another provider's action behind a button the person presses.
  const own = mixed[0]!.source.provider_id;
  const offered = (await ask({ source: SOURCE, tasks: [fixtureTask({}, [
    { role: "stop", action: { capability_id: "homebg.stop", version: 1 }, input: { job: "plain" }, summary: "自己的动作" },
    { role: "stop", action: { capability_id: "homebg.stop", version: 1, provider_id: own }, input: { job: "named" }, summary: "写明自己" },
    { role: "stop", action: { capability_id: "projects.delete", version: 1, provider_id: "system.projects" }, input: { project_id: "p" }, summary: "别人的动作" },
    { role: "delete", action: { capability_id: "homebg.stop", version: 1 }, input: {}, summary: "没有的角色" },
    { role: "stop", action: { capability_id: "homebg.stop" }, input: {}, summary: "没有版本" },
    { role: "stop", action: { capability_id: "homebg.stop", version: 1 }, input: "j1", summary: "输入不是对象" },
    { role: "stop", stop_path: "/jobs/j1/stop", summary: "插件自己的路径" },
  ])] }))[0]!.commands;
  assert.deepEqual(offered.map(command => [command.input.job, command.action.provider_id]), [["plain", own], ["named", own]],
    "only the answering provider's own actions are offered, each pinned to it; another provider's action, an unknown role, a missing version, a plain route and a non-object input are not");
});

test("W5-01-CODING-38 the Home and the page name no plugin: the sources that gather and draw the list never say Coding", () => {
  for (const path of ["apps/workbench/src/scripts/client/attention.ts", "apps/local-host/src/home-background-tasks.ts", "apps/local-host/src/home-aggregate.ts"]) {
    assert.doesNotMatch(source(path), /coding/i, `${path} names a plugin`);
  }
});

test("W5-01-CODING-39 asking for the list writes nothing in a project, and a cancelled ask is not made", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Quiet", ["coding"]);
  await startProjectPlugins(home.host, project.reference);
  const store = new LocalProjectDatabase(project.database_path);
  t.after(() => store.close());
  const projectId = project.project_id;
  await codingSessions(store).create(noEffect, { project_id: projectId, session_id: "q1", title: "q", runtime_id: "prologue", at: "2020-01-01T00:00:00.000Z" });
  await codingSessions(store).setState(noEffect, projectId, "q1", "running", "2020-01-01T00:00:00.000Z");
  const snapshot = () => JSON.stringify({ sessions: store.db.prepare("SELECT * FROM coding_sessions ORDER BY session_id").all(),
    objects: store.db.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all(), journal: store.db.prepare("SELECT count(*) AS n FROM events").get() });
  const before = snapshot();
  const attention = await home.web.get<{ background_tasks: HomeBackgroundTaskRow[] }>("/api/attention");
  assert.deepEqual(attention.background_tasks.map(row => row.subject.id), ["q1"]);
  assert.equal(snapshot(), before, "the project's database is as it was");

  const plugin = backgroundPlugin(() => ({ source: SOURCE, tasks: [] }));
  const rig = await backgroundRig(t, plugin, ["A", "B"]);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(homeBackgroundTasks(homeAggregatePorts(rig.host), rig.catalog, controller.signal), { name: "AbortError" });
  assert.equal(plugin.state.calls.length, 0, "no project was asked");
});
