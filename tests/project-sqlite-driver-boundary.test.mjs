import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { sqliteDriverFindings, usesProjectSqliteDriver } from "../scripts/gates/project-sqlite-driver.mjs";

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

test("VG-17 createRequire and a program handed to something that runs it are callers too", () => {
  const file = "apps/sync-worker/test.mjs";
  for (const source of [
    'const DB = createRequire(import.meta.url)("better-sqlite3");',
    'const load = createRequire(root); load("better-sqlite3/lib/database");',
    'const DB = module.createRequire(root)("better-sqlite3");',
    'const where = createRequire(root).resolve("better-sqlite3");',
    'const load = createRequire(root); const where = load.resolve("better-sqlite3");',
    'const where = require.resolve("better-sqlite3");',
    'execFileSync("node", ["-e", `import("better-sqlite3")`]);',
    'execFileSync("node", ["--eval", `require("better-sqlite3")`]);',
    `execFileSync("node", ["--eval=require('better-sqlite3')"]);`,
    `execFileSync("node", ["-p", "require('better-sqlite3')"]);`,
    `execFileSync("node", ["-pe", "require('better-sqlite3')"]);`,
    `execFileSync("node", ["--print", "require('better-sqlite3')"]);`,
    `const program = "require('better-sqlite3')"; execFileSync("node", ["-e", program]);`,
    `const program = \`const DB = createRequire(root)("better-sqlite3");\`; execFileSync("node", ["-e", program]);`,
    `execSync(\`node -e "require('better-sqlite3')"\`);`,
    `execSync("node --input-type=module -e \\"import DB from 'better-sqlite3'\\"");`,
    `const command = "node -e \\"require('better-sqlite3')\\""; execSync(command);`,
    `spawnSync("sh", ["-c", "node -e \\"require('better-sqlite3')\\""]);`,
    `eval("require('better-sqlite3')");`,
    `new Function("require", "return require('better-sqlite3')");`,
    `vm.runInNewContext("require('better-sqlite3')");`,
    `new vm.Script("require('better-sqlite3')");`,
    `new Worker("require('better-sqlite3')", { eval: true });`,
  ]) assert.equal(usesProjectSqliteDriver(file, source), true, source);
  for (const source of [
    'const note = "see createRequire(x)(\\"better-sqlite3\\")";',
    '// createRequire(x)("better-sqlite3")',
    'const name = "better-sqlite3";',
    "assert.match(message, /better-sqlite3/);",
    'execFileSync("node", ["-e", "console.log(1)"]); const name = "better-sqlite3";',
    'createRequire(root)("other-package"); const name = "better-sqlite3";',
    `execSync("echo require('better-sqlite3')");`,
    `const fixture = "node -e require('better-sqlite3')";`, // a string nobody runs
    `new Worker("require('better-sqlite3')");`, // a path, not a program
    'assert.throws(() => eval(program), /better-sqlite3/);',
  ]) assert.equal(usesProjectSqliteDriver(file, source), false, source);
  assert.equal(usesProjectSqliteDriver("plugins/native/alchemist/src/a.ts", 'createRequire(root)("better-sqlite3");'), false, "its approved private driver");
});

test("VG-17 SQLD-10 the scan reaches every place code lives, sync-worker included, and only Alchemist may use the driver", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sqlite-driver-scan-"));
  const use = 'import DB from "better-sqlite3";\n';
  const put = (file, text = use) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  try {
    // No directory here has a package.json: the scan goes by where code lives, not by the workspace list. apps/sync-worker really has none.
    const reached = ["apps/sync-worker/test.mjs", "apps/sync-worker/worker/attachments.test.mjs", "apps/a/src/a.ts", "apps/a/tests/a.test.ts", "packages/a/tooling/a.mjs", "plugins/native/a/tests/a.test.tsx",
      "plugins/official-integrations/a/src/a.cjs", "modules/a/src/a.mts", "horizontal/a/bin/a.js", "server/src/a.cts", "tooling/plugin-cli/src/a.ts", "tooling/gates/a.mjs", "tests/a.test.ts", "scripts/a.mjs", "examples/a/src/a.jsx",
      // Rust and Swift output directories are walked, as the boundary check walked them before it shared this walk.
      "apps/a/target/a.js", "apps/a/.build/a.js",
      // SQLD-e: storage is on node:sqlite and no longer owns the old driver.
      "packages/storage/src/a.ts"];
    for (const file of reached) put(file);
    for (const file of ["plugins/native/alchemist/src/a.ts", "apps/a/dist/a.js", "apps/a/node_modules/b/a.js", "docs/a.ts", "apps/a/README.md"]) put(file);
    assert.deepEqual(sqliteDriverFindings(root).map(finding => finding.file).sort(), [...reached].sort());
    const [product, testing] = ["apps/a/src/a.ts", "tests/a.test.ts"].map(file => sqliteDriverFindings(root).find(finding => finding.file === file));
    assert.equal(product.text, "[project-sqlite-driver] open project connections through storage");
    assert.equal(testing.text, "[project-sqlite-driver] open test connections through test-kit or production connections through storage");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
