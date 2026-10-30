import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import Database from "better-sqlite3";
import { createHomeSnapshot, homeStores } from "@molis-ai/molis-work-app-local-host";
import { readSqliteSnapshotMetadata } from "@molis-ai/molis-work-storage";
import { smallSnapshotHome, snapshotBusinessFingerprint } from "./fixtures/home-snapshot-small.js";

// SC-4: only the leased backup-set path can consume the literal retired-store metadata declaration.
test("RAC-104-S-08: correct/wrong-owner/wrong-version metadata and real backups never query business rows or write the source", async t => {
  for (const kind of ["correct", "wrong-owner", "wrong-version"] as const) await t.test(kind, async t => {
    const f = await smallSnapshotHome(t), store = homeStores().get("sessions")!;
    const retained = store.snapshot.retained!.database, source = join(f.home, store.path, retained.file);
    await mkdir(dirname(source), { recursive: true });
    const writer = new DatabaseSync(source);
    try {
      writer.exec('CREATE TABLE session_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE sessions (id TEXT PRIMARY KEY,title TEXT NOT NULL);');
      writer.prepare("INSERT INTO session_meta VALUES (?,?)").run("owner", kind === "wrong-owner" ? "foreign-owner" : retained.metadata.owner);
      writer.prepare("INSERT INTO session_meta VALUES (?,?)").run("schema_version", kind === "wrong-version" ? String(retained.metadata.version - 1) : String(retained.metadata.version));
      writer.prepare("INSERT INTO sessions VALUES (?,?)").run("kept", "Opaque business row preserved only by SQLite backup");
    } finally { writer.close(); }
    const before = await snapshotBusinessFingerprint(f.home), files = await readdir(dirname(source));
    const statements: Array<{ sql: string; readonly: boolean }> = [];
    for (const method of ["prepare", "pragma", "exec"] as const) {
      const original = Database.prototype[method];
      t.mock.method(Database.prototype, method, function (this: Database.Database, ...args: unknown[]) {
        if (this.name === source) statements.push({ sql: `${method}:${String(args[0])}`, readonly: this.readonly });
        return Reflect.apply(original, this, args);
      });
    }
    const reader = new Database(source, { readonly: true, fileMustExist: true });
    try {
      if (kind === "correct") assert.deepEqual(readSqliteSnapshotMetadata(reader, retained.metadata), { owner: retained.metadata.owner, schema_version: retained.metadata.version });
      else assert.throws(() => readSqliteSnapshotMetadata(reader, retained.metadata), { code: "actions.input_invalid", kind: "invalid" });
    } finally { reader.close(); }
    if (kind === "correct") assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
    else await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), { code: "host.home_snapshot.invalid", kind: "invalid" });
    t.mock.restoreAll();
    const metadataQuery = `prepare:SELECT key, value FROM "${retained.metadata.table}" WHERE key IN ('owner', 'schema_version')`;
    assert.ok(statements.some(entry => entry.sql === metadataQuery), "the real metadata reader executed");
    const allowed = [
      /^pragma:(?:user_version|integrity_check)$/u,
      /^prepare:PRAGMA foreign_key_check$/u,
      /^prepare:SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name$/u,
      /^prepare:SELECT sql FROM sqlite_master WHERE type = 'index' AND name = \?$/u,
      /^prepare:PRAGMA (?:table_info|foreign_key_list|index_list|index_info)\("[^"]+"\)$/u,
    ];
    for (const entry of statements) {
      assert.equal(entry.readonly, true, entry.sql);
      assert.ok(entry.sql === metadataQuery || allowed.some(pattern => pattern.test(entry.sql)), `source statement must only read metadata/integrity: ${entry.sql}`);
    }
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    assert.deepEqual(await readdir(dirname(source)), files, "no source sidecars or alternate files were created");
    assert.deepEqual((await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-")), []);
    if (kind === "correct") {
      const manifest = JSON.parse(await readFile(join(f.snapshot, "manifest.json"), "utf8")) as { stores: Array<{ path: string; entries: Array<{ payload_path?: string }> }> };
      const payload = manifest.stores.find(item => item.path === store.path)!.entries.find(item => item.payload_path?.endsWith(retained.file))!.payload_path!;
      const copied = new DatabaseSync(join(f.snapshot, payload), { readOnly: true });
      try { assert.equal(copied.prepare("SELECT title FROM sessions WHERE id='kept'").get()?.title, "Opaque business row preserved only by SQLite backup"); }
      finally { copied.close(); }
    } else assert.equal((await readdir(f.area)).includes("snapshot"), false);
  });
});
