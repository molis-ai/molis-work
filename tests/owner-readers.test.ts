import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoGoals } from "@molis-ai/molis-work-app-local-host";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { goalsQueryOf } from "./fixtures/goal-application.js";

// specs/repository-anti-corruption W2-06: a table is read and written only by the package that creates it
// (scripts/gates/table-owners.mjs). The host used to run SQL on four tables it does not own; these are the owners' own
// answers it asks now (Coding's list of background work is its own query now: tests/coding-background-tasks.test.ts). The host-side tests
// (tests/uninstall-catalog.test.ts, tests/im-local-project.test.ts) cover the callers; the Host's Feed caller, the release of a source's
// history, went with FI-6, and the two read functions only it used lost their last caller and were deleted (2026-10-28, T-001). The
// Runtime Feed releases through the Home's ledger: tests/feed-runtime-plugin.test.ts RAC-518.

async function withProject(prefix: string, run: (store: LocalProjectDatabase, directory: string) => void | Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  const store = await (async () => { const path = join(directory, "project.db"); await seedDemoGoals(path); return new LocalProjectDatabase(path); })();
  try { await run(store, directory); } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
}

test("seeding the demo project makes V1 the active Goal through the Goals command, so the journal records the move", async () => {
  await withProject("owner-readers-demo-", (store) => {
    assert.equal(goalsQueryOf(store).getBoard(DEMO_PROJECT_ID)?.active_goal_id, "V1");
    const moves = store.db.prepare("SELECT object_id, reason FROM events WHERE project_id = ? AND type = ?").all(DEMO_PROJECT_ID, `${GOALS_PLUGIN_ID}:board.active_goal_changed`) as Array<{ object_id: string; reason: string }>;
    assert.deepEqual(moves.map((move) => move.object_id), ["V1"]);
    assert.ok(moves[0]!.reason.length > 0);
  });
});
