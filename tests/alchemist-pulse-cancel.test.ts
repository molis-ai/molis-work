import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistActions as a, ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { alchemistFixture } from "./fixtures/alchemist-actions.js";

/**
 * W5-01-ALC-RES09: a Pulse is stopped through `runCancel`, the one action the page's 「停止」 (POST /runs/:jobId/cancel), MCP and
 * every other caller share, while a source waits on the network. The cancel is the job's own `cancelled` and the run's, in one
 * transaction; after it, what the source brings back, an answer or a failure, is never recorded (RES07, QA-023: this is the
 * job's own cancel, now through its entry), and the next source is never asked. The studio's close is the other way a Pulse
 * stops, in tests/alchemist-pulse-close.test.ts.
 */
const FACTS = ["jobs", "job_events", "pulse_runs", "source_fetches", "supply_signals", "pulse_reports", "activity_events"];

for (const entry of ["page", "mcp"] as const) test(`W5-01-ALC-RES09 QA-023 RES07: a Pulse stopped from the ${entry === "page" ? "page's HTTP route" : "MCP"} while a source waits records nothing after the stop`, async t => {
  for (const fail of [false, true]) await t.test(fail ? "the source fails late" : "the source answers late", async t => {
    const home = await mkdtemp(join(tmpdir(), "alchemist-pulse-cancel-")), library = join(home, "a.sqlite");
    const entered = Promise.withResolvers<AbortSignal>(), release = Promise.withResolvers<void>();
    // Watcha, asked second, leaves through the process's own fetch: a stopped Pulse never gets that far.
    let laterCalls = 0;
    t.mock.method(globalThis, "fetch", async () => { laterCalls++; throw new TypeError("A stopped Pulse cannot fetch another source"); });
    const f = alchemistFixture(home, "a", ALCHEMIST_ACTION_PERMISSIONS, { pulseSourceMode: "live", pulseGithub: { async fetch(_url, init) {
      entered.resolve(init.signal!); await release.promise;
      if (fail) throw new TypeError("The source answered too late");
      return Response.json({ items: [] });
    } } });
    t.after(async () => { release.resolve(); await f.close(); await rm(home, { recursive: true, force: true }); });
    const facts = () => {
      const database = new DatabaseSync(library, { readOnly: true });
      try { return FACTS.map(table => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); } finally { database.close(); }
    };
    const cancel = async (jobId: string): Promise<{ kind: string; run: { id: string; status: string } }> => {
      if (entry === "mcp") return await bindActionClient(f.service, () => ({ ...f.caller, audience: "mcp" })).invoke(a.runCancel, { id: jobId });
      const response = await f.runtime.app.request(`http://localhost/api/v1/runs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
      assert.equal(response.status, 200);
      return await response.json() as { kind: string; run: { id: string; status: string } };
    };

    const { run } = await f.bound.invoke(a.pulseStart, { sourceIds: ["github", "watcha"] });
    const drained = f.runtime.runPending(), signal = await entered.promise;
    const stopped = await cancel(run.jobId);
    assert.equal(stopped.kind, "pulse");
    assert.deepEqual([stopped.run.id, stopped.run.status], [run.id, "cancelled"]);
    assert.equal(signal.aborted, true, "the stop reaches the request that is waiting");
    assert.match(String(signal.reason), /alchemist\.job_cancelled/u);
    const atStop = facts();
    assert.equal(atStop[0]!.find(job => job.id === run.jobId)?.status, "cancelled");
    assert.equal(atStop[1]!.filter(event => event.job_id === run.jobId).at(-1)?.type, "cancelled");
    assert.equal(atStop[2]!.find(row => row.id === run.id)?.status, "cancelled");

    release.resolve(); await drained;
    assert.deepEqual(facts(), atStop, "nothing in the seven tables changed after the stop");
    assert.equal(laterCalls, 0, "the next source was never asked");
    assert.equal((await f.bound.invoke(a.pulseReports, {})).latestRun?.status, "cancelled", "the page shows the run as stopped");
  });
});

test("W5-01-ALC-RES09: a Pulse that has ended, or a job that is not one, cannot be stopped, and the refusal writes nothing", async t => {
  const home = await mkdtemp(join(tmpdir(), "alchemist-pulse-cancel-"));
  const f = alchemistFixture(home);
  t.after(async () => { await f.close(); await rm(home, { recursive: true, force: true }); });
  const { run } = await f.bound.invoke(a.pulseStart, {});
  await f.runtime.runPending();
  const post = async (jobId: string) => {
    const response = await f.runtime.app.request(`http://localhost/api/v1/runs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
    return [response.status, (await response.json() as { code: string }).code];
  };
  const ended = (await f.bound.invoke(a.pulseReports, {})).latestRun;
  assert.equal(ended?.id, run.id);
  assert.notEqual(ended?.status, "cancelled");
  assert.deepEqual(await post(run.jobId), [409, "alchemist.run_not_cancellable"]);
  assert.deepEqual(await post("missing"), [404, "alchemist.run_not_found"]);
  assert.deepEqual((await f.bound.invoke(a.pulseReports, {})).latestRun, ended, "a refused stop leaves the run as it was");
});
