import assert from "node:assert/strict";
import test from "node:test";
import { agentHostCapabilities as agent, type AgentSessionStatus } from "@molis-ai/molis-work-contracts/services/agent-host";
import { memoryLearningEnqueueAction } from "@molis-ai/molis-work-contracts/services/memory";
import { codingLearningObservation } from "../plugins/native/coding/dist/observation-job.js";
import type { CodingActivation } from "../plugins/native/coding/dist/route-activation.js";
import type { CodingSessionRecord } from "../plugins/native/coding/dist/store.js";

test("Coding observation drains every pending reference in bounded rounds, notices a newer completed run and recovers without a persistent cursor", async () => {
  let refs = Array.from({ length: 40 }, (_, n) => ({ session_id: "runtime-session", run_id: `run-${n}` }));
  let reads = 0, denied = false, failure = true;
  const attempted: string[] = [], handled = new Set<string>();
  const activation = { context: { requireGrant: () => { if (denied) throw new Error("no grant"); }, services: { actions: {
    invoke: async (definition: { capability_id: string }, input: unknown) => {
      if (definition.capability_id === agent.readSession.capability_id) { reads++; return { runs: refs }; }
      assert.equal(definition.capability_id, memoryLearningEnqueueAction.capability_id);
      const { run_id } = input as { run_id: string }; attempted.push(run_id);
      if (run_id === "run-16" && failure) { failure = false; throw new Error("temporary failure"); }
      const existing = handled.has(run_id); handled.add(run_id); return { status: existing ? "existing" : "queued" };
    },
  } } } } as unknown as CodingActivation;
  const record = { runtime_id: "prologue", runtime_session_id: "runtime-session", session_id: "business-session" } as CodingSessionRecord;
  const status: AgentSessionStatus = { session_id: "runtime-session", latest_run_id: "run-39", latest_phase: "completed", recovery: false, checkpoint_busy: false };
  const beforeWrite = Object.assign(async () => {}, { assert_current() {} });
  const observe = codingLearningObservation(activation);
  await observe(beforeWrite)(record, status); assert.equal(attempted.length, 16); assert.equal(reads, 1);
  await assert.rejects(observe(beforeWrite)(record, status), /temporary failure/);
  await observe(beforeWrite)(record, status); await observe(beforeWrite)(record, status);
  assert.equal(handled.size, 40); assert.equal(reads, 1, "unchanged five-second observations never reload canonical history");
  assert.equal(attempted.filter(id => id === "run-16").length, 2, "failed reference remains pending");
  await observe(beforeWrite)(record, status); assert.equal(attempted.length, 41);
  refs = [...refs, { session_id: "runtime-session", run_id: "run-40" }];
  await observe(beforeWrite)(record, { ...status, latest_run_id: "run-40" });
  assert.equal(handled.size, 41); assert.equal(reads, 2, "same terminal phase with a new Run is observed");
  denied = true; const restart = codingLearningObservation(activation);
  await restart(beforeWrite)(record, status); assert.equal(reads, 2, "optional permission is not silently granted");
  denied = false;
  for (let i = 0; i < 3; i++) await restart(beforeWrite)(record, { ...status, latest_run_id: "run-40" });
  assert.equal(reads, 3); assert.equal(attempted.length, 83); assert.equal(handled.size, 41, "activation recovery reaches all refs and leaves original queue keys in charge");
});
