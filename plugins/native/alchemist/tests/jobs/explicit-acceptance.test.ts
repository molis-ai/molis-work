import { afterEach, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/studio/server/db/open-database.js";
import { applyStudioBaseline } from "../../src/studio/server/db/schema.js";
import { SqliteJobRunner } from "../../src/studio/server/jobs/sqlite-job-runner.js";
import { LocalWorker, type JobHandlerControl } from "../../src/studio/server/jobs/local-worker.js";
import { jobAuthority } from "../fixtures/job-authority.js";

const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); vi.useRealTimers(); });
function fixture() {
  const db = openDatabase(":memory:"); databases.push(db); applyStudioBaseline(db, ":memory:");
  let id = 0;
  const jobs = new SqliteJobRunner(db, { workerId: "current", clock: { now: () => new Date().toISOString() },
    idFactory: { next: prefix => `${prefix}-${++id}` }, leaseMs: 300 });
  db.exec("CREATE TABLE results (value TEXT)");
  return { db, jobs };
}

it("W5-01-ALC-RES01/02 only explicitly accepted jobs enter the worker; double click reserves once", async () => {
  const { jobs } = fixture(), calls: string[] = [], hold = Promise.withResolvers<void>();
  const a = jobs.enqueue({ kind: "test", payload: {} }), b = jobs.enqueue({ kind: "test", payload: {} });
  const worker = new LocalWorker(jobs, { test: async job => { calls.push(job.id); await hold.promise; } });
  expect(await worker.runNext()).toBe(false);
  expect(jobs.listEvents(a.id).map(event => event.type)).toEqual(["queued"]);
  const accepted = jobAuthority();
  expect(worker.accept(a.id, accepted)).toBe(true);
  expect(worker.accept(a.id, accepted)).toBe(false);
  const started = worker.runNext(); await vi.waitFor(() => expect(calls).toEqual([a.id]));
  expect(jobs.get(b.id)).toMatchObject({ status: "queued", attempt: 0 });
  hold.resolve(); await started;
  expect(await worker.runNext()).toBe(false);
  expect(calls).toEqual([a.id]);
});

it("W5-01-ALC-RES02 pending work owns no lease and revoked pending work performs zero writes", async () => {
  const { jobs } = fixture(), hold = Promise.withResolvers<void>(), calls: string[] = [];
  const a = jobs.enqueue({ kind: "test", payload: {} }), b = jobs.enqueue({ kind: "test", payload: {} });
  const worker = new LocalWorker(jobs, { test: async job => { calls.push(job.id); await hold.promise; } });
  worker.accept(a.id, jobAuthority()); const started = worker.runNext();
  await vi.waitFor(() => expect(calls).toEqual([a.id]));
  const waiting = jobAuthority(); worker.accept(b.id, waiting);
  const original = jobs.get(b.id), events = jobs.listEvents(b.id);
  expect(original?.leaseOwner).toBeUndefined(); expect(await worker.runNext()).toBe(false);
  waiting.revoke(); hold.resolve(); await started; await worker.runNext();
  expect(jobs.get(b.id)).toEqual(original); expect(jobs.listEvents(b.id)).toEqual(events);
  expect(calls).toEqual([a.id]);
});

for (const lateFailure of [false, true]) it(`W5-01-ALC-RES03 revoked late ${lateFailure ? "failure" : "success"} never writes or renews`, async () => {
  vi.useFakeTimers();
  const { db, jobs } = fixture(), hold = Promise.withResolvers<void>();
  const job = jobs.enqueue({ kind: "test", payload: {} }), accepted = jobAuthority();
  let control: JobHandlerControl | undefined;
  const worker = new LocalWorker(jobs, { test: async (_job, current) => {
    control = current; await current.saveCheckpoint({ stage: "accepted" }); await hold.promise;
    if (lateFailure) throw new Error("provider failed late");
    await current.commit(() => db.prepare("INSERT INTO results VALUES ('late')").run());
  } });
  worker.accept(job.id, accepted); const started = worker.runNext(); await vi.advanceTimersByTimeAsync(0);
  const original = jobs.get(job.id), events = jobs.listEvents(job.id);
  accepted.revoke(); await vi.advanceTimersByTimeAsync(1000);
  expect(control?.signal.aborted).toBe(true); expect(jobs.get(job.id)).toEqual(original);
  let idle = false; void worker.whenIdle().then(() => { idle = true; }); await Promise.resolve(); expect(idle).toBe(false);
  hold.resolve(); await started;
  expect(jobs.get(job.id)).toEqual(original); expect(jobs.listEvents(job.id)).toEqual(events);
  expect(db.prepare("SELECT * FROM results").all()).toEqual([]);
});

it("W5-01-ALC-RES03 revocation during the commit guard await rejects its synchronous effect", async () => {
  const { db, jobs } = fixture(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const job = jobs.enqueue({ kind: "test", payload: {} });
  let current = true, guards = 0;
  const assertCurrent = () => { if (!current) throw new Error("actions.forbidden"); };
  const authority = Object.assign(async () => { if (++guards === 2) { entered.resolve(); await release.promise; } assertCurrent(); }, { assertCurrent });
  const worker = new LocalWorker(jobs, { test: async (_job, control) => {
    await control.commit(() => db.prepare("INSERT INTO results VALUES ('late')").run());
  } });
  worker.accept(job.id, { actorId: "current-actor", authority }); const started = worker.runNext();
  await entered.promise; const original = jobs.get(job.id); current = false; release.resolve(); await started;
  expect(jobs.get(job.id)).toEqual(original); expect(db.prepare("SELECT * FROM results").all()).toEqual([]);
});
