import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { syncBuiltinESMExports } from "node:module";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionClient, PluginBackgroundClient, PluginKeptJob, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, type AgentSessionStatus } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentCollaborationActions as collaboration } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { memoryLearningEnqueueAction } from "@molis-ai/molis-work-contracts/services/memory";
import { createCodingPlugin, codingManifest, CODING_PROJECT_DATABASE, CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { memoryPluginDatabase } from "./fixtures/plugin-database.js";

test("Coding observation drains every pending reference in bounded rounds, notices a newer completed run and recovers without a persistent cursor", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  syncBuiltinESMExports(); // Node's timer mock otherwise leaves the production named ESM import pointing at the real clock.
  const database = memoryPluginDatabase(CODING_PROJECT_DATABASE.schema, ["project"]), sessions = new CodingSessionStore(database);
  const jobs: PluginKeptJob[] = [];
  t.after(async () => { for (const job of jobs) job.cancel(); await Promise.allSettled(jobs.map(job => job.done)); database.close();
    t.mock.timers.reset(); syncBuiltinESMExports(); });
  await sessions.create(async () => {}, { project_id: "project", session_id: "business-session", title: "Coding", runtime_id: "prologue", at: new Date().toISOString() });
  await sessions.setRuntimeSession(async () => {}, "project", "business-session", "runtime-session", new Date().toISOString());
  let refs = Array.from({ length: 40 }, (_, n) => ({ session_id: "runtime-session", run_id: `run-${n}` }));
  let reads = 0, denied = false, failure = true;
  const attempted: string[] = [], handled = new Set<string>();
  let status: AgentSessionStatus = { session_id: "runtime-session", latest_run_id: "run-39", latest_phase: "completed", recovery: false, checkpoint_busy: false };
  const actions: PluginActionClient = {
    availability: () => ({ available: true }), discover: async () => [], invokeQuery: async () => { throw new Error("no query delegation in this job"); },
    async invoke<Input, Output>(definition: ActionDefinition<Input, Output>, input: Input, control?: Parameters<PluginActionClient["invoke"]>[2]): Promise<Output> {
      await control?.beforeEffect(); control?.assert_authority_current?.();
      if (definition.capability_id === agent.readSessionStatuses.capability_id) return [status] as Output;
      if (definition.capability_id === agent.readBackground.capability_id) return [] as Output;
      if (definition.capability_id === collaboration.read.capability_id) return { sessions: [] } as Output;
      if (definition.capability_id === agent.readSession.capability_id) { reads++; return { runs: refs } as Output; }
      assert.equal(definition.capability_id, memoryLearningEnqueueAction.capability_id);
      const { run_id } = input as { run_id: string }; attempted.push(run_id);
      if (run_id === "run-16" && failure) { failure = false; throw new Error("temporary failure"); }
      const existing = handled.has(run_id); handled.add(run_id); return { status: existing ? "existing" : "queued" } as Output;
    },
  };
  const background: PluginBackgroundClient = {
    start: async () => { throw new Error("no foreground execution in this observation fixture"); },
    keep(job, work) {
      const controller = new AbortController(), cancel = () => controller.abort();
      const current = () => controller.signal.throwIfAborted();
      // This Host dispatches the real observation job. The unrelated wake consumer stays parked.
      const done = job === "observe" ? work({ job, signal: controller.signal, project_id: "project", beforeEffect: async () => current(), assert_authority_current: current })
        : new Promise<void>(resolve => controller.signal.addEventListener("abort", () => resolve(), { once: true }));
      const kept = { done, cancel }; jobs.push(kept); return kept;
    },
  };
  const privateValues = new Map<string, string>();
  const context: PluginStartContext = { plugin_id: codingManifest.plugin_id, install_id: "coding-install", installation_generation: "1", version: codingManifest.version,
    deployment: "local", project_id: "project", grants: codingManifest.permissions.map(row => row.permission),
    requireGrant(permission) { if (permission === "memory:write" && denied) throw new Error("no grant"); },
    services: { ui: { register() {}, unregister() {} }, project_database: database, actions, background,
      storage: { get: key => privateValues.get(key) ?? null, set: (key, value) => { privateValues.set(key, value); }, delete: key => { privateValues.delete(key); } } } };
  const definition = createCodingPlugin();
  await definition.start(context);
  const round = async () => { t.mock.timers.tick(5_000); await setImmediate(); };
  await round(); assert.equal(attempted.length, 16); assert.equal(reads, 1);
  await round(); assert.equal(attempted.length, 17, "the real observation job isolates a refused reference without consuming it");
  await round(); await round();
  assert.equal(handled.size, 40); assert.equal(reads, 1, "unchanged five-second observations never reload canonical history");
  assert.equal(attempted.filter(id => id === "run-16").length, 2, "failed reference remains pending");
  await round(); assert.equal(attempted.length, 41);
  refs = [...refs, { session_id: "runtime-session", run_id: "run-40" }]; status = { ...status, latest_run_id: "run-40" };
  await round(); assert.equal(handled.size, 41); assert.equal(reads, 2, "same terminal phase with a new Run is observed");
  for (const job of jobs) job.cancel(); await Promise.allSettled(jobs.map(job => job.done));
  await definition.stop?.(context); denied = true;
  await definition.start(context);
  await round(); assert.equal(reads, 2, "optional permission is not silently granted");
  denied = false;
  for (let i = 0; i < 3; i++) await round();
  assert.equal(reads, 3); assert.equal(attempted.length, 83); assert.equal(handled.size, 41, "activation recovery reaches all refs and leaves original queue keys in charge");
});
