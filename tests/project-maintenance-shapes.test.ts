import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { maintainProject } from "./fixtures/project-maintenance.mjs";

test("RAC-2323 every project maintenance step refuses unknown columns, indexes, views, triggers and versions without changing a byte", t => {
  const home = mkdtempSync(join(tmpdir(), "project-maintenance-shapes-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  for (const target of [8, 9, 10, 11]) {
    for (const [index, sql] of ["ALTER TABLE events ADD COLUMN unexpected TEXT", "CREATE INDEX unexpected ON events(type)",
      "CREATE VIEW unexpected AS SELECT 1", "CREATE TRIGGER unexpected AFTER INSERT ON events BEGIN SELECT 1; END", "PRAGMA user_version=99"].entries()) {
      const file = join(home, `${target}-${index}.db`), db = new DatabaseSync(file);
      db.exec(readFileSync(new URL(`./fixtures/project-database-schema-v${target - 1}.sql`, import.meta.url), "utf8"));
      db.exec(`PRAGMA user_version=${target - 1}`); db.exec(sql); db.close();
      const before = readFileSync(file); assert.throws(() => maintainProject(file, target, true), /structure mismatch|version mismatch/u);
      assert.deepEqual(readFileSync(file), before, `${target}: ${sql}`);
    }
  }
});
