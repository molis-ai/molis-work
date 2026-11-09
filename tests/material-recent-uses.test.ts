import assert from "node:assert/strict";
import test from "node:test";

import type { MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { MATERIAL_RECENT_USES_SCHEMA_SQL, MaterialRecentUses } from "@molis-ai/molis-work-module-projects";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";

const ref = (n: number): MaterialRef => ({ subject: { kind: "workspace_file", id: `workspace-a:notes/${n}.md` }, pin: { mode: "current", read_revision: `size:${n}` } });

test("SSC-12 「最近用过」 keeps twenty references per caller, newest first, and a reference used again moves to the front", () => {
  const db = openTestSqlite(":memory:");
  try {
    db.exec(MATERIAL_RECENT_USES_SCHEMA_SQL);
    const recent = new MaterialRecentUses(db);
    const person = { kind: "user", id: "user-1" } as const, plugin = { kind: "plugin", id: "goals" } as const;
    for (let n = 1; n <= 25; n += 5) recent.record(person, [1, 2, 3, 4, 5].map(step => ref(n + step - 1)), "2026-11-08T00:00:00.000Z");
    const listed = recent.list(person);
    assert.equal(listed.length, 20, "the oldest five fell off");
    assert.deepEqual(listed[0], ref(25), "the last one recorded is the newest");
    assert.deepEqual(listed.at(-1), ref(6));
    recent.record(person, [ref(10)], "2026-11-08T00:01:00.000Z");
    assert.deepEqual(recent.list(person)[0], ref(10));
    assert.equal(recent.list(person).length, 20, "used again: moved, not added");
    assert.deepEqual(recent.list(plugin), [], "each caller has its own");
    recent.record(plugin, [ref(1)], "2026-11-08T00:02:00.000Z");
    assert.deepEqual(recent.list(plugin), [ref(1)]);
    assert.equal(recent.list(person).length, 20);
  } finally {
    db.close();
  }
});
