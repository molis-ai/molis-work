import assert from "node:assert/strict";
import test from "node:test";
import { usesProjectSqliteDriver } from "../scripts/gates/project-sqlite-driver.mjs";

test("C3: project runtime and tests must open their database through its owner", () => {
  for (const path of ["apps/local-host/src/project.ts", "tests/lock.test.ts", "plugins/native/notes/src/db.ts"]) {
    for (const source of ['import type DB from "better-sqlite3";', 'await import("better-sqlite3");', 'require("better-sqlite3/lib/database")',
      'execFileSync(node, ["--input-type=module", "-e", "import DB from \'better-sqlite3\';"]);']) {
      assert.equal(usesProjectSqliteDriver(path, source), true, path + " " + source);
    }
  }
  for (const file of ["packages/storage/src/sqlite-connection.ts", "plugins/native/alchemist/src/store.ts"]) {
    assert.equal(usesProjectSqliteDriver(file, 'import DB from "better-sqlite3";'), false);
  }
  assert.equal(usesProjectSqliteDriver("tests/db.test.ts", 'import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";'), false);
  assert.equal(usesProjectSqliteDriver("scripts/audit.mjs", '// Docs: require("better-sqlite3")'), false);
});
