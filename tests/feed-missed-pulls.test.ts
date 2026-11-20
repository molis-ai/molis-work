import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { decideMissedPull, feedRunsOverview } from "@molis-ai/molis-work-plugin-feed";
import { RUN_MISSED_GRACE_MS, RUN_MISSED_KEPT_MS, RUNS_MISSED_LIMIT } from "@molis-ai/molis-work-contracts/platform/actions";
import { createLocalFeedSourceScheduler, createLocalFeedSourceService, listTestFeedSourceCatalog } from "./fixtures/feed-library.js";

const MINUTE = 60_000;

/**
 * Feed's missed pulls over an isolated project library on disk and the test's clock. `restart()` closes the library and opens it again
 * with a new scheduler, as a Host that was stopped and started again does; what Feed decided must be read back from the library.
 */
function harness(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-missed-"));
  const databasePath = join(directory, "molis-work.sqlite");
  seedDemoBoard(databasePath);
  const clock = { now: new Date("2026-11-10T09:00:00.000Z") }, pulls: string[] = [], failing = { next: false };
  let store = new LocalProjectDatabase(databasePath);
  const open = () => ({
    service: createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, undefined, () => clock.now),
    scheduler: createLocalFeedSourceScheduler(store.db, DEMO_PROJECT_ID, async (source, key) => {
      if (failing.next) { failing.next = false; throw new Error("the feed did not answer"); }
      pulls.push(`${source.source_id}:${key}`);
    }, () => clock.now),
  });
  let current = open();
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const h = {
    clock, pulls, failing,
    get feed() { return current.service.feed; },
    source(catalogIndex = 0) {
      const source = current.service.register({ kind: "rss", definition_id: listTestFeedSourceCatalog()[catalogIndex]!.id }).source;
      current.service.configureSchedule(source.source_id, { mode: "interval", enabled: true, interval_minutes: 15 });
      return source.source_id;
    },
    next(sourceId: string) { const schedule = current.service.feed.sources.get(DEMO_PROJECT_ID, sourceId).schedule; return schedule.mode === "interval" ? schedule.next_pull_at : null; },
    tick: () => current.scheduler.tick(clock.now),
    /** Every row nobody decided on, expired or not, as Feed keeps it. */
    missed: () => current.service.feed.sources.missed.list(DEMO_PROJECT_ID, 500, "1970-01-01T00:00:00.000Z"),
    decide: (run_id: string, decision: "run_now" | "skip") => decideMissedPull(current.service.feed, DEMO_PROJECT_ID, { run_id, decision }, clock.now),
    overview: (expiredAfter: string | null = null) => feedRunsOverview(current.service.feed, DEMO_PROJECT_ID,
      { now: clock.now.toISOString(), upcoming_until: new Date(clock.now.getTime() + 2 * 86_400_000).toISOString(), expired_after: expiredAfter }),
    record: (sourceId: string, dueAt: string, missedAt = new Date(Date.parse(dueAt) + 3_600_000).toISOString()) => current.service.feed.sources.missed.record(DEMO_PROJECT_ID,
      { run_id: `pull:${sourceId}:${dueAt}`, source_id: sourceId, title: "来源", due_at: dueAt, missed_at: missedAt }),
    restart() { store.close(); store = new LocalProjectDatabase(databasePath); current = open(); },
    later(ms: number) { clock.now = new Date(clock.now.getTime() + ms); },
  };
  return h;
}

