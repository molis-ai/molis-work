import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { HostPresence, currentHostPresence, PRESENCE_SLEEP_AFTER_MS } from "@molis-ai/molis-work-app-local-host";

/** RES-06: when Molis Work was not running here — quit, crashed or the computer asleep — written in the Home with a clock of the test's. */

async function home(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-presence-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const MINUTE = 60_000;

test("RES-06 a clean quit is written as quit from the time it stopped; a run that just ended is written as crash from its last heartbeat", async t => {
  const directory = await home(t);
  let now = Date.parse("2026-11-11T08:00:00.000Z");
  const presence = (onWake?: () => void) => new HostPresence({ homeDirectory: directory, now: () => new Date(now), ...(onWake ? { onWake } : {}), heartbeatMs: 3_600_000 });
  const first = presence();
  first.start();
  assert.deepEqual(first.gaps(), [], "the first run has nothing before it");
  assert.equal(currentHostPresence(), first);
  now += MINUTE; first.beat();
  now += 30 * MINUTE; first.stop();
  const stopped = JSON.parse(readFileSync(join(directory, "run", "presence.json"), "utf8"));
  assert.equal(stopped.stopped_at, "2026-11-11T08:31:00.000Z");
  assert.deepEqual(Object.keys(stopped).sort(), ["gaps", "last_alive_at", "schema_version", "started_at", "stopped_at"], "times only");
  assert.equal(currentHostPresence(), null);

  now += 2 * 3_600_000;
  const second = presence();
  second.start();
  assert.deepEqual(second.gaps(), [{ from: "2026-11-11T08:31:00.000Z", to: "2026-11-11T10:31:00.000Z", cause: "quit" }]);
  now += MINUTE; second.beat();
  // Killed: no stop. The next start reads the last heartbeat.
  now += 10 * MINUTE;
  const third = presence();
  third.start();
  assert.deepEqual(third.gaps()[0], { from: "2026-11-11T10:32:00.000Z", to: "2026-11-11T10:42:00.000Z", cause: "crash" });
  assert.equal(third.gaps().length, 2, "newest first, the earlier quit kept");
  third.stop();
});

test("RES-06 heartbeats more than three minutes apart are the computer asleep: written as sleep, and the owners are woken at once", async t => {
  const directory = await home(t);
  let now = Date.parse("2026-11-11T08:00:00.000Z"), woken = 0;
  const presence = new HostPresence({ homeDirectory: directory, now: () => new Date(now), onWake: () => { woken += 1; }, heartbeatMs: 3_600_000 });
  presence.start();
  now += MINUTE; presence.beat();
  now += PRESENCE_SLEEP_AFTER_MS; presence.beat();
  assert.equal(woken, 0, "exactly three minutes is not a sleep");
  now += 7 * 3_600_000; presence.beat();
  assert.equal(woken, 1);
  assert.deepEqual(presence.gaps(), [{ from: "2026-11-11T08:04:00.000Z", to: "2026-11-11T15:04:00.000Z", cause: "sleep" }]);
  for (let index = 0; index < 30; index += 1) { now += 10 * MINUTE; presence.beat(); }
  assert.equal(presence.gaps().length, 5, "the overview gets the latest five");
  assert.equal(JSON.parse(readFileSync(join(directory, "run", "presence.json"), "utf8")).gaps.length, 20, "the record keeps twenty");
  presence.stop();
});

test("RES-06 a record this version did not write is started afresh, not read as a stretch", async t => {
  const directory = await home(t);
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(join(directory, "run"));
  writeFileSync(join(directory, "run", "presence.json"), JSON.stringify({ schema_version: 99, started_at: "x", last_alive_at: "x", stopped_at: null, gaps: [] }));
  const presence = new HostPresence({ homeDirectory: directory, heartbeatMs: 3_600_000 });
  presence.start();
  assert.deepEqual(presence.gaps(), []);
  presence.stop();
});
