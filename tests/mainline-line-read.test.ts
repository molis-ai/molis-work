import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MAINLINE_READ_PERMISSION, mainlineActions } from "@molis-ai/molis-work-contracts/services/mainline";
import { backgroundPlugin, backgroundRig } from "./fixtures/home-background-plugin.js";

/*
 * The line of one project (specs/work-line §5, WLN-37, WLN-38): `mainline.line.read@1` asks every event registrant of the caller's
 * project once, reads the task table in the same call, and places and orders each event. The fixture plugin stands for an installed
 * plugin the Host has never heard of: it is on the line by the same registration as the built-in ones.
 */

const SOURCE = { surface: "example", title: "示例", icon: "list" };
const WINDOW = { from: "2026-11-14T00:00:00.000Z", to: "2026-11-15T00:00:00.000Z", now: "2026-11-14T10:00:00.000Z" };
const at = (hour: number) => `2026-11-14T${String(hour).padStart(2, "0")}:00:00.000Z`;
const event = (id: string, placement: "occurred" | "active" | "today", hour: number, extra: Record<string, unknown> = {}) => ({ event_id: id, subject: { kind: "homebg_item", id }, title: `事件 ${id}`, summary: "", content: "",
  facts: [], category: "personal", placement, occurred_at: at(hour), needs_attention: false, open: null, ...extra });
const task = (id: string, serves: string[], extra: Record<string, unknown> = {}) => ({ subject: { kind: "homebg_task", id }, title: `任务 ${id}`, state: "running", details: [], waiting: false,
  updated_at: at(9), executor: { kind: "plugin", label: "示例" }, serves: serves.map(item => ({ kind: "homebg_item", id: item })), scope: "project", commands: [], decisions: [], open: null, ...extra });
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
const person = (projectId: string, permissions: readonly string[] = [MAINLINE_READ_PERMISSION, "homebg:read"], change: Partial<ActionCallContext> = {}): ActionCallContext =>
  ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectId, permissions: [...permissions], ...change });

test("WLN-37, WLN-38 mainline.line.read puts an installed plugin's events on the line by its registration: each is placed by its owner, moved beside now while a task behind it is under way or waits, and ordered within its wing", { timeout: 60_000 }, async t => {
  const plugin = backgroundPlugin(() => ({ source: SOURCE, tasks: [
    task("t-run", ["done-old"]), task("t-wait", ["due-late"], { waiting: true, state: "answer" }), task("t-ended", ["done-new"], { state: "round-ended" }), task("t-free", []), task("t-two", ["done-old"], { state: "queued" }),
  ] }));
  plugin.state.events = () => ({ source: SOURCE, events: [
    event("done-old", "occurred", 6), event("done-new", "occurred", 9, { state: "done" }), event("done-mid", "occurred", 8),
    event("active", "active", 7, { state: "doing" }),
    event("due-late", "today", 5, { scheduled_at: at(18) }), event("due-soon", "today", 9, { scheduled_at: at(12), needs_attention: true }), event("due-none", "today", 15),
  ] });
  const rig = await backgroundRig(t, plugin, ["A"]);
  const a = rig.project("A"), client = rig.host.actionClient(a);
  const line = await client.invoke(person(a.project_id), mainlineActions.line, WINDOW);
  assert.deepEqual(line.issues, []);
  assert.deepEqual(line.events.map(row => [row.event_id, row.wing, row.rank]), [
    ["done-new", "done", 0], ["done-mid", "done", 1],                    // what is done, newest nearest to now
    ["due-late", "now", 0], ["active", "now", 1], ["done-old", "now", 2], // beside now: what waits first, then the newest
    ["due-soon", "next", 0], ["due-none", "next", 1],                     // ahead: by when it starts or falls due
  ]);
  const by = (id: string) => line.events.find(row => row.event_id === id)!;
  // A task under way behind a finished event shows it in progress; a waiting one shows it waiting on the person (WLN-38).
  assert.deepEqual(by("done-old").tasks, { running: 2, waiting: 0, refs: [{ kind: "homebg_task", id: "t-run" }, { kind: "homebg_task", id: "t-two" }] });
  assert.equal(by("done-old").line_state, "running"); assert.equal(by("done-old").waiting, false);
  assert.deepEqual(by("due-late").tasks, { running: 0, waiting: 1, refs: [{ kind: "homebg_task", id: "t-wait" }] });
  assert.equal(by("due-late").line_state, "answer"); assert.equal(by("due-late").waiting, true);
  // A task that ended leaves the event where its owner put it, in its owner's state; the task is still named behind it.
  assert.deepEqual([by("done-new").wing, by("done-new").line_state, by("done-new").tasks], ["done", "done", { running: 0, waiting: 0, refs: [{ kind: "homebg_task", id: "t-ended" }] }]);
  assert.equal(by("active").line_state, "doing");
  assert.equal(by("due-none").line_state, undefined, "an event with no state and nothing behind it shows none");
  assert.equal(by("due-soon").waiting, true, "the owner's own word that it waits is kept");
  // Who registered it rides with the event; no progress of a task is copied into the line.
  assert.equal(by("active").source.capability_id, "homebg.events"); assert.deepEqual(by("active").origin, SOURCE);
  assert.doesNotMatch(JSON.stringify(line), /任务 t-run|updated_at/);
  assert.deepEqual(plugin.state.eventCalls.at(-1), { project: a.project_id, query_only: true }, "the registrant is asked read-only, in the caller's project");

  // An Agent reads the same registrants through its own client (the Assistant's read of the line). A task provider answers only the
  // person (S-49), so what is behind an event is not in an Agent's answer: every event sits where its owner put it.
  const agent = await client.invoke(person(a.project_id, undefined, { audience: "agent", actor_id: "agent:test" }), mainlineActions.line, WINDOW);
  assert.deepEqual(agent.events.map(row => row.id).sort(), line.events.map(row => row.id).sort());
  assert.deepEqual(agent.events.map(row => [row.event_id, row.wing, row.tasks.refs.length]).filter(row => row[0] === "done-old" || row[0] === "due-late"), [["done-old", "done", 0], ["due-late", "next", 0]]);
});

