// Stages 1c and 3b-1 of specs/ai-input-receipts (§4.6, §7, §11): a supplement is taken once, one that misses the end of its round waits for the next, and the withdraw action reaches only the caller's round.
import assert from "node:assert/strict";
import test from "node:test";
import { AgentHost, PrologueAgentAdapter, emptyCapabilityMatrix, registerAgentHostCapabilities, runViewVersion, type PrologueEvent, type PrologueRuntimePort } from "@molis-ai/molis-work-service-agent-host";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentInputActions, type AgentInputSend } from "@molis-ai/molis-work-contracts/services/agent-inputs";

/** What the runtime's own control is handed for a supplement. */
type Steer = { text: string; source?: "person" | "app"; key?: string; interrupt?: boolean; about?: string };

function notRunning(): Error {
  return Object.assign(new Error("This agent run is completed; it cannot be steered."), { name: "PrologueError", code: "RUN_NOT_RUNNING" });
}

async function adapterFor(options: { steer: (input: Steer) => unknown; queue?: boolean }) {
  const listeners = new Set<(event: PrologueEvent) => void>();
  const steered: Steer[] = [], queued: Array<{ session: string; input: unknown }> = [], taken: Array<{ from: "run" | "queued"; id: string }> = [];
  const runtime: PrologueRuntimePort = {
    sessions: { create: async () => ({ ref: { id: "session-1" } }) },
    async startAgentRun() {
      return {
        run: { ref: { id: "run-1" }, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, async cancel() {} },
        control: { state: "running", stop() {}, pause() {}, resume() {}, subscribe() { return () => {}; },
          async steer(input) { steered.push(input); return options.steer(input) as never; },
          async withdrawSteer(id) { if (id !== "steer-1") throw Object.assign(new Error("no such input"), { code: "AGENT_STEER_NOT_FOUND" }); taken.push({ from: "run", id }); } },
      };
    },
    async shutdown() { return {}; },
    ...(options.queue === false ? {} : { queue: { async add(session: string, input: unknown) { queued.push({ session, input }); return { inputId: "steer-9", replayed: false }; }, async withdraw(_session: string, id: string) { taken.push({ from: "queued", id }); } } }),
  };
  const adapter = new PrologueAgentAdapter({ runtime,
    modelConfiguration: async () => ({ protocol: "anthropic-messages", endpoint: "https://x.test", model: "m", credential_ref: "c" }) });
  const owner = { project_id: "project-1", actor_id: "person-1", plugin_id: "io.molis.work.coding", install_id: "coding-1" };
  const directory = { canonical_path: "/tmp/ws", realpath_verified: true };
  await adapter.createSession({ ...owner, title: "t", directory });
  const handle = await adapter.start({
    ...owner, session: { session_id: "session-1", runtime_id: "prologue" }, task: "看看这段代码", role_id: "reader", directory,
    role: { role_id: "reader", version: 1, execution: "read-only", prompts: [{ prompt_id: "p", version: 1, body: "b" }], host_tools: [] },
  });
  const send = (input: AgentInputSend, beforeQueue?: () => void) => adapter.inputs.send(handle.ref, input, beforeQueue);
  return { adapter, ref: handle.ref, send, steered, queued, taken, emit: (event: PrologueEvent) => { for (const listener of listeners) listener(event); } };
}

test("RC-02: a supplement goes to the round with its key, author and send mode, and the receipt names what the runtime took", async () => {
  const item = await adapterFor({ steer: () => ({ steerId: "steer-1", replayed: false }) });
  const receipt = await item.send({ text: "别改 fixture", key: "send.1", mode: "interrupt" });
  assert.deepEqual(item.steered, [{ text: "别改 fixture", key: "send.1", interrupt: true }]);
  assert.deepEqual(receipt, { input_id: "steer-1", replayed: false, delivered: "run" });
  const host = await item.send({ text: "计划已调整", source: "host" });
  assert.deepEqual(item.steered.at(-1), { text: "计划已调整", source: "app" }, "the Host's note is the app speaking, and never interrupts");
  assert.equal(host.delivered, "run");
});

