import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openTestShelfStore } from "./shelf-direct-actions.js";

// Shelf S3 (① ruling D3): the one-time maintenance that takes a Home's Shelf catalog from version 1 to 2, rehearsed on a throwaway
// Home only. Version 1 is written here the way the build before S3 wrote it: every item with an `origin_realpath` (a path or null).
const TOOL = fileURLToPath(new URL("./fixtures/shelf-catalog-maintenance.mjs", import.meta.url));

test("the Shelf catalog maintenance lists, rewrites version 1 as 2 once, keeps every item and refuses the real Home", { timeout: 60_000 }, async t => {
  const home = mkdtempSync(join(tmpdir(), "shelf-catalog-maintenance-")), elsewhere = mkdtempSync(join(tmpdir(), "shelf-real-home-"));
  t.after(() => { rmSync(home, { recursive: true, force: true }); rmSync(elsewhere, { recursive: true, force: true }); });
  const store = openTestShelfStore(home, { disabled: true });
  const file = await store.admitFile({ filename: "a.txt", bytes: Buffer.from("原件的副本") });
  const text = await store.admitText("一段文字");
  const catalogFile = join(home, "shelf", "catalog.json");
  const current = JSON.parse(readFileSync(catalogFile, "utf8")) as { version: number; items: Array<Record<string, unknown>> };
  const privatePath = join(elsewhere, "私人", "a.txt");
  writeFileSync(catalogFile, JSON.stringify({ ...current, version: 1,
    items: current.items.map(item => ({ ...item, origin_realpath: item.item_id === file.item_id ? privatePath : null })) }, null, 2));
  chmodSync(catalogFile, 0o600);
  const before = readFileSync(catalogFile);
  await assert.rejects(openTestShelfStore(home, { disabled: true }).snapshot(), /Shelf 目录格式不符/u, "the new build refuses a version 1 catalog");

  const tool = (args: string[], env: Record<string, string> = {}) => {
    const run = spawnSync(process.execPath, [TOOL, ...args, "--json"], { encoding: "utf8", env: { ...process.env, MOLIS_WORK_HOME: elsewhere, ...env } });
    return { code: run.status, report: run.status === 0 ? JSON.parse(run.stdout) as Record<string, unknown> : null, error: run.stderr };
  };

  // Listing reads only, and never names a path.
  const listed = tool(["list", "--home", home]);
  assert.deepEqual([listed.code, listed.report?.version, listed.report?.items, listed.report?.with_path, listed.report?.needs_rewrite], [0, 1, 2, 2, true], listed.error);
  assert.ok(!JSON.stringify(listed.report).includes(privatePath));
  assert.deepEqual(readFileSync(catalogFile), before, "list writes nothing");

  // The real Home is refused for listing, and for rewriting without the window.
  for (const args of [["list", "--home", home], ["rewrite", "--home", home]]) {
    assert.equal(tool(args, { MOLIS_WORK_HOME: home }).code, 2, args.join(" "));
  }
  assert.deepEqual(readFileSync(catalogFile), before);

  // Rewriting keeps every item and its mode, drops the paths, and the store opens it.
  const rewritten = tool(["rewrite", "--home", home]);
  assert.deepEqual([rewritten.code, rewritten.report?.rewritten, rewritten.report?.items], [0, true, 2], rewritten.error);
  const after = readFileSync(catalogFile, "utf8");
  assert.ok(!after.includes("origin_realpath") && !after.includes(privatePath));
  assert.equal(statSync(catalogFile).mode & 0o777, 0o600);
  const reopened = await openTestShelfStore(home, { disabled: true }).snapshot();
  assert.deepEqual(reopened.materials.map(item => item.item_id).sort(), [file.item_id, text.item_id].sort());
  assert.ok(!JSON.stringify(reopened).includes(privatePath));
  assert.equal(openTestShelfStore(home, { disabled: true }).readFile(file.item_id).bytes.toString("utf8"), "原件的副本");

  // Again, nothing changes; a catalog it cannot vouch for is left as it is.
  const again = tool(["rewrite", "--home", home]);
  assert.deepEqual([again.code, again.report?.rewritten], [0, false]);
  assert.equal(readFileSync(catalogFile, "utf8"), after);
  writeFileSync(catalogFile, JSON.stringify({ ...JSON.parse(after), version: 3 }));
  const odd = readFileSync(catalogFile);
  assert.equal(tool(["rewrite", "--home", home]).code, 1);
  assert.deepEqual(readFileSync(catalogFile), odd);
});
