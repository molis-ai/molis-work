import assert from "node:assert/strict";
import test from "node:test";

import { ActionError, PLACEMENT_RELATION_ROLES, isPlacementRelationPart, type ActionCallContext, type ActionDefinition, type ActionMetadata } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalPluginActions } from "@molis-ai/molis-work-plugin-goals/contract";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { goalsActions, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { fakeGoalDirectory, pluginActions } from "./fixtures/plugin-actions.js";

/**
 * RAC-634 (PG-032), batch 44 C1 (contract-design §2.2, CD-02): what the SDK's declaration check says about the `placement_relation` a
 * plugin writes on its actions, and how Goals declares its 「挂到…」 relation with it, one part per action in the platform's shape.
 */

type Declared = Pick<ActionDefinition, "action">;
const goalsRelation: readonly ActionDefinition[] = [goalsActions.attachList, goalsActions.attachBind, goalsActions.attachRelease, goalsActions.attachCandidates, goalsActions.attachCreate];
const problems = (definitions: unknown[]) => inspectActionDeclarations(definitions, undefined);
const withRelation = (definition: Declared, placement_relation: unknown, patch: Record<string, unknown> = {}): Declared & { action: ActionMetadata } =>
  ({ ...definition, action: { ...definition.action, ...patch, placement_relation } });
const asRole = (index: number, role: string, relation = "goal") => withRelation(goalsRelation[index]!, { relation, role, ...(role === "list" ? { target: { kind: "goal", noun: "Goal" } } : {}) });

test("RAC-634 CD-02 Goals' five 「挂到…」 parts declare the Goal relation, one role each, in the platform's shape, and the check accepts them", () => {
  const parts = goalsRelation.map(definition => definition.action.placement_relation);
  assert.deepEqual(parts.map(part => part?.role), [...PLACEMENT_RELATION_ROLES]);
  assert.ok(parts.every(part => part?.relation === "goal"));
  assert.deepEqual(parts[0]?.target, { kind: "goal", noun: "Goal", noun_text: { key: "goals.attach.noun" } }, "the list part names the other end, with its language key");
  assert.ok(goalsRelation.every((definition, index) => isPlacementRelationPart(definition.action, PLACEMENT_RELATION_ROLES[index]!)), "each in the shape placement calls");
  assert.ok(goalsRelation.every(definition => definition.action.subject_kinds.length === 0 && definition.action.audiences.join() === "user"),
    "any object the person can read may be attached, by the person; agents use Goals' own actions");
  assert.deepEqual(problems(goalsRelation), []);
});

test("RAC-634 the check refuses a role that is not one of the five, a relation name that is not a lowercase word, a part declared twice, and a list part with no target", () => {
  assert.notDeepEqual(problems([asRole(0, "list"), withRelation(goalsRelation[1]!, { relation: "goal", role: "attach" })]), [], "a role outside the list");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "Goal", role: "list", target: { kind: "goal", noun: "Goal" } })]), [], "not lowercase");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "goal-1", role: "list", target: { kind: "goal", noun: "Goal" } })]), [], "not a word");
  assert.notDeepEqual(problems([asRole(0, "list"), asRole(1, "bind"), asRole(2, "bind")]), [], "the bind part is played by two actions");
  assert.notDeepEqual(problems([asRole(1, "bind"), asRole(2, "release")]), [], "no list part says what the other end is");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "goal", role: "list" })]), [], "a list part with no target");
});

test("RAC-634 the check refuses a target on any part but list, an unknown field, a noun text that is not a key, and a part whose operation or reach does not fit its role", () => {
  assert.notDeepEqual(problems([asRole(0, "list"), withRelation(goalsRelation[1]!, { relation: "goal", role: "bind", target: { kind: "goal", noun: "Goal" } })]), [], "target on bind");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "goal", role: "list", target: { kind: "goal", noun: "Goal" }, owner: "io.example" })]), [], "unknown field");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "goal", role: "list", target: { kind: "goal", noun: "Goal", owner: "io.example" } })]), [], "unknown target field");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "goal", role: "list", target: { kind: "goal", noun: "Goal", noun_text: { text: "Goal" } } })]), [], "a noun text that is not a key");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "goal", role: "bind" })]), [], "bind written on a query");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "goal", role: "list", target: { kind: "goal", noun: "Goal" } }, { scope: "home" })]), [], "home scope");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "goal", role: "list", target: { kind: "goal", noun: "Goal" } }, { audiences: ["agent"] })]), [], "not open to the person");
});