test("BL-feed-run-now-missed-again 现在做, then the computer sleeps past the grace and the Host restarts: the pull is made once and not asked again", async t => {
  const h = harness(t), sourceId = h.source();
  h.clock.now = new Date("2026-11-10T10:00:00.000Z");
  await h.tick();
  const [missed] = h.missed();
  assert.equal(missed?.due_at, "2026-11-10T09:15:00.000Z", "the pull an hour late is written down, not made");
  assert.deepEqual(h.pulls, []);
  assert.equal(h.next(sourceId), "2026-11-10T10:15:00.000Z");

  assert.deepEqual(h.decide(missed!.run_id, "run_now"), { state: "started" });
  // The lid closes right after the click: no tick comes until well past the grace, and the Host is started again meanwhile.
  h.later(RUN_MISSED_GRACE_MS + 7 * MINUTE);
  h.restart();
  const resumed = await h.tick();
  assert.equal(h.pulls.length, 1, "the decision made before the sleep is carried out after it");
  assert.deepEqual(resumed, { due: 1, completed: 1, failed: 0, skipped: 0 });
  assert.deepEqual(h.missed(), [], "the same pull is not put to the person a second time");
  assert.deepEqual(h.overview().missed, []);
  assert.equal(h.next(sourceId), "2026-11-10T10:30:00.000Z", "the next time stays on the source's own interval");

  h.restart();
  await h.tick();
  assert.equal(h.pulls.length, 1, "another restart does not pull it again");
  assert.deepEqual(h.decide(missed!.run_id, "run_now"), { state: "gone" }, "a second click finds it decided");
});

test("BL-feed-run-now-missed-again a pull no one decided on is still written down after the same sleep, and 跳过 is not run", async t => {
  const h = harness(t), sourceId = h.source(0), skipped = h.source(1);
  h.clock.now = new Date("2026-11-10T10:00:00.000Z");
  await h.tick();
  const rows = h.missed();
  assert.equal(rows.length, 2);
  assert.deepEqual(h.decide(rows.find(row => row.source_id === skipped)!.run_id, "skip"), { state: "skipped" });
  h.later(RUN_MISSED_GRACE_MS + 7 * MINUTE + 15 * MINUTE);
  h.restart();
  await h.tick();
  assert.deepEqual(h.pulls, [], "neither the undecided nor the skipped one is pulled on its own");
  assert.deepEqual(h.missed().map(row => [row.source_id, row.due_at]).sort(), [
    [sourceId, "2026-11-10T09:15:00.000Z"], [sourceId, "2026-11-10T10:15:00.000Z"], [skipped, "2026-11-10T10:15:00.000Z"],
  ].sort(), "each slot that came up late is its own row; the skipped one stays decided");
});

const DUE = "2026-11-10T09:15:00.000Z";

test("BL-missed-runs-never-expire a missed pull waits seven days from its due time: listed and decidable until then, skipped on its own at exactly seven days", async t => {
  const h = harness(t), sourceId = h.source();
  h.clock.now = new Date("2026-11-10T10:00:00.000Z");
  await h.tick();
  const [row] = h.missed();
  assert.equal(row?.due_at, DUE);
  h.clock.now = new Date(Date.parse(DUE) + RUN_MISSED_KEPT_MS - 1);
  assert.deepEqual(h.overview().missed.map(run => run.run_id), [row!.run_id], "a moment before the seventh day it still waits for the person");
  assert.equal(h.overview().expired, 0);
  h.clock.now = new Date(Date.parse(DUE) + RUN_MISSED_KEPT_MS);
  const view = h.overview();
  assert.deepEqual(view.missed.filter(run => run.run_id === row!.run_id), [], "at exactly seven days it leaves the list");
  assert.equal(view.expired, 1, "and is counted as skipped on its own");
  assert.deepEqual(h.decide(row!.run_id, "run_now"), { state: "gone" }, "现在做 that arrives as it expires finds it gone");
  assert.equal(h.missed().find(entry => entry.run_id === row!.run_id)?.decision, null, "Feed's record stays: not the person's 跳过");
  await h.tick();
  assert.deepEqual(h.pulls, [], "an expired pull is never made");
  assert.ok(sourceId);
});