test("RC-02: the same key sent again is the first supplement, not a second one", async () => {
  const seen = new Map<string, string>();
  const item = await adapterFor({ steer: input => {
    const known = input.key ? seen.get(input.key) : undefined;
    if (known) return { steerId: known, replayed: true };
    const id = `steer-${seen.size + 1}`; if (input.key) seen.set(input.key, id); return { steerId: id, replayed: false };
  } });
  const first = await item.send({ text: "补上测试", key: "send.7" });
  const again = await item.send({ text: "补上测试", key: "send.7" });
  assert.deepEqual(again, { ...first, replayed: true });
});

test("RC-03: a supplement that arrives as the round ends waits in the session under the same key, and no round starts", async () => {
  const item = await adapterFor({ steer: () => { throw notRunning(); } });
  let checked = 0;
  const receipt = await item.send({ text: "顺便看注册接口", key: "send.2" }, () => { checked++; });
  assert.equal(checked, 2, "the caller is checked before the live handoff, then again before the session keeps it");
  assert.deepEqual(item.queued, [{ session: "session-1", input: { text: "顺便看注册接口", key: "send.2" } }]);
  assert.deepEqual(receipt, { input_id: "steer-9", replayed: false, delivered: "queued" });
});

test("RC-03: a round already ended takes nothing; the supplement goes straight to the session's queue", async () => {
  const item = await adapterFor({ steer: () => ({ steerId: "never", replayed: false }) });
  item.emit({ type: "completed" } as PrologueEvent);
  const receipt = await item.send({ text: "下一轮再看", key: "send.3" });
  assert.equal(item.steered.length, 0);
  assert.equal(receipt.delivered, "queued");
});

test("RC-03: asked to wait for the next round, a supplement goes to the session's queue even while the round runs", async () => {
  const item = await adapterFor({ steer: () => ({ steerId: "never", replayed: false }) });
  const receipt = await item.send({ text: "这轮做完再改文档", key: "send.4", mode: "after-run" });
  assert.equal(item.steered.length, 0);
  assert.deepEqual(item.queued, [{ session: "session-1", input: { text: "这轮做完再改文档", key: "send.4" } }]);
  assert.equal(receipt.delivered, "queued");
});

test("RC-03: without a session queue a supplement to an ended round is refused; nothing is reported as taken", async () => {
  const item = await adapterFor({ steer: () => { throw notRunning(); }, queue: false });
  await assert.rejects(item.send({ text: "还在吗" }), (error: unknown) => (error as { code?: string }).code === "agent.capability_unavailable");
  assert.deepEqual(item.queued, []);
});

test("RC-03: a call revoked while the round was ending keeps nothing in the session", async () => {
  const item = await adapterFor({ steer: () => { throw notRunning(); } });
  let checks = 0;
  await assert.rejects(item.send({ text: "还要这个", key: "send.5" }, () => { if (++checks === 2) throw new Error("activation revoked"); }), /activation revoked/);
  assert.equal(item.steered.length, 1, "the live round ended after the first check");
  assert.equal(checks, 2);
  assert.deepEqual(item.queued, [], "the check before the queue write refused it, so the session holds nothing");
});

test("RC-04: the run view's version moves when a supplement moves, so a waiting page hears of it at once", async () => {
  const item = await adapterFor({ steer: () => ({ steerId: "steer-1", replayed: false }) });
  item.emit({ type: "prompt", role: "user", text: "首条任务" } as PrologueEvent);
  item.emit({ type: "prompt", role: "user", text: "别改 fixture", steerId: "steer-1" } as PrologueEvent);
  item.emit({ type: "prompt", role: "user", text: "最后一条", steerId: "steer-2" } as PrologueEvent);
  const before = runViewVersion(await item.adapter.read(item.ref));
  item.emit({ type: "steer-applied", steerId: "steer-1" } as PrologueEvent);
  const after = runViewVersion(await item.adapter.read(item.ref));
  assert.notEqual(after, before, "an earlier supplement reaching the context is a change the page draws");
});

const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "install", actor_id: "actor" };

