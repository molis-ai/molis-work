import assert from "node:assert/strict";
import test from "node:test";

import type { ActionDefinition, ActionMetadata } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalEntryActions, goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";

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