test("WLN-37 a registrant that is off says nothing, one that cannot answer or answers out of its declaration is an issue by its code, and the rest of the line stands; a caller that may not read a registrant does not have it asked", { timeout: 60_000 }, async t => {
  const plugin = backgroundPlugin(() => ({ source: SOURCE, tasks: [task("t1", ["e1"])] }));
  plugin.state.events = () => ({ source: SOURCE, events: [event("e1", "active", 9)] });
  const rig = await backgroundRig(t, plugin, ["A", "Off"], { off: ["Off"] });
  const a = rig.project("A"), client = rig.host.actionClient(a), me = person(a.project_id);

  const off = rig.project("Off"), before = plugin.state.eventCalls.length;
  assert.deepEqual(await rig.host.actionClient(off).invoke(person(off.project_id), mainlineActions.line, WINDOW), { events: [], issues: [] });
  assert.equal(plugin.state.eventCalls.length, before, "a registrant that is off is not called");

  const issuesOf = async () => (await client.invoke(me, mainlineActions.line, WINDOW)).issues.map(issue => [issue.source.capability_id, issue.code]);
  plugin.state.events = () => { throw new ActionError("homebg.broken", "secret detail the registrant wrote"); };
  const failed = await client.invoke(me, mainlineActions.line, WINDOW);
  assert.deepEqual(failed.events, []);
  assert.deepEqual(failed.issues.map(issue => [issue.source.capability_id, issue.code]), [["homebg.events", "homebg.broken"]]);
  assert.doesNotMatch(JSON.stringify(failed), /secret detail/, "what a registrant says in its error stays out");
  plugin.state.events = () => ({ source: SOURCE, events: [event("e1", "active", 9), event("e1", "active", 8)] });
  assert.deepEqual(await issuesOf(), [["homebg.events", "actions.event_invalid"]], "an event id said twice voids the answer");
  plugin.state.events = () => ({ source: SOURCE, events: [event("e1", "active", 9, { subject: { kind: "someone_elses", id: "x" } })] });
  assert.deepEqual(await issuesOf(), [["homebg.events", "actions.event_invalid"]], "an object kind it did not declare voids the answer");
  // The task table failing is its own issue; the events still stand.
  plugin.state.events = () => ({ source: SOURCE, events: [event("e1", "active", 9)] });
  plugin.state.answer = () => ({ tasks: "none" });
  const half = await client.invoke(me, mainlineActions.line, WINDOW);
  assert.deepEqual(half.events.map(row => [row.event_id, row.tasks.running]), [["e1", 0]]);
  assert.deepEqual(half.issues.map(issue => [issue.source.capability_id, issue.code]), [["homebg.tasks", "actions.output_invalid"]]);

  // The refusals.
  const asked = plugin.state.eventCalls.length;
  assert.deepEqual(await client.invoke(person(a.project_id, [MAINLINE_READ_PERMISSION]), mainlineActions.line, WINDOW), { events: [], issues: [] });
  assert.equal(plugin.state.eventCalls.length, asked, "the registrant was not asked on behalf of a caller that may not read it");
  await assert.rejects(client.invoke(person(a.project_id, ["homebg:read"]), mainlineActions.line, WINDOW), code("actions.forbidden"), "the read itself needs its own permission");
  await assert.rejects(client.invoke(me, mainlineActions.line, { ...WINDOW, now: "2026-11-16T00:00:00.000Z" }), code("actions.input_invalid"), "a window that does not hold its own now");
  assert.equal(plugin.state.eventCalls.length, asked);
});