/** `agent.inputs.*` as the Host registers them, over a runtime that records each supplement it is handed or asked to take back. */
function registered() {
  const host = new AgentHost(), handlers = new Map<string, Function>(), sent: AgentInputSend[] = [], withdrawn: string[] = [];
  let read = false;
  const adapter = { descriptor: { runtime_id: "fixture", display_name: "Fixture", provider_version: "1", capabilities: emptyCapabilityMatrix() },
    async readSession(ref) { return { session: ref, owner, title: "Owned", runs: [{ session_id: "own-session", run_id: "own-run" }], latest_run: null }; },
    inputs: { async send(_run, input, beforeQueue) { beforeQueue?.(); sent.push(input); return { input_id: "steer-1", replayed: false, delivered: "queued" as const }; },
      async withdraw(_run, inputId, beforeWithdraw) { read = true; beforeWithdraw?.(); withdrawn.push(inputId); return { input_id: inputId, from: "queued" as const }; } },
  } as AgentRuntimeAdapter;
  host.register(adapter);
  registerAgentHostCapabilities({ register(definition, handler) { handlers.set(definition.capability_id, handler); return () => {}; } },
    { agentHost: () => host, projectId: () => owner.project_id, authority: () => ({ manifest: { roles: [], prompts: [] }, authorizedDirectories: [] }) });
  const call = (input: Record<string, unknown>, invocation: Record<string, unknown>) => handlers.get(agentInputActions.send.capability_id)!({}, input, invocation);
  const withdraw = (input: Record<string, unknown>, invocation: Record<string, unknown>) => handlers.get(agentInputActions.withdraw.capability_id)!({}, input, invocation);
  return { call, withdraw, sent, withdrawn, read: () => read };
}
const input = { runtime_id: "fixture", session_id: "own-session", run_id: "own-run", text: "顺便看日志" };
const live = (assertAuthorityCurrent: () => void = () => {}, beforeEffect: () => Promise<void> = async () => {}) =>
  ({ consumer: "plugin" as const, plugin: { ...owner, assertActive() {}, declaration: { manifest: {} as never } }, assertAuthorityCurrent, beforeEffect });

test("RC-05: agent.inputs.send is a plugin's action in the directory, and its schema refuses a bad key or mode before any handler runs", () => {
  const { action } = agentInputActions.send;
  assert.deepEqual(action.audiences, ["plugin"], "the Assistant uses the runtime's port inside the Host; people reach a round through its plugin");
  assert.equal(action.scheduling, "concurrent");
  const refused = (value: unknown) => assert.throws(() => assertActionInput(action.input_schema, value), (error: unknown) => error instanceof ActionError && error.code === "actions.input_invalid");
  refused({ ...input, key: "../escape" });
  refused({ ...input, key: "" });
  refused({ ...input, mode: "whenever" });
  refused({ ...input, source: "model" });
  refused({ ...input, text: "   " });
  refused({ ...input, actor_id: "someone-else" });
  assertActionInput(action.input_schema, { ...input, key: "send.1", mode: "after-run", source: "host" });
  refused({ ...input, about: "" });
  assertActionInput(action.input_schema, { ...input, about: "steer-1" });
});

test("RC-05: a cancelled or revoked call tells the round nothing and keeps nothing in the session", async () => {
  const cancelled = registered();
  await assert.rejects(cancelled.call(input, live(() => {}, async () => { throw new Error("call cancelled"); })), /call cancelled/);
  assert.deepEqual(cancelled.sent, []);
  const revoked = registered();
  await assert.rejects(revoked.call(input, live(() => { throw new Error("activation revoked"); })), /activation revoked/);
  assert.deepEqual(revoked.sent, []);
  // Revoked after the Host's checks but before a supplement whose round ended is kept: the recheck the port runs refuses it.
  const late = registered();
  let checks = 0;
  await assert.rejects(late.call(input, live(() => { if (++checks > 3) throw new Error("revoked before the queue"); })), /revoked before the queue/);
  assert.deepEqual(late.sent, []);
  const fine = registered();
  assert.deepEqual(await fine.call({ ...input, key: "send.9" }, live()), { input_id: "steer-1", replayed: false, delivered: "queued" });
  assert.deepEqual(fine.sent, [{ text: "顺便看日志", key: "send.9", source: "host" }]);
});

test("RC-05: a round of another session is not reachable through this action", async () => {
  const { call, sent } = registered();
  await assert.rejects(call({ ...input, run_id: "foreign-run" }, live()), (error: unknown) => (error as { code?: string }).code === "agent.run_unknown");
  assert.deepEqual(sent, []);
});

const target = { runtime_id: "fixture", session_id: "own-session", run_id: "own-run", input_id: "steer-1" };

