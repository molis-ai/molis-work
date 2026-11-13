import assert from "node:assert/strict";
import test from "node:test";
import { startOfToday } from "../apps/local-host/src/assistant/assistant-usage-ledger.js";

// BL-assistant-usage-dst-midnight: today's usage starts at local midnight, whose UTC offset can differ from the offset at the
// query instant on a DST-change day.
test("BL-assistant-usage-dst-midnight local midnight keeps the right offset on both sides of a DST change", () => {
  assert.equal(startOfToday(new Date("2026-11-01T20:00:00Z"), "America/Los_Angeles"), "2026-11-01T07:00:00.000Z",
    "Nov 1 is still PDT at midnight (UTC-7), even though the query is after the fall-back");
  assert.equal(startOfToday(new Date("2026-03-08T19:00:00Z"), "America/Los_Angeles"), "2026-03-08T08:00:00.000Z",
    "Mar 8 midnight is PST (UTC-8), even though the query is after the spring-forward");
  assert.equal(startOfToday(new Date("2026-11-13T12:00:00Z"), "Asia/Shanghai"), "2026-11-12T16:00:00.000Z");
});
