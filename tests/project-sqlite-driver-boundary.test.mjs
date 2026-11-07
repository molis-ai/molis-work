import assert from "node:assert/strict";
import test from "node:test";
import { usesProjectSqliteDriver } from "../scripts/gates/project-sqlite-driver.mjs";

test("C3 SQLD-10: only Alchemist may import the old driver: not storage, not the Host, not another plugin, not a test", () => {
  for (const path of ["packages/storage/src/sqlite-connection.ts", "packages/storage/src/snapshot-sqlite.ts", "apps/local-host/src/project.ts", "apps/local-host/src/alchemist-service-host.ts", "tests/lock.test.ts", "plugins/native/notes/src/db.ts", "plugins/native/alchemistry/src/db.ts"]) {
    for (const source of ['import type DB from "better-sqlite3";', 'await import("better-sqlite3");', 'require("better-sqlite3/lib/database")',
      'execFileSync(node, ["--input-type=module", "-e", "import DB from \'better-sqlite3\';"]);']) {
      assert.equal(usesProjectSqliteDriver(path, source), true, path + " " + source);
    }
  }
  assert.equal(usesProjectSqliteDriver("plugins/native/alchemist/src/studio/server/db/open-database.ts", 'import DB from "better-sqlite3";'), false);
  assert.equal(usesProjectSqliteDriver("tests/db.test.ts", 'import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";'), false);
  assert.equal(usesProjectSqliteDriver("scripts/audit.mjs", '// Docs: require("better-sqlite3")'), false);
});
