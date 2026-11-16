import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MAINLINE_CONTROL_PERMISSION, MAINLINE_PROVIDER_ID, MAINLINE_READ_PERMISSION, mainlineActions, type BackgroundTaskRow } from "@molis-ai/molis-work-contracts/services/mainline";
import { backgroundPlugin, backgroundRig } from "./fixtures/home-background-plugin.js";

/*
 * The mainline service's task table (specs/work-line §6, WLN-39): `background.tasks.read@1` lists what every task provider of the
 * caller's project says, through the caller's own client; `background.tasks.command@1` runs a row's command only after asking the
 * provider again, and only the person may ask. The fixture plugin stands for an installed plugin the Host has never heard of.
 */

const SOURCE = { surface: "example", title: "示例", icon: "list" };
const stopCommand = (job: string) => ({ role: "stop", action: { capability_id: "homebg.stop", version: 1 }, input: { job }, summary: `停止 ${job}` });
const task = (id: string, extra: Record<string, unknown> = {}, commands: unknown[] = [stopCommand(id)]) => ({ subject: { kind: "homebg_task", id }, title: `任务 ${id}`, state: "running", details: [], waiting: false,
  updated_at: "2026-11-14T08:00:00.000Z", executor: { kind: "plugin", label: "示例" }, serves: [], scope: "project", commands, decisions: [], open: null, ...extra });
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
const person = (projectId: string, permissions: readonly string[] = [MAINLINE_READ_PERMISSION, MAINLINE_CONTROL_PERMISSION, "homebg:read"], change: Partial<ActionCallContext> = {}): ActionCallContext =>
  ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectId, permissions: [...permissions], ...change });

test("WLN-39 background.tasks.read lists the project's task providers through the caller's own client: rows keep their provider, a provider off in the project says nothing, one that cannot answer is an issue by its code, and what the caller may not read is not asked", { timeout: 60_000 }, async t => {
  const plugin = backgroundPlugin(project => ({ source: SOURCE, tasks: [task(`job-${project}`, { step: { text: "跑了 3 项" }, serves: [{ kind: "note", id: "n1" }] }), task("late", { updated_at: "2026-11-14T09:00:00.000Z" }, [])] }));
  const rig = await backgroundRig(t, plugin, ["A", "Off"], { off: ["Off"] });
  const a = rig.project("A"), client = rig.host.actionClient(a);
  const read = await client.invoke(person(a.project_id), mainlineActions.tasks, {});
  assert.deepEqual(read.issues, []);
  assert.deepEqual(read.tasks.map(row => row.subject.id), ["late", `job-${a.project_id}`], "newest first");
  const row = read.tasks[1]!;
  assert.equal(row.source.capability_id, "homebg.tasks"); assert.deepEqual(row.origin, SOURCE);
  assert.deepEqual(row.serves, [{ kind: "note", id: "n1" }]); assert.deepEqual(row.step, { text: "跑了 3 项" });
  assert.deepEqual(row.commands.map(command => command.action), [{ capability_id: "homebg.stop", version: 1, provider_id: row.source.provider_id }], "a command is pinned to the provider that answered");
  assert.deepEqual(plugin.state.calls.at(-1), { project: a.project_id, query_only: true }, "the provider is asked read-only, in the caller's project");

  // Off in the project: nothing to report, and not an issue.
  const off = rig.project("Off"), before = plugin.state.calls.length;
  assert.deepEqual(await rig.host.actionClient(off).invoke(person(off.project_id), mainlineActions.tasks, {}), { tasks: [], issues: [] });
  assert.equal(plugin.state.calls.length, before, "a provider that is off is not called");

  // A provider that fails is an issue by its code; what it says in its error stays out.
  plugin.state.answer = () => { throw new ActionError("homebg.broken", "secret detail the provider wrote"); };
  const failed = await client.invoke(person(a.project_id), mainlineActions.tasks, {});
  assert.deepEqual(failed.tasks, []);
  assert.deepEqual(failed.issues.map(issue => [issue.source.capability_id, issue.code]), [["homebg.tasks", "homebg.broken"]]);
  assert.doesNotMatch(JSON.stringify(failed), /secret detail/);
  plugin.state.answer = () => ({ tasks: "none" });
  assert.deepEqual((await client.invoke(person(a.project_id), mainlineActions.tasks, {})).issues.map(issue => issue.code), ["actions.output_invalid"]);

  // The refusal: a caller without the provider's permission gets none of its rows, and the provider is not called for it.
  plugin.state.answer = project => ({ source: SOURCE, tasks: [task(`job-${project}`)] });
  const asked = plugin.state.calls.length;
  const narrow = await client.invoke(person(a.project_id, [MAINLINE_READ_PERMISSION]), mainlineActions.tasks, {});
  assert.deepEqual(narrow.tasks, []);
  assert.equal(plugin.state.calls.length, asked, "the provider was not asked on behalf of a caller that may not read it");
  await assert.rejects(client.invoke(person(a.project_id, ["homebg:read"]), mainlineActions.tasks, {}), code("actions.forbidden"), "the read itself needs its own permission");
});

