import assert from "node:assert/strict";
import test from "node:test";
import { verifyBuildArtifact, verifyFullRetry } from "../scripts/ci-full-retry.mjs";

const runId = "123";
const plan = { runId, count: 3, artifact: "full-suite-dist-123-1" };
const job = (name, run_attempt, conclusion = "success", execution = run_attempt) => {
  const start = (execution * 60 + (name === "Build workspace" ? 0 : 20)) * 1000;
  return { name, run_id: 123, run_attempt, conclusion, started_at: new Date(start).toISOString(), completed_at: new Date(start + 8000).toISOString() };
};
const initial = [job("Build workspace", 1), job("Full suite (1/3)", 1), job("Full suite (2/3)", 1, "failure"), job("Full suite (3/3)", 1, "cancelled")];
const completed = [...initial, job("Full suite (2/3)", 2), job("Full suite (3/3)", 2)];

test("CIP-15 GitHub copies a passed job into the next attempt with the original execution times and artifact", () => {
  const carried = [...completed, job("Build workspace", 2, "success", 1), job("Full suite (1/3)", 2, "success", 1)];
  assert.doesNotThrow(() => verifyFullRetry(carried, plan));
  const rebuilt = [...carried, job("Build workspace", 3), job("Full suite (1/3)", 3, "success", 1)];
  assert.throws(() => verifyFullRetry(rebuilt, plan), /artifact/);
  assert.throws(() => verifyFullRetry(rebuilt, { ...plan, artifact: "full-suite-dist-123-3" }), /1\/3/);
  const missingTime = [...completed, { ...job("Full suite (1/3)", 3), started_at: null }];
  assert.throws(() => verifyFullRetry(missingTime, plan), /1\/3/);
});

test("CIP-15 only the original unexpired build artifact can carry results into a retry", () => {
  const artifact = { name: plan.artifact, expired: false };
  assert.doesNotThrow(() => verifyBuildArtifact({ total_count: 1, artifacts: [artifact] }, plan.artifact));
  for (const response of [{ total_count: 0, artifacts: [] }, { total_count: 1, artifacts: [{ ...artifact, expired: true }] },
    { total_count: 1, artifacts: [{ name: "another-build", expired: false }] }]) {
    assert.throws(() => verifyBuildArtifact(response, plan.artifact), /missing or expired/);
  }
});

test("CIP-15 successful shards carry over only for the same build, after every failed or cancelled peer finishes", () => {
  assert.doesNotThrow(() => verifyFullRetry(completed.toReversed(), plan));
  assert.throws(() => verifyFullRetry(initial, plan), /2\/3.*3\/3/);
  assert.throws(() => verifyFullRetry(completed.slice(0, -1), plan), /3\/3/);
  assert.throws(() => verifyFullRetry([...completed, job("Full suite (1/3)", 3, "failure")], plan), /1\/3/);
  const rebuilt = [...completed, job("Build workspace", 3)];
  assert.throws(() => verifyFullRetry(rebuilt, plan), /artifact/);
  assert.throws(() => verifyFullRetry(rebuilt, { ...plan, artifact: "full-suite-dist-123-3" }), /1\/3.*2\/3.*3\/3/);
});

test("CIP-15 missing shards, a different plan and foreign run evidence cannot give a green Full", () => {
  for (const bad of [completed.filter(row => row.name !== "Full suite (1/3)"), [...completed, job("Full suite (1/1)", 2)],
    [...completed, { ...job("Full suite (1/3)", 3), run_id: 456 }], [...completed, job("Full suite (3/3)", 2)]]) {
    assert.throws(() => verifyFullRetry(bad, plan));
  }
});
