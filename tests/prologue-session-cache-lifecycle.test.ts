import assert from "node:assert/strict";
import test from "node:test";
import { AgentHost, AgentReviewQueue, PrologueAgentAdapter, registerAgentHostCapabilities, type PrologueRuntimePort, type PrologueEvent } from "@molis-ai/molis-work-service-agent-host";
import { agentHostCapabilities, agentSessionLifecycleActions, type AgentReviewRequest, type AgentSessionLifecycle, type AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { HostCapabilityDefinition, HostCapabilityInvocation } from "@molis-ai/molis-work-contracts/platform/app-host";

const owner = { project_id: "project", plugin_id: "business", install_id: "installation", actor_id: "person" };
const session = { runtime_id: "prologue", session_id: "target" };
const other = { runtime_id: "prologue", session_id: "other" };
const original = { operation_id: "purge-original", expected_version: 1, expected_state: "active" as const };
const preview = { session, version: 1, state: "active" as const, runs: 0, resources: 0, destroys_key: true };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };

// The Node/SQLite suite exercises the lifecycle owner. These public adapter tests hold the external read port across
// that owner's completion, including a transport delivering an event even after its unsubscribe was called.
for (const operation of ["restore", "status", "original"] as const) {
  test(`late ${operation} cannot return deleted content or refill the public adapter cache`, async t => {
    const entered = deferred(), release = deferred(), purged = new Set<string>();
    const wait = async () => { entered.resolve(); await release.promise; };
    const runtime: PrologueRuntimePort = {
      sessions: {
        create: async () => { throw new Error("not used"); },
        assertReadable: async id => { if (purged.has(id)) throw new Error("Session permanently unavailable"); },
        restore: async id => { if (id === session.session_id && operation === "restore") await wait(); return { title: "PRIVATE HISTORY", owner, workspace: "none", runs: [] }; },
        readStatus: async () => { await wait(); return { owner }; },
        readOriginalInput: async ref => { await wait(); return { original: { ref, text: "PRIVATE ORIGINAL", written_by: "person", occurred_at: "2026-10-24T00:00:00Z" }, accepted_run: { session_id: ref.session_id, run_id: "run" } }; },
        lifecycle: lifecycle(purged),
      },
      startAgentRun: async () => { throw new Error("no execution from reads"); }, shutdown: async () => {},
    };
    const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => null });
    t.after(async () => { release.resolve(); await adapter.close(); });
    const pending = operation === "restore" ? adapter.readSession(session) : operation === "status" ? adapter.readSessionStatus(session)
      : adapter.readOriginalInput({ session_id: session.session_id, input_id: "original", version: 1 });
    const rejected = assert.rejects(pending, /生命周期已变化/);
    await entered.promise;
    await adapter.sessionLifecycle!.purge(session, original, preview, owner);
    release.resolve(); await rejected;
    await assert.rejects(adapter.readSession(session), /permanently unavailable/);
    assert.equal((await adapter.readSession(other)).title, "PRIVATE HISTORY");
  });
}

test("public command-output action refuses stdout and stderr read across purge even while caller authority stays current", async t => {
  const entered = deferred(), release = deferred(), purged = new Set<string>();
  const frozen = { role_id: "reader", role_version: 1, execution: "read-only" as const, workspace: "none" as const, model_id: "fixture", prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null };
  const runtime: PrologueRuntimePort = {
    sessions: { create: async () => { throw new Error("not used"); }, lifecycle: lifecycle(purged),
      assertReadable: async id => { if (purged.has(id)) throw new Error("Session permanently unavailable"); },
      restore: async id => ({ title: "Command history", owner, workspace: "none", runs: [{ ref: { session_id: id, run_id: `${id}-run` }, frozen,
        task: "Read", started_at: "2026-10-24T00:00:00Z", terminal: true, events: [{ type: "completed" }] }] }),
    },
    readCommandOutput: async (id, ref) => {
      if (id === session.session_id) { entered.resolve(); await release.promise; }
      return { ref, command: "printf", stdout: `PRIVATE STDOUT ${id}`, stderr: `PRIVATE STDERR ${id}`, exit_code: 0, truncated: false, timed_out: false, cancelled: false };
    }, startAgentRun: async () => { throw new Error("reads do not execute"); }, shutdown: async () => {},
  };
  const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => null }), host = new AgentHost(); host.register(adapter);
  const handlers = new Map<string, (input: unknown, invocation: HostCapabilityInvocation) => Promise<unknown>>();
  const off = registerAgentHostCapabilities({ register<I, O>(definition: HostCapabilityDefinition<I, O>, handler: (context: null, input: I, invocation: HostCapabilityInvocation) => O | Promise<O>) {
    handlers.set(definition.capability_id, async (input, invocation) => handler(null, input as I, invocation)); return () => {};
  } }, { agentHost: () => host, projectId: () => owner.project_id, authority: () => ({ manifest: { roles: [] }, authorizedDirectories: [] }) });
  const invocation: HostCapabilityInvocation = { consumer: "plugin", plugin: { ...owner, declaration: { manifest: {} as never }, assertActive: () => {} }, beforeEffect: async () => {}, assertAuthorityCurrent: () => {} };
  const call = async <I, O>(definition: HostCapabilityDefinition<I, O>, input: I): Promise<O> => await handlers.get(definition.capability_id)!(input, invocation) as O;
  t.after(async () => { release.resolve(); off(); await adapter.close(); });
  const pending = call(agentHostCapabilities.readCommandOutput, [session, { run_id: "target-run", call_id: "command" }]);
  const rejected = assert.rejects(pending, /生命周期已变化/);
  await entered.promise;
  await call(agentSessionLifecycleActions.purge, { session, decision: original, preview });
  release.resolve(); await rejected;
  await assert.rejects(call(agentHostCapabilities.readCommandOutput, [session, { run_id: "target-run", call_id: "command" }]), /permanently unavailable/);
  const unaffected = await call(agentHostCapabilities.readCommandOutput, [other, { run_id: "other-run", call_id: "command" }]);
  assert.equal(unaffected.stdout, "PRIVATE STDOUT other"); assert.equal(unaffected.stderr, "PRIVATE STDERR other");
});

