import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { ensureStorageSpace, homeSqlitePath, openBaselineHomeSqlite, openExistingBaselineHomeSqlite, personalStorageSpace } from "@molis-ai/molis-work-storage";

test("S-project-space-preflight D0276: existing-only Home reads refuse foreign or missing ownership without reading business data or changing files", async t => {
  const root = mkdtempSync(join(tmpdir(), "molis-existing-space-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const baseline = { version: 1, schema: "CREATE TABLE notes(id TEXT PRIMARY KEY);" };
  for (const damage of ["foreign", "database-binding", "home-binding"] as const) await t.test(damage, () => {
    const source = join(root, damage, "source"), home = join(root, damage, "target");
    ensureStorageSpace(source, personalStorageSpace("https://auth.example", "work", "alice"));
    const writer = openBaselineHomeSqlite(source, "notes", baseline);
    writer.prepare("INSERT INTO notes VALUES (?)").run("private-content"); writer.close();
    ensureStorageSpace(home, personalStorageSpace("https://auth.example", "work", damage === "foreign" ? "bob" : "alice"));
    const file = homeSqlitePath(home, "notes");
    mkdirSync(dirname(file)); copyFileSync(homeSqlitePath(source, "notes"), file);
    if (damage === "database-binding") {
      const db = new DatabaseSync(file);
      try { db.exec("DROP TABLE molis_storage_space"); } finally { db.close(); }
    }
    if (damage === "home-binding") rmSync(join(home, "storage-space.json"));
    const bytes = readFileSync(file), mode = statSync(file).mode, entries = readdirSync(dirname(file));
    const homeEntries = readdirSync(home);
    const descriptor = existsSync(join(home, "storage-space.json")) ? readFileSync(join(home, "storage-space.json")) : null;
    let businessRead = false;
    assert.throws(() => {
      const reader = openExistingBaselineHomeSqlite(home, "notes", baseline)!;
      try { businessRead = true; reader.prepare("SELECT id FROM notes").all(); } finally { reader.close(); }
    }, error => error instanceof ActionError && error.code === "storage.space_ownership_mismatch" && error.kind === "forbidden");
    assert.equal(businessRead, false);
    assert.deepEqual(readFileSync(file), bytes); assert.equal(statSync(file).mode, mode);
    assert.deepEqual(readdirSync(dirname(file)), entries); assert.deepEqual(readdirSync(home), homeEntries);
    assert.deepEqual(existsSync(join(home, "storage-space.json")) ? readFileSync(join(home, "storage-space.json")) : null, descriptor);
  });
});
