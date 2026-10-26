import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { type TestContext } from "node:test";
import { projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { PROBE, partitionFile, partitionHome, write } from "./fixtures/partition-probe.js";

function directoryPair(t: TestContext, owner: string, partition: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "molis-owner-directory-interleaving-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source"), target = join(root, "target"), saved = join(root, "original-target-owner");
  for (const home of [source, target]) {
    mkdirSync(join(home, owner, partition), { recursive: true });
    writeFileSync(join(home, owner, partition, "selected"), home === source ? "source selected" : "target selected");
    writeFileSync(join(home, owner, "unselected"), home === source ? "source unselected" : "target unselected");
  }
  return { target,
    assertCurrent() { assert.equal(realpathSync(target), target); },
    redirect() { renameSync(join(target, owner), saved); symlinkSync(join(source, owner), join(target, owner)); },
    verify() {
      assert.equal(readFileSync(join(source, owner, partition, "selected"), "utf8"), "source selected");
      assert.equal(readFileSync(join(source, owner, "unselected"), "utf8"), "source unselected");
      assert.equal(existsSync(join(saved, partition)), false, "only the original target project was removed");
      assert.equal(readFileSync(join(saved, "unselected"), "utf8"), "target unselected");
    },
  };
}

for (const owner of ["plugin-builder", "alchemist", "artifacts"] as const) test(`MEM-40-FILE-RM-01: ${owner} maintenance cannot follow an ancestor replaced while its Promise is pending`, async t => {
  const pair = directoryPair(t, owner, owner === "plugin-builder" ? "gone" : "projects/gone");
  // Real filesystem interleaving: the public call has run to its first await, then its caller replaces the ancestor.
  const pending = projectDeletedHooksFor(pair.target).clear(owner, "gone", undefined, pair);
  pair.redirect();
  assert.equal(await pending, true);
  pair.verify();
});

test("MEM-40-FILE-RM-02: partition cleanup cannot yield between its post-close checks and directory removal", async t => {
  const pair = directoryPair(t, PROBE, "projects/gone"), f = partitionHome(t, undefined, pair.target);
  try {
    await f.ready(); await f.invoke(write, { text: "target selected" }, "gone");
    const wal = `${partitionFile(pair.target, "gone")}-wal`;
    assert.equal(existsSync(wal), true, "the running owner holds the real partition open");
    let queued = false;
    const control = { assertCurrent() {
      pair.assertCurrent();
      if (!existsSync(wal) && !queued) { queued = true; queueMicrotask(() => pair.redirect()); }
    } };
    assert.equal(await f.hooks.clear(PROBE, "gone", undefined, control), true);
    assert.equal(queued, true); pair.verify();
  } finally { await f.host.close(); }
});
