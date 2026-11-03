import assert from "node:assert/strict";
import test from "node:test";
import { AgentHost, emptyCapabilityMatrix, registerAgentHostCapabilities, runViewVersion } from "@molis-ai/molis-work-service-agent-host";
import { agentHostCapabilities, type AgentRunView, type AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";

/** The plugin whose session the fixtures' round is in, as the Host issued its caller. */
const owningPlugin = { project_id: "b", plugin_id: "p", install_id: "i", actor_id: "user", assertActive() {}, declaration: {} };

test("following a live round: answers at once when behind, gathers quick deltas, waits until a change or the timeout", async () => {
  const session = { runtime_id: "live", session_id: "s" }, run = { session_id: "s", run_id: "r" };
  let view = { ref: run, phase: "running", turns: [{ turn_id: "a", kind: "assistant", text: "Hel", at: null }], activity: [], usage: { tokens: { input: 1, output: 1 } }, awaiting_input: [] } as unknown as AgentRunView;
  const listeners = new Set<(view: AgentRunView) => void>();
  const capabilities = emptyCapabilityMatrix(); capabilities["session.create"] = "supported";
  const adapter: AgentRuntimeAdapter = {
    descriptor: { runtime_id: "live", display_name: "live", provider_version: "1", capabilities },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    async createSession() { return session; },
    async readSession() { return { session, owner: { project_id: "b", plugin_id: "p", install_id: "i", actor_id: "user" }, title: "t", runs: [run], latest_run: null }; },
    async start() { throw new Error("unused"); }, async read() { return view; }, async control() {},
    observe(_ref, listener) { listeners.add(listener); listener(view); return () => listeners.delete(listener); },
    async readCommandOutput() { throw new Error("unused"); },
  };
  const host = new AgentHost(); host.register(adapter);
  const handlers = new Map<string, Function>();
  registerAgentHostCapabilities({ register: (definition, handler) => { handlers.set(definition.capability_id, handler); return () => {}; } },
    { agentHost: () => host, projectId: () => "b", authority: () => ({ manifest: { roles: [], prompts: [] }, authorizedDirectories: [] }) });
  // Following a round is a plugin's own action (R8): the call carries the caller the Host issued the session's plugin.
  const asPlugin = { consumer: "plugin", plugin: owningPlugin, beforeEffect: async () => {}, assertAuthorityCurrent: () => {} };
  const wait = (since: string | null, timeout: number) => handlers.get(agentHostCapabilities.waitRun.capability_id)!({ project_id: "b" }, [session, run, since, timeout], asPlugin);
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

  // A round waiting on a question comes back resolved, so the question stays answerable in the page.
  const raw = { pending_id: "q", pending_revision: 1, kind: "questionnaire", prompt: "选哪种？", options: [], allows_free_text: false, answerable: false, unavailable_reason: "正在读取原问题" };
  const resolved = { ...raw, answerable: true, unavailable_reason: undefined, questions: [{ prompt: "选哪种？", options: ["a", "b"] }] };
  adapter.read = async () => ({ ...view, phase: "awaiting-input", awaiting_input: [resolved] }) as never;
  const asking = wait(next.version, 5_000);
  setTimeout(() => { view = { ...view, phase: "awaiting-input", awaiting_input: [raw] } as never; for (const listener of listeners) listener(view); }, 20);
  const asked = await asking;
  assert.equal(asked.view.awaiting_input[0].answerable, true);
  assert.equal(asked.view.awaiting_input[0].questions.length, 1);

  const idle = Date.now(), quiet = await wait(asked.version, 150);
  assert.equal(quiet.version, asked.version, "nothing changed: the same version comes back at the timeout");
  assert.ok(Date.now() - idle >= 140);
});

test("a cancelled wait lets go at once: following a round and waiting for continuations both end when the call's signal aborts", async () => {
  const session = { runtime_id: "live", session_id: "s" }, run = { session_id: "s", run_id: "r" };
  const view: AgentRunView = { ref: run, phase: "running", turns: [], activity: [], usage: { tokens: { input: 0, output: 0 } }, awaiting_input: [] } as never;
  const listeners = new Set<(view: AgentRunView) => void>(), heard: Array<AbortSignal | undefined> = [];
  const capabilities = emptyCapabilityMatrix(); capabilities["session.create"] = "supported";
  const adapter: AgentRuntimeAdapter = {
    descriptor: { runtime_id: "live", display_name: "live", provider_version: "1", capabilities },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    async createSession() { return session; },
    async readSession() { return { session, owner: { project_id: "b", plugin_id: "p", install_id: "i", actor_id: "user" }, title: "t", runs: [run], latest_run: null }; },
    async start() { throw new Error("unused"); }, async read() { return view; }, async control() {},
    observe(_ref, listener) { listeners.add(listener); listener(view); return () => listeners.delete(listener); },
    async readCommandOutput() { throw new Error("unused"); },
    collaboration: {
      async read() { return []; }, async control() { throw new Error("unused"); }, async revise() { throw new Error("unused"); },
      awaitReady: (_project, timeoutMs, _exclude, signal) => new Promise(resolve => {
        heard.push(signal);
        const timer = setTimeout(() => resolve([]), timeoutMs);
        signal?.addEventListener("abort", () => { clearTimeout(timer); resolve([]); }, { once: true });
      }),
    },
  };
  const host = new AgentHost(); host.register(adapter);
  const handlers = new Map<string, Function>();
  registerAgentHostCapabilities({ register: (definition, handler) => { handlers.set(definition.capability_id, handler); return () => {}; } },
    { agentHost: () => host, projectId: () => "b", authority: () => ({ manifest: { roles: [], prompts: [] }, authorizedDirectories: [] }) });
  // As the Host's typed invocation does: a call whose signal aborted is no longer current.
  const invocation = (signal: AbortSignal) => ({ signal, consumer: "plugin", plugin: owningPlugin, beforeEffect: async () => {}, assertAuthorityCurrent: () => signal.throwIfAborted() });
  const closing = new Error("project closing");

  const following = new AbortController(), started = Date.now();
  const pending = handlers.get(agentHostCapabilities.waitRun.capability_id)!({ project_id: "b" }, [session, run, runViewVersion(view), 25_000], invocation(following.signal));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(listeners.size, 1, "the wait follows the round");
  following.abort(closing);
  await assert.rejects(pending, error => error === closing);
  assert.ok(Date.now() - started < 1_000, "it ends when cancelled, not at its 25 s timeout");
  assert.equal(listeners.size, 0, "the cancelled wait lets go of the round");

  const awaiting = new AbortController(), begun = Date.now();
  const ready = handlers.get(agentHostCapabilities.awaitContinuations.capability_id)!({ project_id: "b" }, ["live", 25_000, []], invocation(awaiting.signal));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(heard[0], awaiting.signal, "the call's signal reaches the runtime's wait");
  awaiting.abort(closing);
  await assert.rejects(ready, error => error === closing);
  assert.ok(Date.now() - begun < 1_000, "waiting for continuations ends when cancelled, not at its 25 s timeout");
});
