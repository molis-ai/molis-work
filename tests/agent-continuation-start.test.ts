import assert from "node:assert/strict";
import test from "node:test";
import type { AgentContinuationStartAnswer, AgentContinuationStartRequest, AgentContinuationStarter } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { HOST_AGENT_CONTINUATION_READY_EVENT } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { agentContinuationStarts, continuationForwarder } from "@molis-ai/molis-work-app-local-host";
import { createCollaborationHost, createContinuationStarts } from "../horizontal/agent-host/dist/adapters/prologue-collaboration.js";

// specs/work-line/spec.md, result return (user decisions 2026-11-15): the runtime asks the Home's one starter to start a continuation
// that may go on by itself; the Assistant starts its own sessions, a plugin's are told to the installation that owns them.

const OWNER = { project_id: "p", plugin_id: "io.molis.work.coding", install_id: "install-coding" };
const asked = (session = "s1", key = "k1") => ({ continuation: { target: { session: { kind: "session", id: session } }, requestKey: key, wait: { ref: { kind: "wait", id: "w1" } } },
  scope: { board: "g1", node: "n1" } }) as never;
const checks = { forRun: () => undefined } as never;
/** The installation a session belongs to, as a start request names it. */
const PLUGIN = { plugin_id: OWNER.plugin_id, install_id: OWNER.install_id };

test("S-continuation-start the runtime's start ask names the owner the session index holds, and no owner is asked for a session the index does not know", async () => {
  const owners = new Map([["s1", OWNER]]);
  const starts = createContinuationStarts(async id => owners.get(id));
  const host = createCollaborationHost(checks, starts);
  // Nothing served yet: the continuation stays eligible for the next round.
  assert.deepEqual(await host.startContinuation!(asked()), { later: { code: "agent.continuation_no_starter" } });
  const heard: AgentContinuationStartRequest[] = [];
  let during: boolean | undefined;
  const withdraw = starts.serve(async request => { heard.push(request); during = starts.starting.has(request.request_key); return { run: { run_id: "r9", session_id: request.session_id } }; });
  // A session nobody owns on the record is refused before any starter is asked.
  assert.deepEqual(await host.startContinuation!(asked("gone")), { refused: { code: "agent.continuation_unknown", note: "接着做的会话已经不在了" } });
  assert.equal(heard.length, 0, "the starter was not asked for a session the index does not know");
  assert.deepEqual(await host.startContinuation!(asked()), { run: { kind: "run", id: "r9", revision: 1 } });
  assert.deepEqual(heard, [{ runtime_id: "prologue", project_id: "p", session_id: "s1", owner: { plugin_id: OWNER.plugin_id, install_id: OWNER.install_id },
    request_key: "k1", wait_id: "w1", graph_id: "g1", node_id: "n1" }], "the owner comes from the session index");
  assert.equal(during, true, "while the Host starts it, the next round of that session binds to the continuation");
  assert.equal(starts.starting.has("k1"), false, "and once answered it is no longer marked");
  // A starter's answer is recorded bounded.
  starts.serve(async () => ({ refused: { code: "x".repeat(100), note: "y".repeat(300) } }));
  const refused = await host.startContinuation!(asked()) as { refused: { code: string; note: string } };
  assert.deepEqual([refused.refused.code.length, refused.refused.note.length], [64, 200]);
  withdraw();
});

/** An Agent Host as the hub sees it: which runtimes are registered, and the one starter each serves. */
function fakeHost() {
  const runtimes: string[] = [], served: AgentContinuationStarter[] = [];
  const host = {
    descriptors: () => runtimes.map(runtime_id => ({ runtime_id })),
    adapter: (id: string) => { if (!runtimes.includes(id)) throw new Error(`no runtime ${id}`); return { collaboration: { serveStarts: (starter: AgentContinuationStarter) => { served.push(starter); return () => {}; } } }; },
  } as unknown as AgentHost;
  return { host, runtimes, served, ask: (request: AgentContinuationStartRequest) => served.at(-1)!(request) };
}
const request = (owner: { plugin_id: string; install_id: string }, project_id = "p"): AgentContinuationStartRequest => ({ runtime_id: "prologue", project_id, session_id: "s1", owner,
  request_key: "k1", wait_id: "w1", graph_id: "g1", node_id: "n1" });

