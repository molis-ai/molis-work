import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { bindDatabaseSpace, ensureStorageSpace, personalStorageSpace } from "@molis-ai/molis-work-storage";

test("ASR-11 expected Home plugin shapes are constructed once per form while each real store is checked again", async t => {
  const fixtures = [];
  for (const withSpace of [false, false, true, true]) {
    const home = await mkdtemp(join(tmpdir(), "home-plugin-read-cost-"));
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    t.after(async () => { catalog.close(); await rm(home, { recursive: true, force: true }); });
    const project = await catalog.createProject({ display_name: "read cost", actor_id: "test" });
    mkdirSync(join(home, "plugin-runtime"));
    const file = join(home, "plugin-runtime", "plugin-runtime.db");
    const db = new DatabaseSync(file);
    const location = db.location();
    assert.ok(location);
    try {
      db.exec(readFileSync(new URL("./fixtures/home-store-schemas/plugin-runtime.sql", import.meta.url), "utf8"));
      if (withSpace) bindDatabaseSpace(db, ensureStorageSpace(home));
    } finally { db.close(); }
    fixtures.push({ home, catalog, project, file, location });
  }
  const scratch = { plain: 0, scoped: 0 }, connections = new Set<DatabaseSync>();
  const exec = DatabaseSync.prototype.exec, prepare = DatabaseSync.prototype.prepare;
  const ddl = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    if (this.location() === null && sql.includes("plugin_runtime_installs") && sql.includes("plugin_consents")) {
      scratch[sql.includes("molis_storage_space") ? "scoped" : "plain"]++;
    }
    return exec.call(this, sql);
  });
  let validations = 0;
  const checks = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    if (sql === "PRAGMA user_version" && fixtures.some(f => f.location === this.location())) { validations++; connections.add(this); }
    return prepare.call(this, sql);
  });
  try {
    for (let attempt = 0; attempt < 2; attempt++) for (const f of fixtures) {
      assert.ok(f.catalog.projectPluginMembership(f.project.project_id).plugins.includes("goals"));
    }
    assert.deepEqual(scratch, { plain: 1, scoped: 1 }, "only immutable expected structures are shared across Homes");
    assert.equal(validations, 8, "each real read checks its version independently");
    assert.equal(connections.size, 8, "no live database connection is cached");
    for (const connection of connections) assert.throws(() => connection.prepare("SELECT 1"), /not open/u);

    // All readers have closed. A later writer may corrupt the same file; a warm expected cache must not accept it.
    for (const [index, sql, expected] of [
      [0, "PRAGMA user_version=2", { code: "storage.store_too_new" }],
      [1, "DROP TABLE plugin_private_values", { code: "actions.execution_failed" }],
      [2, "UPDATE molis_storage_space SET space_id=?, descriptor=? WHERE singleton=1", { code: "actions.forbidden" }],
    ] as const) {
      const f = fixtures[index]!, db = new DatabaseSync(f.file);
      try {
        if (index === 2) {
          const foreign = personalStorageSpace("https://issuer.example", "test", "other-person");
          db.prepare(sql).run(foreign.spaceId, JSON.stringify(foreign));
        } else db.exec(sql);
      } finally { db.close(); }
      const before = readFileSync(f.file);
      assert.throws(() => f.catalog.projectPluginMembership(f.project.project_id), expected);
      assert.deepEqual(readFileSync(f.file), before, "refusal does not repair or relabel the file");
    }
    const remaining = fixtures[3]!;
    assert.ok(remaining.catalog.projectPluginMembership(remaining.project.project_id).plugins.includes("goals"));
    assert.deepEqual(scratch, { plain: 1, scoped: 1 });
  } finally { ddl.mock.restore(); checks.mock.restore(); }
});
