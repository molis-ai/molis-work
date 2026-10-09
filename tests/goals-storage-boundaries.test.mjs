import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkGoalStorageOwnership } from "../scripts/check-package-boundaries.mjs";

test("production Store/Web boundaries reject restored Goal schema and coverage SQL", () => {
  for (const file of ["apps/desktop/launchers/web/server.ts", "apps/local-host/src/web-request.ts"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.deepEqual(checkGoalStorageOwnership(source), [], file);
    for (const sql of ["CREATE TABLE goals (goal_id TEXT)", "ALTER TABLE policy_bindings ADD COLUMN note TEXT",
      "CREATE TABLE IF NOT EXISTS project_guidance_revisions (revision INTEGER)",
      "CREATE UNIQUE INDEX history_idx ON goal_relations(from_goal_id)",
      "INSERT INTO acceptance_criteria VALUES (?)", "SELECT * FROM planning_method_packs", "UPDATE goals SET title = ''"]) {
      assert.notDeepEqual(checkGoalStorageOwnership(source + `\nstore.db.exec(${JSON.stringify(sql)});`), [], sql);
    }
  }
  assert.deepEqual(checkGoalStorageOwnership("CREATE TABLE events(seq INTEGER); SELECT * FROM schema_migrations; UPDATE boards SET active_goal_id = NULL;"), []);
});
