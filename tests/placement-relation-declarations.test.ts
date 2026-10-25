import assert from "node:assert/strict";
import test from "node:test";

import { ActionError, type ActionCallContext, type ActionDefinition, type ActionMetadata } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalEntryActions, goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { goalsActions, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { fakeGoalDirectory, pluginActions } from "./fixtures/plugin-actions.js";

/** RAC-634 (PG-032): what the SDK's declaration check says about the `placement_relation` a plugin writes on its actions. */

type Declared = Pick<ActionDefinition, "action">;
const goalsRelation: readonly Declared[] = [goalsActions.inputsList, goalsActions.inputsBind, goalsActions.inputsRelease, goalPluginActions.list, goalEntryActions.create];
const problems = (definitions: unknown[]) => inspectActionDeclarations(definitions, undefined);
const withRelation = (definition: Declared, placement_relation: unknown, patch: Record<string, unknown> = {}): Declared & { action: ActionMetadata } =>
  ({ ...definition, action: { ...definition.action, ...patch, placement_relation } });
const asRole = (index: number, role: string, relation = "goal") => withRelation(goalsRelation[index]!, { relation, role, ...(role === "list" ? { target: { kind: "goal", noun: "Goal" } } : {}) });

test("RAC-634 Goals' five actions declare the Goal relation, one part each, and the declaration check accepts them", () => {
  const parts = goalsRelation.map(definition => definition.action.placement_relation);
  assert.deepEqual(parts.map(part => part?.role), ["list", "bind", "release", "candidates", "create"]);
  assert.ok(parts.every(part => part?.relation === "goal"));
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

test("RAC-634 the check refuses a target on any part but list, an unknown field, and a part whose operation or reach does not fit its role", () => {
  assert.notDeepEqual(problems([asRole(0, "list"), withRelation(goalsRelation[1]!, { relation: "goal", role: "bind", target: { kind: "goal", noun: "Goal" } })]), [], "target on bind");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "goal", role: "list", target: { kind: "goal", noun: "Goal" }, owner: "io.example" })]), [], "unknown field");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "goal", role: "bind" })]), [], "bind written on a query");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "goal", role: "list", target: { kind: "goal", noun: "Goal" } }, { scope: "home" })]), [], "home scope");
  assert.notDeepEqual(problems([withRelation(goalsRelation[0]!, { relation: "goal", role: "list", target: { kind: "goal", noun: "Goal" } }, { audiences: ["agent"] })]), [], "not open to the person");
});

const caller: ActionCallContext = { actor_id: "directory-reader", project_id: "directory-project", audience: "user", permissions: ["goals:read"] };
const provider = { provider_id: "goals-manifest-proof", title: "Goals", kind: "system" as const };

test("RAC-634-MIG-01 the real Goals Manifest registers all five relation roles through ActionService without invoking a handler", () => {
  const definitions = goalsManifest.actions!;
  assert.deepEqual(definitions.flatMap(definition => definition.action.placement_relation ? [[definition.capability_id, definition.action.placement_relation.role]] : []).sort(),
    [["goals.inputs.list", "list"], ["goals.inputs.bind", "bind"], ["goals.inputs.release", "release"], ["goals.list", "candidates"], ["goals.create", "create"]].sort());
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

test("RAC-634-MIG-01 a candidates-only provider is still rejected before any action is registered or called", () => {
  const service = new ActionService();
  let calls = 0;
  assert.throws(() => service.registerProvider({ provider, definitions: [goalPluginActions.list],
    handlers: [{ ...goalPluginActions.list, handle() { calls++; return {}; } }] }),
  (error: unknown) => error instanceof ActionError && error.code === "actions.definition_invalid" && /放置关联 goal 缺少 list 角色/.test(error.message));
  assert.deepEqual(service.inspect(caller), []);
  assert.equal(calls, 0);
});

test("RAC-634-MIG-02 the read-only Goal directory keeps the public contract, pagination, titles and caller without claiming a placement role", async () => {
  const seen: ActionCallContext[] = [], titles = { g1: "第一个目标", g2: "另一个目标" };
  const actions = fakeGoalDirectory(pluginActions({}, caller.project_id!), () => titles, 1, seen);
  assert.equal(fakeGoalDirectory(actions, () => { throw new Error("Repeated assembly must not replace the directory"); }), actions);
  const [view] = actions.client.inspect(caller);
  assert.ok(view);
  assert.deepEqual(actions.client.inspect(caller).map(action => [action.capability_id, action.version, action.operation]), [["goals.list", 1, "query"]]);
  const expected = { ...goalPluginActions.list.action };
  delete expected.placement_relation;
  assert.deepEqual(view.action, expected, "only the role this stand-in cannot provide is omitted");
  assert.deepEqual(goalPluginActions.list.action.placement_relation, { relation: "goal", role: "candidates" }, "the production definition is untouched");
  const first = await actions.client.invoke(caller, goalPluginActions.list, { limit: 100 });
  assert.deepEqual(first.goals.map(goal => [goal.goal_id, goal.title]), [["g1", titles.g1]]);
  assert.equal(first.next_cursor, "1");
  const second = await actions.client.invoke(caller, goalPluginActions.list, { after_cursor: first.next_cursor!, limit: 100 });
  assert.deepEqual(second.goals.map(goal => [goal.goal_id, goal.title]), [["g2", titles.g2]]);
  assert.equal(second.next_cursor, null);
  assert.deepEqual(seen.map(context => [context.actor_id, context.project_id, context.audience, context.permissions]),
    Array.from({ length: 2 }, () => [caller.actor_id, caller.project_id, caller.audience, caller.permissions]));
});
