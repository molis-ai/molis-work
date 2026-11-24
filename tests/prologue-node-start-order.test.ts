import { attachStartedRound, createRoundState, createSessionMessages, endedOnPromise, watchRoundFacts, watchRoundLifecycle } from "@molis-ai/molis-work-service-agent-host/testing";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));

test("W4-06-01: refusing overlapping child directories leaves no durable plan or credential exchange", { timeout: 15_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-child-plan-refusal-")), parent = join(root, "parent"), storageRoot = join(root, "runtime");
  await mkdir(parent);
  const app = { appId: "io.molis.work.child-plan-refusal", appVersion: "1.0.0" };
  let credentialExchanges = 0;
  const adapter = await createPrologueNodeAdapter({ app, storageRoot, reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => { credentialExchanges++; return "test-only"; } });
  try {
    const host = new AgentHost(); host.register(adapter);
    const manifest = structuredClone(codingAgentManifest), role = manifest.roles.find(role => role.role_id === "coordinator")!;
    role.subagent_workspaces = "required"; role.execution = "read-only";
    role.host_tools = ["read-file", "dispatch-subagent", "await-subagents", "board-read", "board-report"];
    const writer = manifest.prompts?.find(prompt => prompt.prompt_id === "coding-writer");
    assert.ok(writer);
    manifest.subagents!.roles = [{ role_id: writer.prompt_id, version: writer.version, name: "独立写入", execution: "text-edit", host_tools: ["read-file", "write"] }];
    const owner = { project_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: parent, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Refused plan" });
    const plan = { source: { artifact_id: "confirmed-plan", version: 1 }, title: "Confirmed plan", steps: [{ id: "step-1", title: "Inspect", acceptance: "Report the evidence" }] };
    await assert.rejects(host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "Follow the confirmed plan.",
      execution_plan: plan, text_materials: [{ material_id: "plan", title: plan.title, source_artifact_id: plan.source.artifact_id, source_version: 1, text: JSON.stringify(plan) }],
      subagent_workspaces: [{ worktree_id: "outer", directory: { canonical_path: root, realpath_verified: true } }] },
    { manifest, prompts: codingPrompts, authorizedDirectories: [parent], worktrees: async () => [{ worktree_id: "outer", canonical_path: root }] }), /子任务目录必须与主目录及其他子目录互不包含/u);
    assert.equal(credentialExchanges, 0, "the refused launch never reaches model credential exchange");
    assert.deepEqual((await adapter.readSession(session)).runs, [], "no run is recorded for the refused launch");
    await adapter.close();
    const restored = await createRuntime({ app, host: createNodeHost({ storageRoot }), preset: "local-agent" });
    try {
      assert.deepEqual(restored.boards.assignedTo({ kind: "session", id: session.session_id, revision: 1 }), [], "reopening must not reveal a plan admitted before the refused child setup");
    } finally { await restored.shutdown(); }
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});

test("RT-1/2 the Node adapter releases each round once, including a terminal event replayed before setup completes", async () => {
  for (const [type, end, letterEnd] of [
    ["completed", "completed", "completed"], ["failed", "failed", "failed"], ["cancelled", "stopped", "delivered"],
    ["tripped", "stopped", "stopped"], ["circuit-tripped", "stopped", "stopped"],
  ] as const) for (const registration of ["registered", "begin-fails", "handoff-fails", "no-inbox"]) {
    const projectDirectory = registration === "no-inbox" ? undefined : "/tmp/fixture";
    const state = createRoundState(), actionController = new AbortController();
    const runRef = { kind: "run", id: "round", revision: 1 } as const, session = { ref: { kind: "session", id: "holder", revision: 1 } as const };
    const listeners = new Set<(event: { type: string }) => void>();
    const run = { ref: runRef, subscribe(listener: (event: { type: string }) => void) { listeners.add(listener); return () => listeners.delete(listener); } };
    const emit = () => { for (const listener of listeners) listener({ type }); };
    const releases: unknown[] = [], letter = { ref: { id: "question" }, state: "delivered", kind: "request", awaitReply: true };
    let letterEvent = "delivered", note = "";
    const runtime = { readClock: async () => ({ wallTimeMs: 1 }), hooks: { register() {} }, delivery: {
      subscribe() { return () => {}; }, list: (query: { to?: unknown }) => query.to ? [letter] : [],
      respond: () => letter, complete() { letterEvent = "completed"; }, cancel(_ref: unknown, detail: { event: string; note: string }) { letterEvent = detail.event; note = detail.note; },
      flush: async () => {},
    } };
    const messages = createSessionMessages(runtime as never, {} as never);
    const deps = { state, options: {}, messages, index: { update: async () => {} }, surfaces: () => ({ releaseRun: () => releases.push("surface-run") }),
      stepBoards: { follow() {}, unfollow: () => releases.push("board") }, workGraphs: { ended: (_run: unknown, _session: unknown, event: string) => releases.push(["graph", event]) },
      waitsPort: { queueTakenOver: async () => { if (registration === "handoff-fails") throw new Error("handoff unavailable"); } },
      projectWork: { begin: async () => { if (registration === "begin-fails") throw new Error("board unavailable"); return "job"; },
        projectId: async () => "board", end: async (project: string, id: string, phase: string) => { releases.push([project, id, phase]); } } };
    const guard = { reader: "person" as const, writing: true, business: true, task: "", materials: [], runs: new Map([["round", { held: new Set<"announce">(["announce"]), announcedAt: 0 }]]) };
    state.stopGuards.set("holder", guard);
    watchRoundFacts(state, run, true);
    const input = { session_id: "holder", queued_work_id: "job" };
    const at = { session, started: { run, control: { state: "running" } }, actionController, attemptIndex: 0, stepBoard: { ref: { id: "board" } },
      projectDirectory, project: "project", hasActions: true, scopePaths: [],
      surface: { noteRun() {}, release: async (phase: string) => { releases.push(["surface", phase]); } },
      actionReviews: { releaseRun: () => true }, codeIntelligence: { close: async () => { releases.push("lsp"); } }, onAborted() {} };
    const lifecycle = watchRoundLifecycle(deps as never, input as never, at as never);
    emit();
    await attachStartedRound(deps as never, input as never, { title: "fixture" } as never, at as never);
    assert.equal(state.liveSessions.get("holder"), projectDirectory ? "round" : undefined);
    const workStarted = registration === "registered" || registration === "handoff-fails";
    assert.equal(state.runWork.has("round"), workStarted, registration);
    lifecycle.markReady(); emit(); lifecycle.dispose("cancelled");
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(releases, ["lsp", "board", ["graph", type], ["surface", end], "surface-run", ...(workStarted ? [["project", "job", end]] : [])], type);
    assert.equal(actionController.signal.aborted, true);
    assert.deepEqual([state.liveSessions.size, state.runWork.size, state.activeRuns.size, state.runRefs.size, state.actionControllers.size], [0, 0, 0, 0, 0]);
    if (type === "completed") assert.equal(endedOnPromise(state, "round", "holder"), true, "the completed view consumes its final guard facts");
    assert.deepEqual([state.roundFacts.size, guard.runs.size], [0, 0]);
    assert.equal(letterEvent, projectDirectory ? letterEnd : "delivered", registration);
    if (projectDirectory && type === "tripped") assert.match(note, /护栏叫停/);
    if (projectDirectory && type === "circuit-tripped") assert.match(note, /连续尝试没有进展/);
  }
});