// PWA-138: a command asks the owner again and runs only what the task still offers.
test("WLN-39, WLN-34 background.tasks.command asks the provider again and runs only what the task still offers, as the person: a changed, invented or foreign command is refused and nothing is called; only the person may ask", { timeout: 60_000 }, async t => {
  const plugin = backgroundPlugin(() => ({ source: SOURCE, tasks: [task("j1"), task("j2", {}, [])] }));
  const rig = await backgroundRig(t, plugin, ["A"]);
  const a = rig.project("A"), client = rig.host.actionClient(a), me = person(a.project_id);
  const rows = (await client.invoke(me, mainlineActions.tasks, {})).tasks;
  const j1 = rows.find(row => row.subject.id === "j1")!, j2 = rows.find(row => row.subject.id === "j2")!;
  const request = (row: BackgroundTaskRow, command = row.commands[0]!) => ({ source: row.source, subject: row.subject, command });

  // What the row offers runs, as the provider's own action with the provider's own input.
  assert.deepEqual(await client.invoke(me, mainlineActions.command, request(j1)), { role: "stop", output: { stopped: "j1" } });
  assert.deepEqual(plugin.state.stops, [{ project: a.project_id, job: "j1" }]);

  // The refusals: each leaves the provider's action uncalled.
  const refused = async (input: unknown, expected: string, why: string) => {
    const before = plugin.state.stops.length;
    await assert.rejects(client.invoke(me, mainlineActions.command, input as never), code(expected), why);
    assert.equal(plugin.state.stops.length, before, `${why}: nothing was called`);
  };
  const own = j1.commands[0]!;
  await refused(request(j1, { ...own, input: { job: "j2" } }), "mainline.task_changed", "an input the task does not offer");
  await refused(request(j2, own), "mainline.task_changed", "a command the task does not offer");
  await refused({ ...request(j1), subject: { kind: "homebg_task", id: "gone" } }, "mainline.task_changed", "a task the provider no longer lists");
  await refused(request(j1, { ...own, action: { capability_id: "projects.delete", version: 1, provider_id: "system.projects" } }), "mainline.task_changed", "another provider's action behind the row");
  await refused({ ...request(j1), source: { capability_id: "homebg.stop", version: 1, provider_id: j1.source.provider_id } }, "mainline.source_changed", "a source that is not a task provider");
  await refused({ ...request(j1), source: { ...j1.source, provider_id: MAINLINE_PROVIDER_ID } }, "mainline.source_changed", "a source no provider answers");
  // The task changed between the read and the press: the command the page still shows is not run.
  plugin.state.answer = () => ({ source: SOURCE, tasks: [task("j1", {}, [])] });
  await refused(request(j1), "mainline.task_changed", "a task that stopped offering the command");
  plugin.state.answer = () => ({ source: SOURCE, tasks: [task("j1")] });

  // Only the person: an agent, a workflow or an MCP client cannot press the button.
  for (const audience of ["agent", "workflow", "mcp"] as const) {
    const before = plugin.state.stops.length;
    await assert.rejects(client.invoke(person(a.project_id, undefined, { audience }), mainlineActions.command, request(j1)), code("actions.forbidden"), audience);
    assert.equal(plugin.state.stops.length, before);
  }
  // A caller that cannot read the provider does not find it, so it cannot command it either.
  const before = plugin.state.stops.length;
  await assert.rejects(client.invoke(person(a.project_id, [MAINLINE_READ_PERMISSION, MAINLINE_CONTROL_PERMISSION]), mainlineActions.command, request(j1)), code("mainline.source_changed"), "a caller that may not read the provider cannot command it");
  assert.equal(plugin.state.stops.length, before);

  // The provider's own failure comes back as it is, with nothing retried.
  plugin.state.stop = async () => { throw new ActionError("homebg.stop_refused", "这个任务停不下来"); };
  await assert.rejects(client.invoke(me, mainlineActions.command, request(j1)), code("homebg.stop_refused"));
  assert.equal(plugin.state.stops.length, before + 1, "called once");
});

