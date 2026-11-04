import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { bindDatabaseSpace, inspectSnapshotSqlite, personalStorageSpace } from "@molis-ai/molis-work-storage";
import { homeStorageTree } from "./fixtures/home-storage-files.js";

test("a bound archive retains its space and exact journal program during read-only inspection", t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "molis-archive-scope-"))), file = join(directory,"archive.db");
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const space = personalStorageSpace("https://issuer.example", "work", "alice");
  const trigger = "CREATE TRIGGER record_insert AFTER INSERT ON saved BEGIN SELECT NEW.id; END";
  const baseline = { version: 3, schema: "CREATE TABLE saved (id TEXT PRIMARY KEY, body TEXT);" + trigger };
  const write = (change: (db: Database.Database) => void) => {
    const db = new Database(file);
    try { change(db); } finally { db.close(); }
  };
  write(db => { bindDatabaseSpace(db, space); db.exec(baseline.schema); db.pragma("user_version=3"); });
  const check = () => inspectSnapshotSqlite(file, {baseline, space, requireSpace:true});
  assert.equal(check().integrity_check,"ok");
  assert.throws(() => inspectSnapshotSqlite(file,{version:3,space,requireSpace:true}),{code:"actions.input_invalid"},"a version-only receipt cannot authorize executable SQL");
  assert.throws(() => inspectSnapshotSqlite(file,{baseline,requireSpace:true}),{code:"actions.input_invalid"},"an unowned Home cannot admit a bound store");
  for (const tamper of [
    "PRAGMA ignore_check_constraints=ON; INSERT INTO molis_storage_space SELECT 2,space_id,descriptor FROM molis_storage_space",
    "ALTER TABLE molis_storage_space ADD COLUMN hidden_value TEXT GENERATED ALWAYS AS (descriptor) VIRTUAL",
  ]) {
    const copy=join(directory,"malformed.db");
    copyFileSync(file,copy);
    const db=new Database(copy);
    try { db.exec(tamper); } finally { db.close(); }
    const before=homeStorageTree(directory);
    assert.throws(() => inspectSnapshotSqlite(copy,{baseline,space,requireSpace:true}),{code:"actions.input_invalid",message:/空间元数据结构/});
    assert.deepEqual(homeStorageTree(directory),before);
    rmSync(copy);
  }
  const original = homeStorageTree(directory);
  const foreign = personalStorageSpace("https://issuer.example","work","bob");
  assert.throws(() => inspectSnapshotSqlite(file,{baseline, space:foreign}), {code:"actions.input_invalid"});
  assert.deepEqual(homeStorageTree(directory),original);
  write(db => db.exec("DROP TRIGGER record_insert"));
  assert.throws(check, {code:"actions.input_invalid"});
  write(db => db.exec("CREATE TRIGGER record_insert AFTER INSERT ON saved BEGIN DELETE FROM saved; END"));
  assert.throws(check, {code:"actions.input_invalid"});
  write(db => db.exec("DROP TRIGGER record_insert;" + trigger + "; CREATE VIEW unrelated AS SELECT body FROM saved"));
  assert.throws(check, {code:"actions.input_invalid"});
  write(db => db.exec("DROP VIEW unrelated; DROP TABLE molis_storage_space"));
  assert.throws(check, {code:"actions.input_invalid"}, "removing the binding cannot downgrade an owned store");
  assert.equal(inspectSnapshotSqlite(file, {baseline}).integrity_check,"ok","independent stores can legitimately have no space table");
  write(db => db.exec("DROP TRIGGER record_insert"));
  assert.equal(inspectSnapshotSqlite(file,{version:3}).integrity_check,"ok","a version-only store remains inspectable when it has no executable objects");
});
