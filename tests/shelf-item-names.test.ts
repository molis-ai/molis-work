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
    // The extension now stays: 180 units are 177 x's plus ".md", and the cut still lands between whole characters.
    assert.equal(split.name, `${"x".repeat(177)}.md`, "the extension is kept, and the stem is cut to the room it leaves");
    assert.deepEqual([[...split.name].length, split.name.length, LONE_HALF.test(split.name)], [180, 180, false], "180 whole characters and units, no half of a character");
    // A name over the limit with nothing to cut between is cut at 180 units, as before.
    assert.equal((await store.admit({ filename: "z".repeat(250), bytes: Buffer.from("正文") })).name, "z".repeat(180));
    // A name within the limit comes back as it was, extension and all.
    assert.equal((await store.admit({ filename: `${"y".repeat(178)}🙂`, bytes: Buffer.from("正文") })).name, `${"y".repeat(178)}🙂`);
    assert.equal((await store.admit({ filename: "notes.md", bytes: Buffer.from("正文") })).name, "notes.md");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("RAC-2290 a name over 180 units keeps its extension: 200 x's and .pdf stay a pdf", async () => {
  const home = mkdtempSync(join(tmpdir(), "shelf-item-names-"));
  try {
    const store = openTestShelfStore(home, { disabled: true });
    const item = await store.admit({ filename: `${"x".repeat(200)}.pdf`, bytes: Buffer.from("%PDF-1.4") });
    assert.equal(item.name, `${"x".repeat(176)}.pdf`, "the extension is kept; the stem takes the room left");
    assert.equal(item.name.length, 180, "180 UTF-16 units in all");
    assert.equal(item.kind, "pdf", "so the type stays pdf instead of falling to file");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("RAC-2291 cutting the stem to the room the extension leaves still cuts between whole characters", async () => {
  const home = mkdtempSync(join(tmpdir(), "shelf-item-names-"));
  try {
    const store = openTestShelfStore(home, { disabled: true });
    // 176 x's and the 🙂 are 178 units; ".md" leaves 177, and unit 177 is the emoji's high half, so the whole emoji goes.
    const item = await store.admit({ filename: `${"x".repeat(176)}🙂.md`, bytes: Buffer.from("正文") });
    assert.equal(item.name, `${"x".repeat(176)}.md`, "the cut lands between whole characters");
    assert.ok(item.name.endsWith(".md"), "the extension is still there");
    assert.deepEqual([LONE_HALF.test(item.name), item.name.length <= 180, item.kind], [false, true, "markdown"]);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("RAC-2292 names within the limit, and long names with no extension, come back as before", async () => {
  const home = mkdtempSync(join(tmpdir(), "shelf-item-names-"));
  try {
    const store = openTestShelfStore(home, { disabled: true });
    assert.equal((await store.admit({ filename: `${"y".repeat(177)}.md`, bytes: Buffer.from("正文") })).name, `${"y".repeat(177)}.md`, "exactly 180 units is left alone");
    assert.equal((await store.admit({ filename: "notes.md", bytes: Buffer.from("正文") })).name, "notes.md");
    assert.equal((await store.admit({ filename: "z".repeat(250), bytes: Buffer.from("正文") })).name, "z".repeat(180), "no extension: cut at 180 units as before");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("RAC-2293 an extension longer than 10 characters is not an extension, so the name is cut as before", async () => {
  const home = mkdtempSync(join(tmpdir(), "shelf-item-names-"));
  try {
    const store = openTestShelfStore(home, { disabled: true });
    const item = await store.admit({ filename: `${"a".repeat(200)}.${"b".repeat(11)}`, bytes: Buffer.from("正文") });
    assert.equal(item.name, "a".repeat(180), "the long tail is not treated as an extension: it is cut off like before");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("RAC-2294 a leading-dot name over the limit stays non-empty and at most 180 units", async () => {
  const home = mkdtempSync(join(tmpdir(), "shelf-item-names-"));
  try {
    const store = openTestShelfStore(home, { disabled: true });
    const item = await store.admit({ filename: `.${"a".repeat(250)}`, bytes: Buffer.from("正文") });
    assert.equal(item.name, `.${"a".repeat(179)}`, "the leading dot is kept, the name is cut to 180 units");
    assert.ok(item.name.length > 0 && item.name.length <= 180);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
