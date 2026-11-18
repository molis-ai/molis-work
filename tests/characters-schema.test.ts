import { isSqliteSchemaStructureMismatch, isSqliteVersionRefusal } from "@molis-ai/molis-work-storage";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { openCharacters } from "@molis-ai/molis-work-module-characters";

test("W1-18-CHARACTER-SCHEMA-01 an empty Character store initializes once and current drafts reopen", () => {
  const home = mkdtempSync(join(tmpdir(), "character-baseline-"));
  try {
    const first = openCharacters(home, "owner");
    const draft = first.service.create({ title: "核对者", instructions: "", host_tools: null });
    first.close();
    const reopened = openCharacters(home, "owner");
    try { assert.deepEqual(reopened.service.get(draft.character_id), draft); }
    finally { reopened.close(); }
    const db = new DatabaseSync(join(home, "characters", "characters.sqlite"));
    try { assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 2); }
    finally { db.close(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
});

for (const version of [0, 1, 2, 3, 5]) test(`W1-18-CHARACTER-SCHEMA-01 an existing version ${version} store is refused without changing its bytes or mode`, () => {
  const home = mkdtempSync(join(tmpdir(), "character-refused-"));
  const directory = join(home, "characters"), filename = join(directory, "characters.sqlite");
  mkdirSync(directory);
  const db = new DatabaseSync(filename);
  db.exec(`CREATE TABLE retained (value TEXT NOT NULL); INSERT INTO retained VALUES ('kept'); PRAGMA user_version = ${version};`);
  db.close();
  const bytes = readFileSync(filename), mode = statSync(filename).mode;
  try {
    // The common store baseline refuses it (C-06 moved the Characters store onto it): the path and the version found are named.
    // At the current version 2 the tables must be the baseline's; version 1 waits for the upgrade run (1 → 2 only adds the role
    // tables, run by the upgrade process, never on open); 0 is no version an upgrade starts from; 3 and 5 are newer than this build.
    assert.throws(() => openCharacters(home, "owner"), error => version === 2
      ? isSqliteSchemaStructureMismatch(error) && error.message.includes("characters.sqlite") && !error.message.includes(home)
      : isSqliteVersionRefusal(error) && error.code === (version === 0 ? "storage.schema_version_mismatch" : version === 1 ? "storage.upgrade_pending" : "storage.store_too_new")
        && error.details?.path === "characters.sqlite" && error.details?.found === version && error.details?.expected === 2
        && error.message.includes("characters.sqlite") && !error.message.includes(home));
    assert.deepEqual(readFileSync(filename), bytes);
    assert.equal(statSync(filename).mode, mode);
    const check = new DatabaseSync(filename);
    try {
      assert.equal(check.prepare("PRAGMA user_version").get()?.user_version, version);
      assert.equal(check.prepare("SELECT value FROM retained").get()?.value, "kept");
      assert.equal(check.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'character_drafts'").get(), undefined);
    } finally { check.close(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
});
