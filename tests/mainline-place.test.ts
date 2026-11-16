import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MAINLINE_PLACE_PERMISSION, MAINLINE_READ_PERMISSION, mainlineActions } from "@molis-ai/molis-work-contracts/services/mainline";
import { backgroundPlugin, backgroundRig } from "./fixtures/home-background-plugin.js";

/*
 * Placement (specs/work-line §5, WLN-32, WLN-34): `mainline.place@1` says which event a task is done for. The task's owner keeps the
 * relation and is found by its `serves` declaration; the service keeps nothing. The page, the Assistant and an MCP client call this
 * one action. The fixture plugin stands for an installed plugin that keeps the relation for its own tasks.
 */

const SOURCE = { surface: "example", title: "示例", icon: "list" };
const WINDOW = { from: "2026-11-14T00:00:00.000Z", to: "2026-11-15T00:00:00.000Z", now: "2026-11-14T10:00:00.000Z" };
const event = (id: string) => ({ event_id: id, subject: { kind: "homebg_item", id }, title: `事件 ${id}`, summary: "", content: "", facts: [], category: "personal", placement: "active",
  occurred_at: "2026-11-14T09:00:00.000Z", needs_attention: false, open: null });
const T1 = { kind: "homebg_task", id: "t1" }, E1 = { kind: "homebg_item", id: "e1" }, E2 = { kind: "homebg_item", id: "e2" };
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
const person = (projectId: string, permissions: readonly string[] = [MAINLINE_READ_PERMISSION, MAINLINE_PLACE_PERMISSION, "homebg:read"], change: Partial<ActionCallContext> = {}): ActionCallContext =>
  ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectId, permissions: [...permissions], ...change });

async function rigged(t: import("node:test").TestContext) {
  const plugin = backgroundPlugin(() => ({ source: SOURCE, tasks: [] }));
  plugin.state.events = () => ({ source: SOURCE, events: [event("e1"), event("e2")] });
  plugin.state.serves.set("t1", []);
  const rig = await backgroundRig(t, plugin, ["A"]);
  const a = rig.project("A");
  return { plugin, client: rig.host.actionClient(a), projectId: a.project_id };
}

test("WLN-32, WLN-34 mainline.place hangs a task on an event, moves it, registers it as a new event and takes it off, through the owner's own declared parts; the page and the Assistant call the same action", { timeout: 60_000 }, async t => {
  const { plugin, client, projectId } = await rigged(t), me = person(projectId);
  const place = (to: unknown, caller = me) => client.invoke(caller, mainlineActions.place, { task: T1, to, window: WINDOW } as never);

  assert.deepEqual(await place({ kind: "event", subject: E1 }), { task: T1, serves: [E1] });
  assert.deepEqual(plugin.state.servesCalls.map(call => [call.role, call.event]), [["list", undefined], ["bind", "e1"]], "the owner is asked what it serves, then told once");
  // The same place again changes nothing and is not written twice.
  assert.deepEqual(await place({ kind: "event", subject: E1 }), { task: T1, serves: [E1] });
  assert.deepEqual(plugin.state.servesCalls.slice(2).map(call => call.role), ["list"]);
  // A change of place is the same call: the task now serves only the new event.
  assert.deepEqual(await place({ kind: "event", subject: E2 }), { task: T1, serves: [E2] });
  assert.deepEqual(plugin.state.serves.get("t1"), [E2]);
  // The Assistant places through the same action, as itself.
  const agent = person(projectId, undefined, { audience: "agent", actor_id: "agent:test" });
  assert.deepEqual(await client.invoke(agent, mainlineActions.place, { task: T1, to: { kind: "none" } }), { task: T1, serves: [] });
  assert.equal(plugin.state.servesCalls.at(-1)!.audience, "agent");
  assert.deepEqual(await client.invoke(agent, mainlineActions.place, { task: T1, to: { kind: "none" } }), { task: T1, serves: [] }, "already nowhere: nothing to do");
  assert.equal(plugin.state.servesCalls.at(-1)!.role, "list");
  assert.deepEqual(await client.invoke(me, mainlineActions.place, { task: T1, to: { kind: "new_event" } }), { task: T1, serves: [{ kind: "homebg_item", id: "from-t1" }] });
});

test("WLN-34 mainline.place refuses what the caller cannot read or the owner does not offer, and changes nothing: an event no registrant reports, a task its owner does not know, a kind nobody keeps, a wrong answer, a caller without the permission", { timeout: 60_000 }, async t => {
  const { plugin, client, projectId } = await rigged(t), me = person(projectId);
  const changes = () => plugin.state.servesCalls.filter(call => call.role !== "list").length;
  const refused = async (input: unknown, expected: string, why: string, caller = me) => {
    const before = changes();
    await assert.rejects(client.invoke(caller, mainlineActions.place, input as never), code(expected), why);
    assert.equal(changes(), before, `${why}: the owner was not told to change anything`);
  };
  await refused({ task: T1, to: { kind: "event", subject: { kind: "homebg_item", id: "not-on-the-line" } }, window: WINDOW }, "mainline.event_unreadable", "an event no registrant reports in the window");
  await refused({ task: T1, to: { kind: "event", subject: { kind: "goal", id: "g1" } }, window: WINDOW }, "mainline.event_unreadable", "an object that is not an event of the line");
  await refused({ task: { kind: "homebg_task", id: "unknown" }, to: { kind: "event", subject: E1 }, window: WINDOW }, "homebg.task_missing", "a task its owner does not know: the owner's own refusal");
  await refused({ task: { kind: "someone_elses_task", id: "x" }, to: { kind: "none" } }, "mainline.task_not_placeable", "a task kind nobody keeps the relation for");
  await refused({ task: T1, to: { kind: "event", subject: E1 } }, "actions.input_invalid", "an event without the window it is on");
  await refused({ task: T1, to: { kind: "none", subject: E1 } }, "actions.input_invalid", "an event given where none belongs");
  await refused({ task: T1, to: { kind: "elsewhere" } }, "actions.input_invalid", "a place that does not exist");
  // A caller that cannot read the registrant cannot place onto its event; one without the owner's permission finds no owner.
  await refused({ task: T1, to: { kind: "event", subject: E1 }, window: WINDOW }, "mainline.task_not_placeable", "a caller the owner does not answer", person(projectId, [MAINLINE_PLACE_PERMISSION]));
  await refused({ task: T1, to: { kind: "none" } }, "actions.forbidden", "a caller without the placement permission", person(projectId, [MAINLINE_READ_PERMISSION, "homebg:read"]));
  await refused({ task: T1, to: { kind: "none" } }, "actions.forbidden", "a workflow may not place", person(projectId, undefined, { audience: "workflow" }));
  assert.deepEqual(plugin.state.serves.get("t1"), [], "nothing was recorded by any refused call");

  // An owner that does not record what was asked, or answers something else, is not believed.
  plugin.state.servesAnswer = role => role === "bind" ? { serves: [E2] } : undefined;
  await assert.rejects(client.invoke(me, mainlineActions.place, { task: T1, to: { kind: "event", subject: E1 }, window: WINDOW }), code("mainline.owner_answer_invalid"));
  plugin.state.servesAnswer = role => role === "list" ? { serves: "everything" } : undefined;
  await refused({ task: T1, to: { kind: "none" } }, "actions.output_invalid", "an answer outside the relation's contract is stopped at the gateway");
});