test("the Home serves its starter once the runtime is there, however many times it is asked for", () => {
  const { host, runtimes, served } = fakeHost();
  const hub = agentContinuationStarts(host);
  assert.equal(served.length, 0, "no runtime yet: nothing served, nothing thrown (a project's plugins still start)");
  runtimes.push("prologue");
  assert.equal(agentContinuationStarts(host), hub, "one hub per Agent Host");
  assert.equal(served.length, 1, "served as soon as the runtime registered");
  agentContinuationStarts(host);
  assert.equal(served.length, 1, "and only once");
});

test("S-continuation-start a plugin's continuation is told only to the projects that own it, and the Assistant's only to a served Assistant", async () => {
  const { host, runtimes, ask } = fakeHost();
  runtimes.push("prologue");
  const hub = agentContinuationStarts(host);
  const assistant = { plugin_id: ASSISTANT_PLUGIN_ID, install_id: "assistant" };
  assert.deepEqual(await ask(request(assistant, "assistant-personal")), { later: { code: "assistant.not_attached" } });
  const withdraw = hub.serveAssistant(async () => ({ run: { run_id: "r1", session_id: "s1" } }) satisfies AgentContinuationStartAnswer);
  assert.deepEqual(await ask(request(assistant, "assistant-personal")), { run: { run_id: "r1", session_id: "s1" } });
  withdraw();
  assert.deepEqual(await ask(request(assistant, "assistant-personal")), { later: { code: "assistant.not_attached" } }, "withdrawn, the Assistant starts nothing");
  // A plugin's session: its project is told, another project is not, and the answer is `later` (the plugin starts its round itself).
  assert.deepEqual(await ask(request(PLUGIN)), { later: { code: "agent.continuation_owner_not_running" } });
  const inP: AgentContinuationStartRequest[] = [], inQ: AgentContinuationStartRequest[] = [];
  const stopP = hub.observeProject("p", heard => inP.push(heard)); hub.observeProject("q", heard => inQ.push(heard));
  assert.deepEqual(await ask(request(PLUGIN)), { later: { code: "agent.continuation_app_starts", note: "插件自己接着做" } });
  assert.deepEqual([inP.length, inQ.length], [1, 0], "another project's plugins hear nothing of it");
  // A project's fault stays its own.
  hub.observeProject("p", () => { throw new Error("broken listener"); });
  assert.deepEqual(await ask(request(PLUGIN)), { later: { code: "agent.continuation_app_starts", note: "插件自己接着做" } });
  stopP();
  await ask(request(PLUGIN));
  assert.equal(inP.length, 2, "a stopped listener hears nothing more");
});

test("S-continuation-start the forwarder addresses host.agent.continuation.ready@1 to the installation that owns the session, and nothing after it stops", () => {
  const sent: Array<{ recipient: unknown; input: { event_type_id: string; payload: unknown; correlation_id: unknown } }> = [];
  const forwarder = continuationForwarder({ notify: (recipient, input) => { sent.push({ recipient, input: input as never }); return true; } });
  let listener: ((request: AgentContinuationStartRequest) => void) | undefined;
  const observe = (next: (request: AgentContinuationStartRequest) => void) => { listener = next; return () => { listener = undefined; }; };
  forwarder.update(observe);
  listener!(request(PLUGIN));
  assert.deepEqual(sent, [{ recipient: { plugin_id: OWNER.plugin_id, install_id: OWNER.install_id },
    input: { event_type_id: HOST_AGENT_CONTINUATION_READY_EVENT, type_version: 1, payload: { runtime_id: "prologue", session_id: "s1", request_key: "k1", wait_id: "w1" }, correlation_id: "k1" } }],
    "addressed to the owner alone; the payload names no project, owner or other session");
  forwarder.stop();
  assert.equal(listener, undefined, "stopping lets go of the port");
});