test("BL-missed-runs-never-expire 现在做 a moment before the seventh day is the person's decision: pulled once, never counted as expired", async t => {
  const h = harness(t);
  h.source();
  h.clock.now = new Date("2026-11-10T10:00:00.000Z");
  await h.tick();
  const [row] = h.missed();
  h.clock.now = new Date(Date.parse(DUE) + RUN_MISSED_KEPT_MS - 1);
  assert.deepEqual(h.decide(row!.run_id, "run_now"), { state: "started" });
  h.later(2 * 86_400_000);
  h.restart();
  await h.tick();
  assert.equal(h.pulls.length, 1, "the decision is carried out after the deadline it beat");
  assert.equal(h.overview().expired, 0, "a decided pull is not in the summary");
});

test("BL-missed-runs-never-expire the computer off across the seventh day: at start the pull is expired, counted once, and not counted again once told", async t => {
  const h = harness(t), sourceId = h.source(), other = h.source(1);
  h.clock.now = new Date("2026-11-10T10:00:00.000Z");
  await h.tick();
  const rows = h.missed();
  assert.equal(rows.length, 2);
  assert.deepEqual(h.decide(rows.find(row => row.source_id === other)!.run_id, "skip"), { state: "skipped" });
  // Off from now until ten days later: nothing ran on the seventh day.
  h.later(10 * 86_400_000);
  h.restart();
  const view = h.overview();
  assert.deepEqual(view.missed.filter(run => run.due_at === DUE), [], "found expired the moment it is back");
  assert.equal(view.expired, 1, "only the one nobody decided on: the person's 跳过 is not in the summary");
  // The person read the summary made at this moment; after another restart it is not said again.
  const told = h.clock.now.toISOString();
  h.restart();
  assert.equal(h.overview(told).expired, 0, "the same summary is not said twice");
  h.later(86_400_000);
  assert.equal(h.overview(told).expired, 0);
  assert.ok(sourceId);
});

test("BL-missed-runs-never-expire more expired pulls than one page are all counted, and the page lists only the ones still waiting", async t => {
  const h = harness(t), sourceId = h.source();
  const start = Date.parse("2026-10-20T00:00:00.000Z");
  for (let index = 0; index < RUNS_MISSED_LIMIT + 10; index += 1) h.record(sourceId, new Date(start + index * 3_600_000).toISOString());
  const waiting = ["2026-11-09T08:00:00.000Z", "2026-11-09T09:00:00.000Z", "2026-11-09T10:00:00.000Z"];
  for (const due of waiting) h.record(sourceId, due);
  h.clock.now = new Date("2026-11-10T12:00:00.000Z");
  const view = h.overview();
  assert.equal(view.expired, RUNS_MISSED_LIMIT + 10, "every expired one, past the first page");
  assert.deepEqual(view.missed.map(run => run.due_at), [...waiting].reverse(), "the waiting ones are not pushed off the page by expired ones");
  assert.equal(h.overview("2026-10-27T00:00:00.000Z").expired, RUNS_MISSED_LIMIT + 10 - 1, "the first one ran out at the very moment of the last summary: not counted again");
});

test("BL-feed-run-now-missed-again 现在做 whose pull then fails: the slot is spent once and the source goes back to its own interval, not asked again", async t => {
  const h = harness(t), sourceId = h.source();
  h.clock.now = new Date("2026-11-10T10:00:00.000Z");
  await h.tick();
  const [missed] = h.missed();
  assert.deepEqual(h.decide(missed!.run_id, "run_now"), { state: "started" });
  h.later(RUN_MISSED_GRACE_MS + 7 * MINUTE);
  h.failing.next = true;
  const failed = await h.tick();
  assert.deepEqual([failed.failed, failed.skipped, h.pulls.length], [1, 0, 0], "tried once on the person's word, and it failed");
  assert.equal(h.next(sourceId), "2026-11-10T10:30:00.000Z", "the next time is the source's own interval again");
  assert.deepEqual(h.missed(), [], "a failed pull is not put back to the person as missed");
  h.restart();
  await h.tick();
  assert.equal(h.pulls.length, 0, "and the failed slot is not tried again after a restart");
});