test("a late terminal observer cannot republish a purged Session and purge does not close another Session", async t => {
  const purged = new Set<string>(); let emit: (event: PrologueEvent) => void = () => {}, detached = 0, shutdown = 0;
  const runtime: PrologueRuntimePort = { workspaceNone: true,
    sessions: { create: async input => ({ ref: { id: input.title } }), assertReadable: async id => { if (purged.has(id)) throw new Error("permanently unavailable"); }, lifecycle: lifecycle(purged) },
    startAgentRun: async () => ({ run: { ref: { id: "run" }, subscribe: listener => { emit = listener; return () => { detached++; }; }, cancel: async () => { throw new Error("lifecycle must not cancel"); } },
      control: { state: "running", stop: () => { throw new Error("lifecycle must not stop"); }, pause: () => {}, resume: () => {}, steer: () => {}, subscribe: () => () => {} } }),
    shutdown: async () => { shutdown++; },
  };
  const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://fixture.invalid", model: "fixture", credential_ref: "fixture" }) });
  t.after(() => adapter.close());
  await adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: session.session_id });
  await adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: other.session_id });
  const run = await adapter.start({ ...owner, session, workspace: "none", task: "Read", role_id: "reader", role: { role_id: "reader", version: 1, workspace: "none", execution: "read-only", host_tools: [], prompts: [] } });
  await assert.rejects(adapter.sessionLifecycle!.purge(session, original, preview, owner), /当前执行/);
  assert.equal(detached, 0); assert.equal(purged.size, 0);
  emit({ type: "completed" });
  let notifications = 0; adapter.observe(run.ref, () => { notifications++; });
  await adapter.sessionLifecycle!.purge(session, original, preview, owner);
  const previous = notifications;
  emit({ type: "text-delta", text: "LATE SECRET" }); emit({ type: "completed" });
  assert.equal(notifications, previous); assert.equal(detached, 1); assert.equal(shutdown, 0);
  await assert.rejects(adapter.read(run.ref));
  assert.equal((await adapter.readSession(other)).title, other.session_id);
});

test("released review handlers cannot restore a standing approval or return old recovery content", async () => {
  const queue = new AgentReviewQueue(), released = deferred(), entered = deferred();
  const request = command("original"); queue.request(request);
  queue.registerDecisionHandler(request.review_id, async input => {
    queue.decide(input); queue.consumeApproval(input.review_id); const receipt = queue.settle(input.review_id, { ok: true });
    entered.resolve(); await released.promise; return receipt;
  });
  const responding = assert.rejects(queue.respond({ review_id: request.review_id, decision: "approve", actor_id: owner.actor_id, remember: "session" }), /原审查已释放/);
  await entered.promise;
  queue.forgetSession({ ...owner, session_id: session.session_id }); released.resolve(); await responding;
  const next = command("next"); queue.request(next); let approvals = 0;
  queue.registerDecisionHandler(next.review_id, async input => { approvals++; return queue.decide(input); });
  await Promise.resolve(); assert.equal(approvals, 0); assert.equal(queue.receipt(next.review_id)?.status, "pending");
  const inspecting = deferred(), finish = deferred();
  queue.registerRecoveryHandler(next.review_id, { inspect: async () => { inspecting.resolve(); await finish.promise; return { review_id: next.review_id, receipt: queue.receipt(next.review_id)!, observation: null, can_confirm_not_happened: false, message: "PRIVATE RECOVERY" }; }, resolve: async () => { throw new Error("not used"); } });
  const recovery = assert.rejects(queue.inspectRecovery(next.review_id, async () => { throw new Error("not used"); }), /原审查已释放/);
  await inspecting.promise; queue.forgetSession({ ...owner, session_id: session.session_id }); finish.resolve(); await recovery;
});

function command(review_id: string): AgentReviewRequest {
  return { review_id, project_id: owner.project_id, plugin_id: owner.plugin_id, run: { session_id: session.session_id, run_id: "run" }, kind: "command",
    document: { kind: "command", command: "printf", args: ["hello"], cwd: ".", env_allowlist: [], timeout_ms: 1000, escalate: false }, requested_at: "2026-10-24T00:00:00Z", expires_at: null };
}

function lifecycle(purged: Set<string>): AgentSessionLifecycle {
  return { read: async target => ({ session: target, state: purged.has(target.session_id) ? "purged" : "active", version: 1 }),
    previewPurge: async target => ({ ...preview, session: target }), archive: async () => { throw new Error("not used"); }, unarchive: async () => { throw new Error("not used"); },
    purge: async (target: AgentSessionRef, decision) => { purged.add(target.session_id); return { scope: "agent-host-session", session: target, operation_id: decision.operation_id, action: "purge", state: "purged", version: 3 }; } };
}