const caller: ActionCallContext = { actor_id: "directory-reader", project_id: "directory-project", audience: "user", permissions: ["goals:read"] };
const provider = { provider_id: "goals-manifest-proof", title: "Goals", kind: "system" as const };

test("RAC-634-MIG-01 the real Goals Manifest registers its one Goal relation, all five roles, through ActionService without invoking a handler", () => {
  const definitions = goalsManifest.actions!;
  assert.deepEqual(definitions.flatMap(definition => definition.action.placement_relation ? [[definition.capability_id, definition.action.placement_relation.relation, definition.action.placement_relation.role]] : []).sort(),
    [["goals.attach.list", "goal", "list"], ["goals.attach.bind", "goal", "bind"], ["goals.attach.release", "goal", "release"], ["goals.attach.candidates", "goal", "candidates"],
      ["goals.attach.create", "goal", "create"]].sort());
  assert.deepEqual(inspectActionDeclarations(definitions, undefined), []);
  const service = new ActionService();
  let calls = 0;
  const dispose = service.registerProvider({ provider, definitions,
    handlers: definitions.map(definition => ({ ...definition, handle() { calls++; throw new Error("Registration does not execute Goals"); } })) });
  assert.deepEqual(service.inspect(caller).map(view => [view.capability_id, view.version]).sort(),
    definitions.filter(definition => definition.action.audiences.includes(caller.audience)).map(definition => [definition.capability_id, definition.version]).sort());
  assert.equal(calls, 0);
  dispose();
  assert.deepEqual(service.inspect(caller), []);
});

test("RAC-634-MIG-01 a provider whose relation has no list part is rejected before any action is registered or called", () => {
  const service = new ActionService();
  let calls = 0;
  const bind = goalsActions.attachBind;
  assert.throws(() => service.registerProvider({ provider, definitions: [bind], handlers: [{ ...bind, handle() { calls++; return {}; } }] }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.definition_invalid" && /放置关联 goal 缺少 list 角色/u.test(error.message));
  assert.deepEqual(service.inspect(caller), []);
  assert.equal(calls, 0);
});

test("RAC-634-MIG-02 the read-only Goal directory keeps the public contract, pagination, titles and caller, and claims no relation", async () => {
  const seen: ActionCallContext[] = [], titles = { g1: "第一个目标", g2: "另一个目标" };
  const actions = fakeGoalDirectory(pluginActions({}, caller.project_id!), () => titles, 1, seen);
  assert.equal(fakeGoalDirectory(actions, () => { throw new Error("Repeated assembly must not replace the directory"); }), actions);
  const [view] = actions.client.inspect(caller);
  assert.ok(view);
  assert.deepEqual(actions.client.inspect(caller).map(action => [action.capability_id, action.version, action.operation]), [["goals.list", 1, "query"]]);
  assert.deepEqual(view.action, goalPluginActions.list.action, "the directory is Goals' own, unchanged");
  assert.equal(view.action.placement_relation, undefined, "Goals' directory plays no part: the relation's candidates are its own part");
  const first = await actions.client.invoke(caller, goalPluginActions.list, { limit: 100 });
  assert.deepEqual(first.goals.map(goal => [goal.goal_id, goal.title]), [["g1", titles.g1]]);
  assert.equal(first.next_cursor, "1");
  const second = await actions.client.invoke(caller, goalPluginActions.list, { after_cursor: first.next_cursor!, limit: 100 });
  assert.deepEqual(second.goals.map(goal => [goal.goal_id, goal.title]), [["g2", titles.g2]]);
  assert.equal(second.next_cursor, null);
  assert.deepEqual(seen.map(context => [context.actor_id, context.project_id, context.audience, context.permissions]),
    Array.from({ length: 2 }, () => [caller.actor_id, caller.project_id, caller.audience, caller.permissions]));
});
