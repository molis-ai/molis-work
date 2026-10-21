import assert from "node:assert/strict";
import test from "node:test";
import { WORK_EXECUTOR_PROTOCOL, WORK_EXECUTOR_ROLES, defineWorkExecutorActions, workExecutorRoleOf, type WorkExecutorActionOptions,
  type WorkExecutorRole } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectActionCrossReferences, inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";

// specs/repository-anti-corruption PG-036 (C8-1): the work-executor protocol v1. A plugin that takes on work from the Assistant
// publishes six role actions; the SDK checks each against its role and the set as a whole, the way it checks the other protocols.

const options = (name: WorkExecutorRole): WorkExecutorActionOptions =>
  ({ capability_id: `fixture.executor.${name}`, title: name, description: `执行方的 ${name}`, permissions: ["executor:use"] });
const whole = () => Object.values(defineWorkExecutorActions(Object.fromEntries(WORK_EXECUTOR_ROLES.map(name => [name, options(name)])) as Record<WorkExecutorRole, WorkExecutorActionOptions>));

test("PG-036 an executor's whole set, made with defineWorkExecutorActions, passes the SDK's declaration and cross-reference checks", () => {
  const actions = whole();
  assert.deepEqual(actions.map(action => workExecutorRoleOf(action.action)), [...WORK_EXECUTOR_ROLES], "each action takes on its role by its two types");
  assert.deepEqual(inspectActionDeclarations(actions, undefined), []);
  assert.deepEqual(inspectActionCrossReferences(actions), []);
  for (const action of actions) {
    assert.equal(action.action.scope, "project");
    assert.ok(action.action.audiences.includes("user"), "the Assistant calls every role as the local person");
  }
});

test("PG-036 a role action that does not keep its role's contract is refused", () => {
  const [state, open] = whole();
  const broken: Record<string, unknown>[] = [
    { ...state, action: { ...state.action, audiences: ["agent"] } },
    { ...state, action: { ...state.action, scope: "home" } },
    { ...state, operation: "command" },
    { ...state, action: { ...state.action, kind: "operation" } },
    { ...open, action: { ...open.action, input_schema: { type: "object" } } },
    { ...open, action: { ...open.action, output_schema: { type: "object" } } },
    // Half a role: one type of `state`, the other of `session.read`.
    { ...state, action: { ...state.action, output_type: WORK_EXECUTOR_PROTOCOL["session.read"].output_type } },
  ];
  for (const action of broken) assert.match(inspectActionDeclarations([action], undefined).join("\n"), /没有兑现工作执行方协议 v1/, JSON.stringify(action).slice(0, 200));
});

test("PG-036 an executor publishes every role once: half a set or a role twice is refused", () => {
  const actions = whole();
  assert.match(inspectActionCrossReferences(actions.slice(0, 4)).join("\n"), /缺 run\.start、缺 run\.control/);
  assert.match(inspectActionCrossReferences([...actions, { ...actions[0]!, capability_id: "fixture.executor.state-again" }]).join("\n"), /state 重复/);
});
