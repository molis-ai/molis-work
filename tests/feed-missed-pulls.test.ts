import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { decideMissedPull, feedRunsOverview } from "@molis-ai/molis-work-plugin-feed";
import { RUN_MISSED_GRACE_MS } from "@molis-ai/molis-work-contracts/platform/actions";
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
  const clock = { now: new Date("2026-11-10T09:00:00.000Z") }, pulls: string[] = [];
  let store = new LocalProjectDatabase(databasePath);
  const open = () => ({
    service: createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, undefined, () => clock.now),
    scheduler: createLocalFeedSourceScheduler(store.db, DEMO_PROJECT_ID, async (source, key) => { pulls.push(`${source.source_id}:${key}`); }, () => clock.now),
  });
  let current = open();
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const h = {
    clock, pulls,
    get feed() { return current.service.feed; },
    source(catalogIndex = 0) {
      const source = current.service.register({ kind: "rss", definition_id: listTestFeedSourceCatalog()[catalogIndex]!.id }).source;
      current.service.configureSchedule(source.source_id, { mode: "interval", enabled: true, interval_minutes: 15 });
      return source.source_id;
    },
    next(sourceId: string) { const schedule = current.service.feed.sources.get(DEMO_PROJECT_ID, sourceId).schedule; return schedule.mode === "interval" ? schedule.next_pull_at : null; },
    tick: () => current.scheduler.tick(clock.now),
    missed: () => current.service.feed.sources.missed.list(DEMO_PROJECT_ID, 50),
    decide: (run_id: string, decision: "run_now" | "skip") => decideMissedPull(current.service.feed, DEMO_PROJECT_ID, { run_id, decision }, clock.now),
    overview: () => feedRunsOverview(current.service.feed, DEMO_PROJECT_ID, { now: clock.now.toISOString(), upcoming_until: new Date(clock.now.getTime() + 2 * 86_400_000).toISOString() }),
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
