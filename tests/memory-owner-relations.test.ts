import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";

test("a Memory owner relation cannot be rebound by a second connection or a later retry", () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-memory-owner-relation-"));
  const first = openMemoryLedger({ homeDirectory }), second = openMemoryLedger({ homeDirectory });
  const original = { scope: "character" as const, owner: "fixed-owner", project_id: "original-project", title: "First", subject: "original-character" };
  try {
    first.noteOwner(original);
    const seen = first.owners("original-project");
    for (const change of [{ project_id: "other-project" }, { subject: "other-character" }, { project_id: null }]) {
      assert.throws(() => second.noteOwner({ ...original, ...change, title: "Stale replacement" }), { code: "memory.conflict" });
      assert.deepEqual(first.owners("original-project"), seen);
      assert.deepEqual(second.owners("other-project"), []);
    }
    second.noteOwner({ ...original, title: "Current title" });
    first.noteOwner({ ...original, title: "Retried title", subject: null });
    assert.deepEqual(second.owners("original-project"), [{ scope: "character", owner: original.owner, title: "Retried title", subject: original.subject }]);
    first.noteOwner({ ...original, owner: "unproven-project", project_id: null });
    assert.throws(() => second.noteOwner({ ...original, owner: "unproven-project" }), { code: "memory.conflict" });
    assert.equal(first.owners("original-project").length, 1, "a missing project cannot be inferred from a later call");
  } finally { first.close(); second.close(); rmSync(homeDirectory, { recursive: true, force: true }); }
});

test("a trusted preparation may fill a missing subject but cannot replace it afterwards", () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-memory-owner-subject-"));
  let ledger = openMemoryLedger({ homeDirectory });
  const original = { scope: "character" as const, owner: "fixed-owner", project_id: "project", title: "Known owner" };
  try {
    ledger.noteOwner(original); ledger.noteOwner({ ...original, subject: "original-character" });
    ledger.close(); ledger = openMemoryLedger({ homeDirectory });
    assert.throws(() => ledger.noteOwner({ ...original, subject: "replacement-character" }), { code: "memory.conflict" });
    assert.deepEqual(ledger.owners("project"), [{ scope: "character", owner: original.owner, title: original.title, subject: "original-character" }]);
  } finally { ledger.close(); rmSync(homeDirectory, { recursive: true, force: true }); }
});
