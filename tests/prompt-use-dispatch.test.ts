import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { homeAgentDefinitions } from "@molis-ai/molis-work-app-local-host";

// B4 (round-2 review): the golden-home prompt uses differed between two runs over the same Home because a prompt use was written when
// its text was read, before anyone knew whether the model call would be dispatched — a call refused first (`actions.forbidden` in the
// generation log) still counted. A use is now recorded by the caller through the `record` callback once it dispatches.
test("B4: reading a prompt for a model call records no use; the dispatched call records one", async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-prompt-use-"));
  try {
    const definitions = homeAgentDefinitions(home), key = "system:knowledge/knowledge.organize";
    assert.equal(definitions.prompt(key).last_used, undefined, "nothing used yet");
    const read = definitions.instruction("system:knowledge", "knowledge.organize", "knowledge.organize", false);
    assert.ok(read.body.length > 0, "the text is still read");
    assert.equal(definitions.prompt(key).last_used, undefined, "a read that no model call follows records no use");
    assert.equal(typeof read.record, "function", "the caller gets the recording callback");
    read.record!();
    assert.ok(definitions.prompt(key).last_used, "a dispatched call records a use");
    // The dispatch hook may be asked more than once (a retried dispatch): one use, not one per attempt.
    read.record!();
    const db = new DatabaseSync(join(home, "agent-definitions", "agent-definitions.db"), { readOnly: true });
    try { assert.equal((db.prepare("SELECT COUNT(*) AS n FROM prompt_uses WHERE key = ?").get(key) as { n: number }).n, 1, "two calls of the hook record one row"); }
    finally { db.close(); }
  } finally { await rm(home, { recursive: true, force: true }); }
});