test("RCPT-315: agent.inputs.withdraw is a plugin's action, and its schema takes exactly the round and the input", () => {
  const { action } = agentInputActions.withdraw;
  assert.deepEqual(action.audiences, ["plugin"]);
  assert.equal(action.scheduling, "concurrent");
  const refused = (value: unknown) => assert.throws(() => assertActionInput(action.input_schema, value), (error: unknown) => error instanceof ActionError && error.code === "actions.input_invalid");
  refused({ ...target, input_id: "" });
  refused({ runtime_id: "fixture", session_id: "own-session", input_id: "steer-1" });
  refused({ ...target, actor_id: "someone-else" });
  assertActionInput(action.input_schema, target);
});

test("RCPT-315: a cancelled or revoked withdrawal takes nothing back; another session's round is not reachable", async () => {
  const cancelled = registered();
  await assert.rejects(cancelled.withdraw(target, live(() => {}, async () => { throw new Error("call cancelled"); })), /call cancelled/);
  assert.deepEqual(cancelled.withdrawn, []);
  const revoked = registered();
  await assert.rejects(revoked.withdraw(target, live(() => { throw new Error("activation revoked"); })), /activation revoked/);
  assert.deepEqual(revoked.withdrawn, []);
  const foreign = registered();
  await assert.rejects(foreign.withdraw({ ...target, run_id: "foreign-run" }, live()), (error: unknown) => (error as { code?: string }).code === "agent.run_unknown");
  assert.deepEqual(foreign.withdrawn, []);
  // Revoked after the port read the round, before the runtime is asked to give the supplement back: nothing is taken back.
  const late = registered();
  await assert.rejects(late.withdraw(target, live(() => { if (late.read()) throw new Error("revoked before the withdrawal"); })), /revoked before the withdrawal/);
  assert.deepEqual(late.withdrawn, []);
  const fine = registered();
  assert.deepEqual(await fine.withdraw(target, live()), { input_id: "steer-1", from: "queued" });
  assert.deepEqual(fine.withdrawn, ["steer-1"]);
});

test("RCPT-314: a correction reaches the runtime with the input it is about, in a round or in the session's queue", async () => {
  const item = await adapterFor({ steer: () => ({ steerId: "steer-2", replayed: false }) });
  await item.send({ text: "日志只看错误级别", key: "send.a1", about: "steer-1" });
  assert.deepEqual(item.steered.at(-1), { text: "日志只看错误级别", key: "send.a1", about: "steer-1" });
  await item.send({ text: "下一轮只看失败路径", key: "send.a2", mode: "after-run", about: "steer-1" });
  assert.deepEqual(item.queued.at(-1), { session: "session-1", input: { text: "下一轮只看失败路径", key: "send.a2", about: "steer-1" } });
});

test("RCPT-315: the check right before each request to give a supplement back stops it, from the round and from the session", async () => {
  const item = await adapterFor({ steer: () => ({ steerId: "steer-1", replayed: false }) });
  const revoked = () => { throw new Error("activation revoked"); };
  await assert.rejects(item.adapter.inputs.withdraw!(item.ref, "steer-1", revoked), /activation revoked/, "the round still holds it");
  await assert.rejects(item.adapter.inputs.withdraw!(item.ref, "steer-9", revoked), /activation revoked/, "the session holds it");
  assert.deepEqual(item.taken, [], "neither the round nor the session was asked to give anything back");
  let checks = 0;
  assert.deepEqual(await item.adapter.inputs.withdraw!(item.ref, "steer-1", () => { checks++; }), { input_id: "steer-1", from: "run" });
  assert.deepEqual(await item.adapter.inputs.withdraw!(item.ref, "steer-9", () => { checks++; }), { input_id: "steer-9", from: "queued" });
  assert.deepEqual(item.taken, [{ from: "run", id: "steer-1" }, { from: "queued", id: "steer-9" }]);
  assert.equal(checks, 3, "once before the round's write, and again before the session's when the round did not hold it");
});


test("RAC-2642 S-105: the final live handoff guard refuses a withdrawn source before either runtime side effect", async () => {
  const item = await adapterFor({ steer: () => ({ steerId: "must-not-accept", replayed: false }) });
  let checks = 0;
  await assert.rejects(item.send({ text: "来源已失效的正文", key: "signed.withdrawn" }, () => {
    checks++; throw Object.assign(new Error("source withdrawn at handoff"), { code: "RUN_NOT_RUNNING" });
  }), /source withdrawn at handoff/);
  assert.equal(checks, 1, "a guard error is not the runtime saying the run ended, so it never falls back to the queue");
  assert.deepEqual(item.steered, []); assert.deepEqual(item.queued, []);
});