const answerTo = (job: string, role: string, verdict: string) => ({ role, action: { capability_id: "homebg.answer", version: 1 }, input: { job, verdict }, summary: `${role} ${job}` });
const decision = (job: string, id: string, extra: Record<string, unknown> = {}) => ({ id, ask: `要不要改 ${job}`, why: "会改动两处", changes: [{ label: "标题", value: "旧 → 新" }, { label: "正文", value: "加一段" }],
  answers: [answerTo(job, "approve", "yes"), answerTo(job, "revise", "no"), answerTo(job, "reject", "no")], ...extra });

test("WLN-10, PWA-135 background.tasks.decide answers exactly what the task still asks, as the person: the row lists what would change; an answer to another question, a later version, another provider's action, 「改一下」 without words or words with another answer is refused and nothing is called; only the person may answer", { timeout: 60_000 }, async t => {
  const asking = () => ({ source: SOURCE, tasks: [task("j1", { state: "approval", waiting: true, decisions: [decision("j1", "q1"), decision("j1", "q2", { answers: [answerTo("j1", "approve", "yes-2")] })] }), task("j2")] });
  const plugin = backgroundPlugin(asking);
  const rig = await backgroundRig(t, plugin, ["A"]);
  const a = rig.project("A"), client = rig.host.actionClient(a), me = person(a.project_id);
  const j1 = (await client.invoke(me, mainlineActions.tasks, {})).tasks.find(row => row.subject.id === "j1")!;
  // The row carries what is asked, why, what would change, and the answers as the provider's own actions.
  assert.deepEqual(j1.decisions.map(one => [one.id, one.ask, one.why, one.changes.length, one.answers.map(answer => answer.role)]),
    [["q1", "要不要改 j1", "会改动两处", 2, ["approve", "revise", "reject"]], ["q2", "要不要改 j1", "会改动两处", 2, ["approve"]]]);
  assert.ok(j1.decisions.every(one => one.answers.every(answer => answer.action.provider_id === j1.source.provider_id)), "an answer is the provider's own action");
  const ask = (decisionId: string, role: string, note?: string) => ({ source: j1.source, subject: j1.subject, decision: decisionId, role, ...(note === undefined ? {} : { note }) });

  // Each answer reaches its own question only, with the provider's own input; 「改一下」 carries the person's words.
  assert.deepEqual(await client.invoke(me, mainlineActions.decide, ask("q1", "approve") as never), { role: "approve", output: { answered: "yes" } });
  assert.deepEqual(await client.invoke(me, mainlineActions.decide, ask("q2", "approve") as never), { role: "approve", output: { answered: "yes-2" } });
  assert.deepEqual(await client.invoke(me, mainlineActions.decide, ask("q1", "revise", "  标题别改  ") as never), { role: "revise", output: { answered: "no" } });
  assert.deepEqual(plugin.state.answers, [{ project: a.project_id, job: "j1", verdict: "yes", audience: "user" }, { project: a.project_id, job: "j1", verdict: "yes-2", audience: "user" },
    { project: a.project_id, job: "j1", verdict: "no", note: "标题别改", audience: "user" }]);

  const refused = async (input: unknown, expected: string, why: string, caller = me) => {
    const before = plugin.state.answers.length;
    await assert.rejects(client.invoke(caller, mainlineActions.decide, input as never), code(expected), why);
    assert.equal(plugin.state.answers.length, before, `${why}: nothing was called`);
  };
  await refused(ask("q2", "reject"), "mainline.decision_changed", "an answer the question does not offer");
  await refused(ask("q3", "approve"), "mainline.decision_changed", "a question the task does not ask");
  await refused({ ...ask("q1", "approve"), subject: { kind: "homebg_task", id: "j2" } }, "mainline.decision_changed", "another task, which asks nothing");
  await refused(ask("q1", "revise"), "mainline.note_invalid", "「改一下」 without the words");
  await refused(ask("q1", "revise", "   "), "mainline.note_invalid", "「改一下」 with blank words");
  await refused(ask("q1", "approve", "顺便把别的也批了"), "mainline.note_invalid", "words with an answer that takes none");
  await refused({ ...ask("q1", "approve"), source: { ...j1.source, provider_id: MAINLINE_PROVIDER_ID } }, "mainline.source_changed", "a source no provider answers");
  // The question was answered or replaced between the read and the press: the old id reaches nothing (PWA-135).
  plugin.state.answer = () => ({ source: SOURCE, tasks: [task("j1", { state: "approval", waiting: true, decisions: [decision("j1", "q1-v2")] })] });
  await refused(ask("q1", "approve"), "mainline.decision_changed", "a question the task no longer asks at that version");
  plugin.state.answer = asking;

  // A row cannot put another provider's action, or two answers of one role, behind the buttons: such a row is not listed at all.
  plugin.state.answer = () => ({ source: SOURCE, tasks: [task("j1", { decisions: [decision("j1", "q1", { answers: [{ ...answerTo("j1", "approve", "yes"), action: { capability_id: "projects.delete", version: 1, provider_id: "system.projects" } }] })] }),
    task("j3", { decisions: [decision("j3", "q1", { answers: [answerTo("j3", "approve", "a"), answerTo("j3", "approve", "b")] })] }), task("j4", { decisions: [decision("j4", "q1"), decision("j4", "q1")] }), task("j5", { decisions: undefined })] });
  assert.deepEqual((await client.invoke(me, mainlineActions.tasks, {})).tasks.map(row => row.subject.id), [], "foreign action, repeated role, repeated id, no decision list");
  await refused(ask("q1", "approve"), "mainline.decision_changed", "a row that is not listed cannot be answered");
  plugin.state.answer = asking;

  // Only the person answers: an agent, a workflow or an MCP client cannot, and neither can a caller that may not read the provider.
  for (const audience of ["agent", "workflow", "mcp"] as const) await refused(ask("q1", "approve"), "actions.forbidden", audience, person(a.project_id, undefined, { audience }));
  await refused(ask("q1", "approve"), "mainline.source_changed", "a caller that may not read the provider", person(a.project_id, [MAINLINE_READ_PERMISSION, MAINLINE_CONTROL_PERMISSION]));
  await refused(ask("q1", "approve"), "actions.forbidden", "a caller without the control permission", person(a.project_id, [MAINLINE_READ_PERMISSION, "homebg:read"]));
});