test("WLN-37 the mainline service and its Host wiring name no plugin: a registrant is found by its types, a built-in one like any other", () => {
  const source = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
  for (const file of ["horizontal/mainline/src/index.ts", "apps/local-host/src/mainline-actions.ts", "apps/local-host/src/mainline-http.ts", "packages/contracts/src/services/mainline.ts"]) {
    assert.doesNotMatch(source(file), /io\.molis\.work\.|coding|todo|feed|inbox|goals|system\.assistant/i, file);
  }
});

// PWA-138: the head, the marks and the panel count from one read of the same facts.
test("WLN-39 attention.waiting.read counts what waits on the person once per object, from the same line and task table: the number at the head of the line, the marks on events and the panel's waiting rows agree", { timeout: 60_000 }, async t => {
  const plugin = backgroundPlugin(() => ({ source: SOURCE, tasks: [
    task("t-wait", ["e-task"], { waiting: true, state: "answer", updated_at: at(9) }), task("t-wait-2", ["e-task"], { waiting: true, state: "approval", updated_at: at(8) }),
    task("t-free", [], { waiting: true, state: "answer", updated_at: at(7), open: { kind: "item", surface: "example", id: "t-free", title: "任务", label: "打开" } }),
    task("t-off-line", ["not-on-the-line"], { waiting: true, state: "answer", updated_at: at(6) }), task("t-run", ["e-own"]),
  ] }));
  plugin.state.events = () => ({ source: SOURCE, events: [event("e-task", "occurred", 5), event("e-own", "today", 4, { needs_attention: true }), event("e-both", "active", 3, { needs_attention: true }), event("e-quiet", "active", 2)] });
  const rig = await backgroundRig(t, plugin, ["A"]);
  const a = rig.project("A"), client = rig.host.actionClient(a), me = person(a.project_id, [MAINLINE_READ_PERMISSION, "homebg:read"]);
  const waiting = await client.invoke(me, mainlineActions.waiting, WINDOW);
  assert.deepEqual(waiting.items.map(item => [item.subject.id, item.source, item.task?.id]), [
    ["e-task", "task", "t-wait"],        // an event with two tasks waiting behind it is one item
    ["t-free", "task", "t-free"],        // a waiting task that serves no event
    ["t-off-line", "task", "t-off-line"], // one whose event is not on this line
    ["e-own", "event", undefined], ["e-both", "event", undefined],  // events their owner says wait
  ]);
  assert.deepEqual(waiting.counts, { total: 5 });
  assert.deepEqual(waiting.items[1]!.open, { kind: "item", surface: "example", id: "t-free", title: "任务", label: "打开" });
  // The same call's line and table say the same: every waiting event of the line is in it, and every waiting row of the panel is behind one of its items.
  const line = await client.invoke(me, mainlineActions.line, WINDOW), table = await client.invoke(me, mainlineActions.tasks, {});
  assert.deepEqual(line.events.filter(row => row.waiting).map(row => row.id).sort(), waiting.items.flatMap(item => item.event_id ? [item.event_id] : []).sort());
  const covered = new Set(waiting.items.flatMap(item => [item.subject.id, ...(item.task ? [item.task.id] : [])]));
  for (const row of table.tasks.filter(task => task.waiting)) assert.ok(covered.has(row.subject.id) || row.serves.some(served => covered.has(served.id)), row.subject.id);
  // Nothing waits: an empty answer, not an error.
  plugin.state.answer = () => ({ source: SOURCE, tasks: [] }); plugin.state.events = () => ({ source: SOURCE, events: [event("e-quiet", "active", 2)] });
  assert.deepEqual(await client.invoke(me, mainlineActions.waiting, WINDOW), { items: [], counts: { total: 0 }, issues: [] });
  await assert.rejects(client.invoke(person(a.project_id, ["homebg:read"]), mainlineActions.waiting, WINDOW), code("actions.forbidden"));
});
