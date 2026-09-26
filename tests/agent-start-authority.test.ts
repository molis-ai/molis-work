import assert from "node:assert/strict";
import test from "node:test";
import { AgentHost } from "../horizontal/agent-host/src/index.js";
import { registerAgentHostCapabilities } from "../horizontal/agent-host/src/capability-registration.js";
import { PrologueAgentAdapter, type PrologueRuntimePort } from "../horizontal/agent-host/src/adapters/prologue.js";
import { CliAgentAdapter } from "../horizontal/agent-host/src/adapters/cli-runtime.js";
import { emptyCapabilityMatrix } from "../horizontal/agent-host/src/capabilities.js";
import { agentHostCapabilities, type AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";

const owner = { board_id: "board", plugin_id: "unknown.plugin", install_id: "install", actor_id: "actor" };
const directory = { canonical_path: "/authorized", realpath_verified: true as const };
const manifest = { roles: [{ role_id: "reader", version: 1, name: "Reader", execution: "read-only" as const, host_tools: [] }], prompts: [] };
function deferred() { let resolve = () => {}; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

test("typed Agent validation and execution use the same snapshot when a Plugin hook mutates its references", async () => {
  const host = new AgentHost(), handlers = new Map<string, Function>();
  const session = { runtime_id: "fixture", session_id: "own-session" }, run = { session_id: "own-session", run_id: "own-run" };
  let controlled: unknown, checks = 0;
  const adapter = { descriptor: { runtime_id: "fixture", display_name: "Fixture", provider_version: "1", capabilities: emptyCapabilityMatrix() },
    async readSession(ref) { assert.equal(ref.session_id, "own-session"); return { session: ref, owner, title: "Owned", runs: [{ session_id: "own-session", run_id: "own-run" }], latest_run: null }; },
    async control(ref) { controlled = structuredClone(ref); },
  } as AgentRuntimeAdapter;
  host.register(adapter);
  registerAgentHostCapabilities({ register(definition, handler) { handlers.set(definition.capability_id, handler); return () => {}; } },
    { agentHost: () => host, boardId: () => owner.board_id, authority: () => ({ manifest, authorizedDirectories: [directory.canonical_path] }) });
  const invocation = { consumer: "plugin" as const, plugin: { ...owner, project_id: "project", assertActive() {}, declaration: { manifest: {} as never } },
    async beforeEffect() { if (++checks === 3) { session.session_id = "foreign-session"; run.session_id = "foreign-session"; run.run_id = "foreign-run"; } } };
  await handlers.get(agentHostCapabilities.controlRun.capability_id)!({}, [session, run, { kind: "cancel" }], invocation);
  assert.equal(checks, 3);
  assert.equal(run.run_id, "foreign-run", "the attack actually changed the original input");
  assert.deepEqual(controlled, { session_id: "own-session", run_id: "own-run" });
});

for (const kind of ["prologue", "cli"] as const) test(`${kind} rechecks Host authority after delayed model selection without dispatching or creating a run`, async () => {
  const entered = deferred(), release = deferred(); let active = true, dispatched = 0;
  const select = async () => { entered.resolve(); await release.promise; return "fixture-model"; };
  const runtime: PrologueRuntimePort = { sessions: { async create() { return { ref: { id: "session" } }; } },
    async startAgentRun(input) { dispatched++; assert.equal(typeof input.beforeStart, "function"); throw new Error("authorized dispatch sentinel"); }, async shutdown() {} };
  const adapter = kind === "prologue" ? new PrologueAgentAdapter({ runtime, async modelConfiguration() { return { protocol: "anthropic-compatible", endpoint: "https://model.example/v1/messages", model: await select(), credential_ref: "fixture" }; } })
    : new CliAgentAdapter({ runtime_id: "cli", display_name: "CLI", command: "fixture", model: select,
      process: { async version() { return "1"; }, spawn() { dispatched++; throw new Error("authorized dispatch sentinel"); } } });
  const host = new AgentHost(); host.register(adapter);
  const session = await adapter.createSession({ ...owner, directory, title: "Owned" });
  const request = { ...owner, session, directory, task: "Read supplied context", role_id: "reader" };
  const authority = { manifest, authorizedDirectories: [directory.canonical_path], beforeStart() { if (!active) throw new Error("installation revoked"); } };
  const pending = host.start(adapter.descriptor.runtime_id, request, authority);
  const rejected = assert.rejects(pending, /installation revoked/);
  await entered.promise; active = false; release.resolve(); await rejected;
  assert.equal(dispatched, 0);
  assert.deepEqual((await adapter.readSession(session)).runs, []);
  active = true;
  await assert.rejects(host.start(adapter.descriptor.runtime_id, request, authority), /authorized dispatch sentinel/);
  assert.equal(dispatched, 1, "the original owner can retry after a denied startup");
});

test("a returned typed start keeps only explicit dispatch authority and the original activation", async () => {
  for (const explicit of [false, true]) {
    const host = new AgentHost(), handlers = new Map<string, Function>();
    const session = { runtime_id: "fixture", session_id: "owned" }; let active = true, invocationActive = true, checks = 0;
    let execution: import("@molis-ai/molis-work-contracts/services/agent-host").AgentStartExecution | undefined;
    host.register({ descriptor: { runtime_id: "fixture", display_name: "Fixture", provider_version: "1", capabilities: emptyCapabilityMatrix() },
      async readSession() { return { session, owner, title: "Owned", runs: [], latest_run: null }; },
      async start(request, guards) { execution = guards; return { ref: { session_id: session.session_id, run_id: "run" }, frozen: {
        role_id: "reader", role_version: 1, execution: "read-only", prompts: [], skills: [], host_tools: [], mcp_tools: [], mcp_sources: [],
        text_materials: [], budget: null, directory, model_id: "fixture",
      } }; },
    } as AgentRuntimeAdapter);
    registerAgentHostCapabilities({ register(definition, handler) { handlers.set(definition.capability_id, handler); return () => {}; } },
      { agentHost: () => host, boardId: () => owner.board_id, authority: () => ({ manifest, authorizedDirectories: [directory.canonical_path],
        beforeStart() { assert.ok(invocationActive, "startup callback must not survive as a network callback"); },
        ...(explicit ? { beforeDispatch() { checks++; } } : {}),
      }) });
    const invocation = { consumer: "plugin" as const, plugin: { ...owner, project_id: "project", declaration: { manifest: {} as never }, assertActive() { if (!active) throw new Error("activation revoked"); } },
      async beforeEffect() { assert.ok(invocationActive); } };
    await handlers.get(agentHostCapabilities.startRun.capability_id)!({}, ["fixture", { ...owner, directory, session, role_id: "reader", task: "Read" }], invocation);
    invocationActive = false;
    await execution!.beforeDispatch!(); assert.equal(checks, explicit ? 1 : 0);
    active = false; await assert.rejects(async () => execution!.beforeDispatch!(), /activation revoked/);
  }
});
