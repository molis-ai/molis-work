import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MAINLINE_ARRANGE_PERMISSION, MAINLINE_READ_PERMISSION, WORK_ITEM_KIND, mainlineActions, mainlineItemActions } from "@molis-ai/molis-work-contracts/services/mainline";
import { mainlineRig, notesPlugin } from "./fixtures/mainline-items-plugin.js";

// S-mainline-own-line: a mainline is one person's in one project. Whose it is and which project come from the call, never from its input;
// another person's or another project's item is not found, and nothing about it is changed or named back. An object goes into an item,
// becomes one or is made for one only after the caller has read it, or its source has made it, as the caller; a source's next step may
// start only that source's own action.

const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
const person = (projectId: string, change: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectId,
  permissions: [MAINLINE_READ_PERMISSION, MAINLINE_ARRANGE_PERMISSION, "notes:read", "notes:write"], ...change });
const WINDOW = { from: "2026-11-14T00:00:00.000Z", to: "2026-11-21T00:00:00.000Z", now: "2026-11-15T10:00:00.000Z" };

async function rigged(t: import("node:test").TestContext) {
  const notes = notesPlugin();
  notes.state.notes.set("n1", { id: "n1", title: "笔记一", status: "open" });
  const rig = await mainlineRig(t, { notes }, ["A", "B"]);
  const a = rig.project("A"), b = rig.project("B");
  const as = (reference: typeof a, change: Partial<ActionCallContext> = {}) => bindActionClient(rig.host.actionClient(reference), () => person(reference.project_id, change));
  return { ...rig, notes, a, b, as };
}

test("S-mainline-own-line another person's and another project's items are not found, and nothing of theirs changes", { timeout: 60_000 }, async t => {
  const { a, b, as } = await rigged(t), me = as(a);
  const { item, mainline } = await me.invoke(mainlineItemActions.create, { name: "我的事项" });
  const at = { kind: WORK_ITEM_KIND, id: item.item_id };
  for (const [caller, why] of [[as(a, { actor_id: "someone-else" }), "another person"], [as(b), "another project"]] as const) {
    assert.deepEqual((await caller.invoke(mainlineItemActions.read, {})).mainline.items, [], `${why}: a mainline of its own, empty`);
    await assert.rejects(caller.invoke(mainlineItemActions.contents, { item_id: item.item_id }), code("mainline.item_missing"), why);
    await assert.rejects(caller.invoke(mainlineItemActions.subject, { subject_id: item.item_id }), code("mainline.item_missing"), why);
    await assert.rejects(caller.invoke(mainlineItemActions.rename, { expected_revision: "0", item_id: item.item_id, name: "改掉" }), code("mainline.item_missing"), why);
    await assert.rejects(caller.invoke(mainlineItemActions.remove, { expected_revision: "0", item_id: item.item_id }), code("mainline.item_missing"), why);
    await assert.rejects(caller.invoke(mainlineItemActions.switch, { item_id: item.item_id }), code("mainline.item_missing"), why);
    await assert.rejects(caller.invoke(mainlineItemActions.holdsBind, { subject: { kind: "note", id: "n1" }, target: at }), code("mainline.item_missing"), why);
    await assert.rejects(caller.invoke(mainlineActions.line, { ...WINDOW, item: item.item_id }), code("mainline.item_missing"), why);
    assert.deepEqual((await caller.invoke(mainlineItemActions.holdsCandidates, { subject: { kind: "note", id: "n1" } })).targets, [], `${why}: my item is no candidate`);
  }
  assert.deepEqual((await me.invoke(mainlineItemActions.read, {})).mainline, mainline, "nothing of mine changed");
});

test("S-mainline-own-line whose mainline it is comes from the call: an owner or project in the input is refused", { timeout: 60_000 }, async t => {
  const { a, b, as } = await rigged(t), me = as(a);
  await assert.rejects(me.invoke(mainlineItemActions.read, { owner_actor_id: "someone-else" } as never), code("actions.input_invalid"));
  await assert.rejects(me.invoke(mainlineItemActions.create, { name: "x", project_id: b.project_id } as never), code("actions.input_invalid"));
  // No project, no mainline: a call without one is refused by the project's gateway before the mainline is opened.
  await assert.rejects(as(a, { project_id: undefined }).invoke(mainlineItemActions.read, {}), code("actions.scope_mismatch"), "no project, no mainline");
});

test("S-mainline-own-line an object the caller cannot read does not go into an item or become one; a workflow arranges nothing", { timeout: 60_000 }, async t => {
  const { a, as, notes } = await rigged(t), me = as(a);
  const { item, mainline } = await me.invoke(mainlineItemActions.create, { name: "我的事项" });
  const at = { kind: WORK_ITEM_KIND, id: item.item_id };
  const ungranted = as(a, { permissions: [MAINLINE_READ_PERMISSION, MAINLINE_ARRANGE_PERMISSION] });
  await assert.rejects(ungranted.invoke(mainlineItemActions.holdsBind, { subject: { kind: "note", id: "n1" }, target: at }), code("mainline.subject_unreadable"));
  await assert.rejects(ungranted.invoke(mainlineItemActions.create, { from: { kind: "note", id: "n1" } }), code("mainline.subject_unreadable"));
  await assert.rejects(ungranted.invoke(mainlineItemActions.holdsCreate, { subject: { kind: "note", id: "n1" }, name: "新的" }), code("mainline.subject_unreadable"));
  await assert.rejects(ungranted.invoke(mainlineItemActions.create, { create_as: { kind: "note", name: "新的" } }), code("mainline.source_unavailable"), "no grant, no 「建成」");
  assert.deepEqual(notes.state.creates, [], "the source was never asked to make anything");
  await assert.rejects(me.invoke(mainlineItemActions.holdsBind, { subject: { kind: "note", id: "missing" }, target: at }), code("mainline.subject_unreadable"));
  await assert.rejects(as(a, { audience: "workflow" }).invoke(mainlineItemActions.create, { name: "x" }), code("actions.forbidden"));
  await assert.rejects(as(a, { permissions: [MAINLINE_READ_PERMISSION, "notes:read"] }).invoke(mainlineItemActions.create, { name: "x" }), code("actions.forbidden"), "reading is not arranging");
  assert.deepEqual(await me.invoke(mainlineItemActions.holdsList, { subject: { kind: "note", id: "n1" } }), { targets: [] });
  assert.deepEqual((await me.invoke(mainlineItemActions.read, {})).mainline, mainline, "nothing was written");
});

test("S-mainline-own-line a next step that starts another provider's action is not shown", { timeout: 60_000 }, async t => {
  const { a, as, notes } = await rigged(t), me = as(a);
  const { item } = await me.invoke(mainlineItemActions.create, { from: { kind: "note", id: "n1" } });
  notes.state.next.set("n1", { text: "去别处开工", start: { action: { capability_id: "goals.list", version: 1, provider_id: "io.molis.work.goals" }, input: {} } });
  const line = await me.invoke(mainlineActions.line, { ...WINDOW, item: item.item_id });
  assert.deepEqual(line.events.filter(event => event.suggestion), []);
  assert.deepEqual(line.issues.map(issue => issue.code), ["mainline.owner_answer_invalid"]);
});
