import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openTestShelfStore } from "./shelf-direct-actions.js";

/** A half of a two-unit character whose other half is missing: what a cut in the middle of one leaves at the end. */
const LONE_HALF = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

test("RAC-2201 a stored Shelf name over 180 UTF-16 units is cut in whole characters, with no half one left", async () => {
  const home = mkdtempSync(join(tmpdir(), "shelf-item-names-"));
  try {
    const store = openTestShelfStore(home, { disabled: true });
    // 179 x's and the 🙂 are 181 units: cutting at unit 180 would leave the 🙂's high half alone.
    const split = await store.admit({ filename: `${"x".repeat(179)}🙂.md`, bytes: Buffer.from("正文") });
    assert.equal(split.name, "x".repeat(179), "180 whole characters at most: the half at unit 180 goes, not stays");
    assert.deepEqual([[...split.name].length, split.name.length, LONE_HALF.test(split.name)], [179, 179, false], "no half of a character");
    // A name over the limit with nothing to cut between is cut at 180 units, as before.
    assert.equal((await store.admit({ filename: "z".repeat(250), bytes: Buffer.from("正文") })).name, "z".repeat(180));
    // A name within the limit comes back as it was, extension and all.
    assert.equal((await store.admit({ filename: `${"y".repeat(178)}🙂`, bytes: Buffer.from("正文") })).name, `${"y".repeat(178)}🙂`);
    assert.equal((await store.admit({ filename: "notes.md", bytes: Buffer.from("正文") })).name, "notes.md");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