test("BL-feed-run-now-missed-again a source set for a time with an offset is written down as that instant, and 现在做 on it is carried out once", async t => {
  const h = harness(t), sourceId = h.source();
  const source = h.feed.sources.get(DEMO_PROJECT_ID, sourceId);
  assert.equal(source.schedule.mode, "interval");
  h.feed.sources.upsert({ ...source, schedule: { ...source.schedule, next_pull_at: "2026-11-10T17:15:00+08:00" } as typeof source.schedule });
  h.clock.now = new Date("2026-11-10T10:00:00.000Z");
  await h.tick();
  const [missed] = h.missed();
  assert.equal(missed?.due_at, "2026-11-10T09:15:00.000Z", "kept as the same instant in one form, so its seven days compare as text");
  assert.deepEqual(h.decide(missed!.run_id, "run_now"), { state: "started" });
  h.later(RUN_MISSED_GRACE_MS + MINUTE);
  await h.tick();
  assert.equal(h.pulls.length, 1);
  assert.deepEqual(h.missed(), [], "not written down a second time");
});

test("BL-missed-runs-never-expire a pull written down only after the person was last told (Feed was not running) is still counted once", async t => {
  const h = harness(t), sourceId = h.source();
  h.clock.now = new Date("2026-11-20T09:00:00.000Z");
  const told = "2026-11-18T09:00:00.000Z";
  // Due on the 2nd, so its seven days ran out on the 9th, before the summary of the 18th; but Feed only came back on the 19th to write it down.
  h.record(sourceId, "2026-11-02T09:00:00.000Z", "2026-11-19T09:00:00.000Z");
  h.record(sourceId, "2026-11-03T09:00:00.000Z", "2026-11-04T09:00:00.000Z");
  const view = h.overview(told);
  assert.equal(view.missed.length, 0);
  assert.equal(view.expired, 1, "the one written down after the summary is said; the one already in it is not said again");
  assert.equal(h.overview("2026-11-20T09:00:00.000Z").expired, 0, "once told, neither is");
});

test("BL-missed-runs-never-expire Feed keeps each ended row a month: a decision from the decision, an expired one from its seventh day", async t => {
  const h = harness(t), sourceId = h.source();
  h.record(sourceId, "2026-09-01T09:00:00.000Z");
  h.record(sourceId, "2026-09-10T09:00:00.000Z");
  h.record(sourceId, "2026-09-20T09:00:00.000Z");
  h.record(sourceId, "2026-10-01T09:00:00.000Z");
  h.feed.sources.missed.decide(DEMO_PROJECT_ID, `pull:${sourceId}:2026-09-01T09:00:00.000Z`, "skip", "2026-10-15T09:00:00.000Z");
  h.feed.sources.missed.decide(DEMO_PROJECT_ID, `pull:${sourceId}:2026-09-20T09:00:00.000Z`, "skip", "2026-09-21T09:00:00.000Z");
  // Written on Nov 1: a month back is Oct 2; an undecided row ends seven days after it is due, so one due before Sep 25 is gone.
  h.record(sourceId, "2026-11-01T08:00:00.000Z", "2026-11-01T09:00:00.000Z");
  const kept = h.feed.sources.missed;
  assert.equal(kept.get(DEMO_PROJECT_ID, `pull:${sourceId}:2026-09-01T09:00:00.000Z`)?.decision, "skip", "decided on Oct 15: kept, however old its time");
  assert.equal(kept.get(DEMO_PROJECT_ID, `pull:${sourceId}:2026-09-20T09:00:00.000Z`), null, "decided on Sep 21: gone");
  assert.equal(kept.get(DEMO_PROJECT_ID, `pull:${sourceId}:2026-09-10T09:00:00.000Z`), null, "nobody decided, ran out on Sep 17: gone");
  assert.equal(kept.get(DEMO_PROJECT_ID, `pull:${sourceId}:2026-10-01T09:00:00.000Z`)?.decision, null, "ran out on Oct 8: kept");
});
