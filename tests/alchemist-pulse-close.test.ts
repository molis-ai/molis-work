import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { alchemistActions as a, ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { alchemistFixture } from "./fixtures/alchemist-actions.js";

/**
 * QA-023 W5-01-ALC-RES07, the lifecycle half: a project's studio closes while a Pulse source waits on the network. The Host's
 * own close, the project's deletion and an idle eviction all end in this `close()`: the worker stops at once, and the library
 * closes once the work in hand has settled. What the source brings back afterwards, an answer or a failure, is never recorded,
 * and the next source is never asked. The stop records nothing either: the job stays as it was, for recovery (RES01).
 * When Alchemist runs on the Plugin Runtime, this becomes the supervisor stopping the instance. The cancel, through the action
 * the page, MCP and workflows share, is the other half, in tests/alchemist-pulse-cancel.test.ts (W5-01-ALC-RES11).
 */
const FACTS = ["jobs", "job_events", "pulse_runs", "source_fetches", "supply_signals", "pulse_reports", "activity_events"];

test("QA-023 W5-01-ALC-RES07: a Pulse whose studio closes while a source waits records nothing after the close", async t => {
  for (const fail of [false, true]) await t.test(fail ? "the source fails late" : "the source answers late", async t => {
    const home = await mkdtemp(join(tmpdir(), "alchemist-pulse-close-")), library = join(home, "a.sqlite");
    const entered = Promise.withResolvers<AbortSignal>(), release = Promise.withResolvers<void>();
    // Watcha, asked second, leaves through the process's own fetch: a closed studio never gets that far.
    let laterCalls = 0;
    t.mock.method(globalThis, "fetch", async () => { laterCalls++; throw new TypeError("A closed studio cannot fetch another source"); });
    const f = alchemistFixture(home, "a", ALCHEMIST_ACTION_PERMISSIONS, { pulseSourceMode: "live", pulseGithub: { async fetch(_url, init) {
      entered.resolve(init.signal!); await release.promise;
      if (fail) throw new TypeError("The source answered too late");
      return Response.json({ items: [] });
    } } });
    let closing: Promise<void> | undefined;
    t.after(async () => { release.resolve(); await (closing ??= f.close()); await rm(home, { recursive: true, force: true }); });
    const facts = () => {
      const database = new DatabaseSync(library, { readOnly: true });
      try { return FACTS.map(table => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); } finally { database.close(); }
    };

    const { run } = await f.bound.invoke(a.pulseStart, { sourceIds: ["github", "watcha"] });
    const drained = f.runtime.runPending(), signal = await entered.promise;
    closing = f.close();
    assert.equal(signal.aborted, true, "the stop reaches the request that is waiting");
    assert.match(String(signal.reason), /alchemist\.runtime_shutdown/u);
    const atClose = facts();
    assert.equal(atClose[0]!.find(job => job.id === run.jobId)?.status, "running", "the job stays as it was, for recovery to pick up");

    release.resolve(); await drained; await closing;
    assert.deepEqual(facts(), atClose, "nothing in the seven tables changed after the close");
    assert.equal(laterCalls, 0, "the next source was never asked");
  });
});
