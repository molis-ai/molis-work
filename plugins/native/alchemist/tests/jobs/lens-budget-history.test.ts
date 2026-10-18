// @vitest-environment node
import { expect, it } from "vitest";
import { marketLensCompatibilityKey, type ResearchPlan } from "../../src/studio/domain/research/lens.js";
import { readLensProgress } from "../../src/studio/server/jobs/lens-progress.js";
import type { PersistedJob, PersistedJobEvent } from "../../src/studio/server/jobs/sqlite-job-runner.js";

const now = "2026-10-17T00:00:00.000Z";
const plan: ResearchPlan = { id: "plan", key: marketLensCompatibilityKey("idea", 1), scopeSummary: "Test", appliedPlaybookRuleIds: [],
  modelPolicy: "fixed", modelId: "fixture/model", runtimeLabel: "fixture", estimatedDuration: { minMinutes: 1, maxMinutes: 2 },
  budget: { kind: "calls", limit: 8 }, createdAt: now };
const job: PersistedJob = { id: "job", kind: "research.lens", status: "running", input: {}, attempt: 1, createdAt: now, updatedAt: now };
function history(operations: string[], limit = 8): PersistedJobEvent[] {
  return operations.map((operation, index) => ({ jobId: job.id, sequence: index + 1, type: "call_started",
    payload: { operation, callsUsed: index + 1, limit }, createdAt: now }));
}
for (const [operation, previous, operations] of [
  ["collecting", { stage: "planning_complete" }, ["collecting"]],
  ["cross_checking", { stage: "collecting_complete", evidence: [] }, ["collecting", "cross_checking"]],
  ["cross_checking_format_correction", { stage: "collecting_complete", evidence: [] }, ["collecting", "cross_checking", "cross_checking_format_correction"]],
  ["synthesizing", { stage: "cross_checking_complete", evidence: [], claims: [] }, ["collecting", "cross_checking", "synthesizing"]],
] as const) it(`W5-01-ALC-RES05: unknown ${operation} remains charged when returning to its safe checkpoint`, () => {
  const events = history([...operations]);
  const checkpoint = { stage: "call_dispatched", operation, callsUsed: events.length, previous };
  const progress = readLensProgress({ ...job, checkpoint }, plan, events);
  expect(progress.callsUsed).toBe(operations.length);
  expect(progress.checkpoint).toEqual(previous);
  expect(progress.interrupted).toBe(true);
  const exhausted = { ...plan, budget: { kind: "calls" as const, limit: events.length } };
  expect(() => readLensProgress({ ...job, checkpoint }, exhausted, history([...operations], events.length))).toThrow("alchemist.research_budget_exhausted");
});
it("W5-01-ALC-RES05: repeated unknown retries use the full reservation ledger beyond three calls", () => {
  const operations = ["collecting", "collecting", "collecting", "collecting", "collecting"];
  const progress = readLensProgress({ ...job, checkpoint: { stage: "call_dispatched", operation: "collecting", callsUsed: 5,
    previous: { stage: "planning_complete" } } }, plan, history(operations));
  expect(progress.callsUsed).toBe(5);
});
it("W5-01-ALC-RES05: missing reservations, changed budgets, and stale dispatch markers refuse continuation", () => {
  const checkpoint = { stage: "call_dispatched", operation: "cross_checking", callsUsed: 2, previous: { stage: "collecting_complete", evidence: [] } };
  const events = history(["collecting", "cross_checking"]);
  for (const invalid of [events.slice(1), history(["collecting", "cross_checking"], 9), [...events, ...history(["collecting"])]] ) {
    expect(() => readLensProgress({ ...job, checkpoint }, plan, invalid)).toThrow("alchemist.research_budget_history_invalid");
  }
  expect(() => readLensProgress({ ...job, checkpoint: { ...checkpoint, callsUsed: 1 } }, plan, events)).toThrow("alchemist.research_budget_history_invalid");
});
