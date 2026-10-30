import { registerMaintenanceChecks } from "./fixtures/home-store-maintenance.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { describeSqliteBaseline, describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { CHARACTERS_STORE_BASELINE } from "@molis-ai/molis-work-module-characters";
import { FUNCTIONS_STORE_BASELINE } from "@molis-ai/molis-work-module-functions";
import { ASSISTANT_STORE_BASELINE, CONNECTORS_BASELINE, homeStores } from "@molis-ai/molis-work-app-local-host";
import { PAGES_DATABASE } from "@molis-ai/molis-work-plugin-pages";

const stores = [
  { owner: "characters", from: 1, to: 2, baseline: CHARACTERS_STORE_BASELINE },
  { owner: "functions", from: 3, to: 4, baseline: FUNCTIONS_STORE_BASELINE },
  { owner: "assistant", from: 2, to: 3, baseline: ASSISTANT_STORE_BASELINE },
  { owner: "pages", from: 1, to: 2, baseline: PAGES_DATABASE },
  { owner: "connectors", from: 1, to: 2, baseline: CONNECTORS_BASELINE },
  { owner: "plugin-runtime", from: 2, to: 3, baseline: homeStores().get("plugin-runtime")!.library!.baseline },
];

test("RAC-2310 maintenance refuses a wrong old structure at the expected version without changing the database", async t => {
  for (const { owner, from, to } of stores) {
    const schema = readFileSync(new URL(`./fixtures/${owner}-before-maintenance.sql`, import.meta.url), "utf8");
    const sql = readFileSync(new URL(`./fixtures/${owner}-maintenance-v${to}.sql`, import.meta.url), "utf8");
    for (const change of ["column", "index", "view", "trigger"]) await t.test(`${owner}: unexpected ${change}`, () => {
      const scratch = mkdtempSync(join(tmpdir(), "maintenance-wrong-shape-")), file = join(scratch, "store.db");
      try {
        const db = new DatabaseSync(file);
        db.exec(schema); db.exec(`PRAGMA user_version = ${from}`);
        const first = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name LIMIT 1").get()!;
        const table = `"${String(first.name).replaceAll('"', '""')}"`;
        if (change === "column") db.exec(`ALTER TABLE ${table} ADD COLUMN unexpected TEXT`);
        if (change === "index") db.exec(`CREATE INDEX unexpected_index ON ${table} (1)`);
        if (change === "view") db.exec(`CREATE VIEW unexpected_view AS SELECT * FROM ${table}`);
        if (change === "trigger") db.exec(`CREATE TRIGGER unexpected_trigger AFTER INSERT ON ${table} BEGIN SELECT 1; END`);
        db.close();
        const before = readFileSync(file), maintenance = new DatabaseSync(file);
        try { registerMaintenanceChecks(maintenance, owner); assert.throws(() => maintenance.exec(sql), "a known version alone must not authorize a different structure"); }
        finally { maintenance.close(); }
        assert.deepEqual(readFileSync(file), before, "every persisted byte stays as it was");
      } finally { rmSync(scratch, { recursive: true, force: true }); }
    });
  }
});

test("RAC-2311 the offline CLI lists without writes, applies the real SQL to the current baseline, and repeats without writes", async t => {
  const script = fileURLToPath(new URL("./fixtures/home-store-maintenance.mjs", import.meta.url));
  for (const { owner, from, to, baseline } of stores) await t.test(owner, () => {
    const scratch = mkdtempSync(join(tmpdir(), "maintenance-cli-")), file = join(scratch, "store.db");
    try {
      const db = new DatabaseSync(file);
      db.exec(readFileSync(new URL(`./fixtures/${owner}-before-maintenance.sql`, import.meta.url), "utf8"));
      db.exec(`PRAGMA user_version = ${from}`); db.close();
      const run = (mode: string) => spawnSync(process.execPath, [script, mode, "--store", owner, "--database", file], { encoding: "utf8" });
      const before = readFileSync(file), listed = run("list");
      assert.equal(listed.status, 0, listed.stderr);
      assert.equal(JSON.parse(listed.stdout).version, from);
      assert.deepEqual(readFileSync(file), before);
      const applied = run("apply");
      assert.equal(applied.status, 0, applied.stderr);
      assert.equal(JSON.parse(applied.stdout).changed, true);
      const current = new DatabaseSync(file, { readOnly: true });
      try {
        assert.equal(current.prepare("PRAGMA user_version").get()!.user_version, to);
        assert.deepEqual(describeSqliteSchema(current), describeSqliteBaseline(baseline));
        assert.deepEqual(current.prepare("PRAGMA integrity_check").all().map(row => row.integrity_check), ["ok"]);
        assert.deepEqual(current.prepare("PRAGMA foreign_key_check").all(), []);
      } finally { current.close(); }
      const after = readFileSync(file), repeated = run("apply");
      assert.equal(repeated.status, 0, repeated.stderr);
      assert.equal(JSON.parse(repeated.stdout).changed, false);
      assert.deepEqual(readFileSync(file), after);
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  });
});
