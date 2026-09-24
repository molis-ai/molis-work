import assert from "node:assert/strict";
import test from "node:test";
import { AgentHost, emptyCapabilityMatrix, registerAgentHostCapabilities, runViewVersion } from "@molis-ai/molis-work-service-agent-host";
import { agentHostCapabilities, type AgentRunView, type AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";

test("following a live round: answers at once when behind, gathers quick deltas, waits until a change or the timeout", async () => {
  const session = { runtime_id: "live", session_id: "s" }, run = { session_id: "s", run_id: "r" };
  let view = { ref: run, phase: "running", turns: [{ turn_id: "a", kind: "assistant", text: "Hel", at: null }], activity: [], usage: { tokens: { input: 1, output: 1 } }, awaiting_input: [] } as unknown as AgentRunView;
  const listeners = new Set<(view: AgentRunView) => void>();
  const capabilities = emptyCapabilityMatrix(); capabilities["session.create"] = "supported";
  const adapter: AgentRuntimeAdapter = {
    descriptor: { runtime_id: "live", display_name: "live", provider_version: "1", capabilities },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    async createSession() { return session; },
    async readSession() { return { session, owner: { board_id: "b", plugin_id: "p", install_id: "i" }, title: "t", runs: [run], latest_run: null }; },
    async start() { throw new Error("unused"); }, async read() { return view; }, async control() {},
    observe(_ref, listener) { listeners.add(listener); listener(view); return () => listeners.delete(listener); },
    async readCommandOutput() { throw new Error("unused"); },
  };
  const host = new AgentHost(); host.register(adapter);
  const handlers = new Map<string, Function>();
  registerAgentHostCapabilities({ register: (definition, handler) => { handlers.set(definition.capability_id, handler); return () => {}; } },
    { agentHost: () => host, boardId: () => "b", authority: () => ({ manifest: { roles: [], prompts: [] }, authorizedDirectories: [] }) });
  const wait = (since: string | null, timeout: number) => handlers.get(agentHostCapabilities.waitRun.capability_id)!({ board_id: "b" }, [session, run, since, timeout]);
  const publish = (text: string) => { view = { ...view, turns: [{ ...view.turns[0]!, text }] }; for (const listener of listeners) listener(view); };

  const first = await wait(null, 5_000);
  assert.equal(first.view.turns[0].text, "Hel", "a caller holding nothing is answered with the current view");
  assert.equal(first.version, runViewVersion(view));

  const started = Date.now(), pending = wait(first.version, 5_000);
  setTimeout(() => publish("Hello"), 30); setTimeout(() => publish("Hello, wo"), 45); setTimeout(() => publish("Hello, world"), 60);
  const next = await pending;
  assert.equal(next.view.turns[0].text, "Hello, world", "deltas arriving together come back as one answer");
  assert.ok(Date.now() - started < 1_000, "it answers when the text changes, not at the timeout");
  assert.equal(listeners.size, 0, "the observer is released after answering");

  const idle = Date.now(), quiet = await wait(next.version, 150);
  assert.equal(quiet.version, next.version, "nothing changed: the same version comes back at the timeout");
  assert.ok(Date.now() - idle >= 140);
});
