// Stage 3d-5 of specs/ai-input-receipts (D2): a supplement taken back while a person's new step for it waits to be written
// is not that step's source. The Host checks once the call is current; the runtime checks the round's own ledger again
// right before the board takes the step. Either refusal is `agent.input_not_origin`, and the board stays as it was.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, registerAgentHostCapabilities } from "@molis-ai/molis-work-service-agent-host";
import { agentCollaborationActions } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

const until = async <T>(read: () => T | Promise<T>, what: string): Promise<NonNullable<T>> => {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error(`not reached: ${what}`);
};

function answer(): Response {
  const events = [
    ["message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } }],
    ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { index: 0, delta: { type: "text_delta", text: "做完了" } }],
    ["content_block_stop", { index: 0 }],
    ["message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } }],
    ["message_stop", {}],
  ] as const;
  return new Response(events.map(([type, value]) => `event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}

/** A round held in its first model request, with one supplement it has received and not yet read. */
async function heldRound(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "molis-origin-race-"));
  let release = () => {}, started = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  t.mock.method(globalThis, "fetch", async () => { started = true; await held; return answer(); });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "molis.origin-race.test", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "test" }), resolveCredential: () => "test-only" });
  const owner = { project_id: "board", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const plan = { source: { artifact_id: "plan-a", version: 1 }, title: "改登录", steps: [{ id: "step-1", title: "改登录接口", acceptance: "测试通过" }] };
  const session = await adapter.createSession({ ...owner, directory, title: "origins" });
  const handle = await adapter.start({ ...owner, directory, session, task: "改登录", role_id: "builder", execution_plan: plan,
    text_materials: [{ material_id: "plan", source_artifact_id: "plan-a", source_version: 1, title: plan.title, text: JSON.stringify(plan) }],
    role: { role_id: "builder", version: 1, execution: "text-edit", prompts: [], host_tools: ["board-read", "board-report", "board-revise"] } } as never);
  // In this order: the held model answers, the round ends, then the runtime closes and its files go.
  t.after(async () => {
    release();
    await until(async () => ["completed", "failed", "cancelled", "stopped"].includes((await adapter.read(handle.ref)).phase), "the round's end");
    await adapter.close?.();
    await rm(root, { recursive: true, force: true });
  });
  await until(() => started, "the first model request");
  const input = (await adapter.inputs!.send(handle.ref, { text: "顺便把注册接口也覆盖一下" })).input_id;
  const before = await adapter.read(handle.ref);
  assert.equal(before.turns.find(turn => turn.steer?.id === input)?.steer?.state, "received");
  return { adapter, owner, handle, input, before };
}

const notOrigin = (error: unknown) => (error as { code?: string }).code === "agent.input_not_origin";
const insert = (input: string) => ({ kind: "insert" as const, after: "step-1", title: "覆盖注册接口", acceptance: "注册的测试通过", origin: input });

function unchanged(after: AgentRunView, before: AgentRunView, input: string): void {
  assert.equal(after.turns.find(turn => turn.steer?.id === input)?.steer?.state, "withdrawn");
  assert.equal(after.step_board!.nodes.some(node => node.origins?.some(origin => origin.input_id === input)), false, `no step points at the withdrawn input: ${JSON.stringify(after.step_board!.nodes)}`);
  assert.deepEqual([after.step_board!.version, after.step_board!.nodes.map(node => node.id)], [before.step_board!.version, before.step_board!.nodes.map(node => node.id)], "the board is as it was");
}

test("RCPT-357 a supplement taken back while the person's step waits for the action to be current is refused, and the board is not written", { timeout: 60_000 }, async t => {
  const { adapter, owner, handle, input, before } = await heldRound(t);
  const host = new AgentHost(), handlers = new Map<string, Function>();
  host.register(adapter);
  registerAgentHostCapabilities({ register(definition, handler) { handlers.set(definition.capability_id, handler); return () => {}; } },
    { agentHost: () => host, projectId: () => owner.project_id, authority: () => ({ manifest: { roles: [], prompts: [] }, authorizedDirectories: [] }) });
  let checks = 0, withdrew = false;
  // The third wait is the handler's own, after the registration's and the session read's; the person takes the supplement back during it.
  const invocation = { consumer: "plugin", plugin: { ...owner, assertActive() {}, declaration: { manifest: {} } }, assertAuthorityCurrent() {},
    async beforeEffect() { if (++checks === 3) { await adapter.inputs!.withdraw!(handle.ref, input); withdrew = true; } } };
  const revise = handlers.get(agentCollaborationActions.revise.capability_id)!;
  await assert.rejects(revise({}, { runtime_id: adapter.descriptor.runtime_id, ...handle.ref, amendment: insert(input), expected_version: before.step_board!.version }, invocation), notOrigin);
  // The runtime's own write for the withdrawal is checked too, inside the third wait; the handler refuses right after it.
  assert.equal(withdrew, true, "taken back during the handler's own wait");
  unchanged(await adapter.read(handle.ref), before, input);
});

test("RCPT-357 the runtime checks the round's own ledger again right before the board takes the step", { timeout: 60_000 }, async t => {
  const { adapter, handle, input, before } = await heldRound(t);
  await adapter.inputs!.withdraw!(handle.ref, input);
  // Straight to the runtime, past the Host's check: the adapter refuses on its own record.
  await assert.rejects(adapter.collaboration!.revise(handle.ref, insert(input), before.step_board!.version, "user"), notOrigin);
  unchanged(await adapter.read(handle.ref), before, input);
});
