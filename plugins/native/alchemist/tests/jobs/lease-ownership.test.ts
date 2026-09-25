import { expect, it, vi } from "vitest";
import { createTempDatabase } from "../db/helpers/temp-database.js";
import { openDatabase } from "../../src/studio/server/db/open-database.js";
import { migrate } from "../../src/studio/server/db/migrate.js";
import { SqliteJobRunner } from "../../src/studio/server/jobs/sqlite-job-runner.js";
import { LocalWorker } from "../../src/studio/server/jobs/local-worker.js";
import { createJobHandlers } from "../../src/studio/server/jobs/job-handlers.js";
import { SqliteDirectionRepository } from "../../src/studio/server/db/direction-repository.js";
import { SqliteExplorationRepository } from "../../src/studio/server/db/exploration-repository.js";
import { createExplorationService } from "../../src/studio/server/services/create-exploration.js";
import { FixtureAiRuntimeAdapter } from "../../src/studio/server/runtime/fixture-ai-runtime.js";

function fixture() {
  const temp = createTempDatabase(), first = openDatabase(temp.path); migrate(first);
  const second = openDatabase(temp.path);
  let sequence = 0;
  const clock = { now: () => new Date().toISOString() };
  const idFactory = { next: (prefix: string) => `${prefix}-${++sequence}` };
  const a = new SqliteJobRunner(first, { workerId: "a", clock, idFactory, leaseMs: 300 });
  const b = new SqliteJobRunner(second, { workerId: "b", clock, idFactory, leaseMs: 300 });
  return { first, second, a, b, clock, idFactory, close: () => { first.close(); second.close(); temp.cleanup(); } };
}

it("renews a blocked operation while another connection repeatedly attempts recovery", async () => {
  vi.useFakeTimers();
  const f = fixture(), release = Promise.withResolvers<void>();
  let calls = 0;
  const job = f.a.enqueue({ kind: "slow", payload: {} });
  const worker = new LocalWorker(f.a, { slow: async (_job, control) => {
    calls++; await release.promise; control.saveCheckpoint({ done: true });
  } });
  const running = worker.runNext();
  try {
    for (let i = 0; i < 12; i++) {
      await vi.advanceTimersByTimeAsync(100);
      expect(f.b.recoverExpired()).toBe(0);
      expect(f.b.claimNext()).toBeUndefined();
    }
    release.resolve(); await running;
    expect(calls).toBe(1);
    expect(f.b.get(job.id)).toMatchObject({ status: "completed", attempt: 1, checkpoint: { done: true } });
  } finally { release.resolve(); await running; f.close(); vi.useRealTimers(); }
});

it("a remote cancellation aborts the original wait and rejects a late business commit", async () => {
  vi.useFakeTimers();
  const f = fixture(), release = Promise.withResolvers<void>();
  f.first.exec("CREATE TABLE business_result (value TEXT)");
  const job = f.a.enqueue({ kind: "slow", payload: {} });
  let signal: AbortSignal | undefined;
  const worker = new LocalWorker(f.a, { slow: async (_job, control) => {
    signal = control.signal; await release.promise;
    control.commit(() => f.first.prepare("INSERT INTO business_result VALUES ('late')").run());
  } });
  const running = worker.runNext();
  try {
    f.b.cancel(job.id); await vi.advanceTimersByTimeAsync(100);
    expect(signal?.aborted).toBe(true);
    release.resolve(); await running;
    expect(f.b.get(job.id)?.status).toBe("cancelled");
    expect(f.second.prepare("SELECT * FROM business_result").all()).toEqual([]);
    expect(f.b.listEvents(job.id).map(event => event.type)).toEqual(["queued", "running", "cancelled"]);
  } finally { release.resolve(); await running; f.close(); vi.useRealTimers(); }
});

it("a replaced worker cannot overwrite the recovered brainstorm or repeat its ambiguous model call", async () => {
  vi.useFakeTimers();
  const f = fixture(), release = Promise.withResolvers<void>();
  const now = f.clock.now();
  f.first.prepare("INSERT INTO workspaces VALUES (?,?,?)").run("workspace-local", "test", now);
  const directions = new SqliteDirectionRepository(f.first), explorations = new SqliteExplorationRepository(f.first);
  const direction = directions.create({ id: "direction", workspaceId: "workspace-local", title: "研究复盘", description: "把访谈材料变成可追踪的产品判断", source: { kind: "user_input" }, status: "active", createdAt: now, updatedAt: now });
  const receipt = createExplorationService({ database: f.first, directions, explorations, jobs: f.a, idFactory: f.idFactory, clock: f.clock })({ directionId: direction.id });
  const model = new FixtureAiRuntimeAdapter();
  const original = model.generateStructured.bind(model);
  const generate = vi.spyOn(model, "generateStructured").mockImplementation(async input => { await release.promise; return original(input); });
  const handlers = createJobHandlers({ explorations, runtime: model, idFactory: f.idFactory, clock: f.clock });
  const old = new LocalWorker(f.a, handlers), replacement = new LocalWorker(f.b, createJobHandlers({ explorations: new SqliteExplorationRepository(f.second), runtime: model, idFactory: f.idFactory, clock: f.clock }));
  const running = old.runNext();
  try {
    // Simulate a paused process: its heartbeat never ran while wall time advanced.
    vi.setSystemTime(Date.now() + 1000);
    expect(f.b.recoverExpired()).toBe(1);
    expect(f.a.renewLease(receipt.jobId)).toBe(false);
    await replacement.runNext();
    expect(f.b.get(receipt.jobId)).toMatchObject({ status: "failed", errorCode: "AI_CALL_INTERRUPTED", attempt: 2 });
    release.resolve(); await running;
    expect(generate).toHaveBeenCalledTimes(1);
    expect(explorations.get(receipt.runId)).toMatchObject({ status: "failed", errorCode: "AI_CALL_INTERRUPTED", cards: [] });
    expect(f.b.get(receipt.jobId)?.errorCode).toBe("AI_CALL_INTERRUPTED");
  } finally { release.resolve(); await running; f.close(); vi.useRealTimers(); }
});

for (const event of ["checkpoint_saved", "cancelled", "completed"]) it(`rolls back job changes if its ${event} event cannot be saved`, () => {
  const f = fixture();
  try {
    const job = f.a.enqueue({ kind: "atomic", payload: {} }); f.a.claimNext();
    f.first.exec(`CREATE TRIGGER reject_event BEFORE INSERT ON job_events WHEN NEW.type = '${event}' BEGIN SELECT RAISE(ABORT, 'injected event failure'); END`);
    const change = () => event === "checkpoint_saved" ? f.a.saveCheckpoint(job.id, { value: "new" }) : event === "cancelled" ? f.a.cancel(job.id) : f.a.complete(job.id);
    expect(change).toThrow("injected event failure");
    expect(f.b.get(job.id)).toMatchObject({ status: "running" });
    expect(f.b.get(job.id)?.checkpoint).toBeUndefined();
    expect(f.b.listEvents(job.id).map(item => item.type)).toEqual(["queued", "running"]);
    f.first.exec("DROP TRIGGER reject_event"); change();
    expect(f.b.listEvents(job.id).map(item => item.type)).toEqual(["queued", "running", event]);
  } finally { f.close(); }
});
