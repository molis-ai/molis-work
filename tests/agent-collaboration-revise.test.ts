// P4-C2 (specs/prologue-adoption §6.0j): a person's change to a round's plan is the Agent Host's action
// `agent.collaboration.revise.v1`, in place of the typed `agent.run.step-board.amend.v1`.
import assert from "node:assert/strict";
import test from "node:test";
import { AgentHost, emptyCapabilityMatrix, registerAgentHostCapabilities } from "@molis-ai/molis-work-service-agent-host";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentCollaborationActions } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { agentHostCapabilities, type AgentRuntimeAdapter, type AgentStepAmendment } from "@molis-ai/molis-work-contracts/services/agent-host";

const owner = { project_id: "p", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "owner" };
const input = { runtime_id: "fixture", session_id: "own-session", run_id: "own-run", amendment: { kind: "skip", node: "step-2", reason: "这次不做" }, expected_version: 4 };

function registered() {
  const host = new AgentHost(), handlers = new Map<string, Function>();
  const revised: Array<{ run: unknown; amendment: AgentStepAmendment; version: number; actor: string }> = [];
  const adapter = { descriptor: { runtime_id: "fixture", display_name: "Fixture", provider_version: "1", capabilities: emptyCapabilityMatrix() },
    async readSession(ref) { return { session: ref, owner, title: "Owned", runs: [{ session_id: "own-session", run_id: "own-run" }], latest_run: null }; },
    collaboration: {
      async read() { return []; }, async awaitReady() { return []; }, async control() { throw new Error("not in this test"); },
      async revise(run, amendment, version, actor) { revised.push({ run, amendment, version, actor }); return { project_id: "p", version: version + 1, terminal: false, nodes: [] }; },
    },
  } as AgentRuntimeAdapter;
  host.register(adapter);
  registerAgentHostCapabilities({ register(definition, handler) { handlers.set(definition.capability_id, handler); return () => {}; } },
    { agentHost: () => host, projectId: () => owner.project_id, authority: () => ({ manifest: { roles: [], prompts: [] }, authorizedDirectories: [] }) });
  const call = (value: Record<string, unknown>, invocation: Record<string, unknown>) => handlers.get(agentCollaborationActions.revise.capability_id)!({}, value, invocation);
  return { call, revised, handlers };
}
const live = (assertAuthorityCurrent: () => void = () => {}, beforeEffect: () => Promise<void> = async () => {}) =>
  ({ consumer: "plugin" as const, plugin: { ...owner, assertActive() {}, declaration: { manifest: {} as never } }, assertAuthorityCurrent, beforeEffect });

test("revise is a plugin's action, and its schema refuses a change of the wrong shape before any handler runs", () => {
  const { action } = agentCollaborationActions.revise;
  assert.deepEqual([action.kind, action.effect, action.audiences], ["operation", "write", ["plugin"]]);
  const refused = (value: unknown) => assert.throws(() => assertActionInput(action.input_schema, value), (error: unknown) => error instanceof ActionError && error.code === "actions.input_invalid", JSON.stringify(value));
  refused({ ...input, amendment: { kind: "skip", node: "../x", reason: "x" } });
  refused({ ...input, amendment: { kind: "skip", node: "step-2", reason: "   " } });
  refused({ ...input, amendment: { kind: "rename", node: "step-2" } });
  refused({ ...input, amendment: { kind: "move", node: "step-2", direction: "left" } });
  refused({ ...input, amendment: { kind: "insert", after: "step-1", title: "t", acceptance: "a", mine: false } });
  refused({ ...input, amendment: { kind: "resolve", node: "user-1", state: "done", note: "x" } });
  refused({ ...input, amendment: { kind: "skip", node: "step-2", reason: "x", by: "someone" } });
  refused({ ...input, expected_version: 0 });
  refused({ ...input, expected_version: 1.5 });
  refused({ ...input, actor_id: "someone-else" });
  const { expected_version: _version, ...without } = input;
  refused(without);
  for (const amendment of [input.amendment, { kind: "insert", after: "step-1", title: "补测试", acceptance: "测试通过", mine: true }, { kind: "unblock", node: "step-2", note: "按 A 做" },
    { kind: "move", node: "user-1", direction: "up" }, { kind: "assign", node: "step-3", to: "me" }, { kind: "resolve", node: "step-3", state: "failed", note: "没做成" }]) {
    assertActionInput(action.input_schema, { ...input, amendment });
  }
});

test("the typed step-board amend is gone: the plan is changed only through revise", () => {
  assert.equal("amendStepBoard" in agentHostCapabilities, false);
  assert.equal(registered().handlers.has("agent.run.step-board.amend.v1"), false);
});

test("a revise goes to the round with the person's change, the version they saw, and the calling plugin's actor", async () => {
  const { call, revised } = registered();
  assert.deepEqual(await call(input, live()), { board: { project_id: "p", version: 5, terminal: false, nodes: [] } });
  assert.deepEqual(revised, [{ run: { session_id: "own-session", run_id: "own-run" }, amendment: input.amendment, version: 4, actor: "owner" }]);
});

test("a cancelled or revoked revise changes nothing, and another session's round is not reachable through it", async () => {
  const cancelled = registered();
  await assert.rejects(cancelled.call(input, live(() => {}, async () => { throw new Error("call cancelled"); })), /call cancelled/);
  assert.deepEqual(cancelled.revised, []);
  const revoked = registered();
  await assert.rejects(revoked.call(input, live(() => { throw new Error("activation revoked"); })), /activation revoked/);
  assert.deepEqual(revoked.revised, []);
  const foreign = registered();
  await assert.rejects(foreign.call({ ...input, run_id: "foreign-run" }, live()), (error: unknown) => (error as { code?: string }).code === "agent.run_unknown");
  await assert.rejects(foreign.call({ ...input, session_id: "foreign-session" }, live()), (error: unknown) => (error as { code?: string }).code === "agent.run_unknown");
  assert.deepEqual(foreign.revised, []);
});
