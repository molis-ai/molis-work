import { SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
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
    const draft = first.service.create();
    first.close();
    const reopened = openCharacters(home, "owner");
    try { assert.deepEqual(reopened.service.get(draft.character_id), draft); }
    finally { reopened.close(); }
    const db = new DatabaseSync(join(home, "characters", "characters.sqlite"));
    try { assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 1); }
    finally { db.close(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// RAC-2365: any other version is refused; no historical structure or maintenance is needed.
for (const version of [0, 2, 3]) test(`W1-18-CHARACTER-SCHEMA-01 an existing version ${version} store is refused without changing its bytes or mode`, () => {
  const home = mkdtempSync(join(tmpdir(), "character-refused-"));
  const directory = join(home, "characters"), filename = join(directory, "characters.sqlite");
  mkdirSync(directory);
  const db = new DatabaseSync(filename);
  db.exec(`CREATE TABLE retained (value TEXT NOT NULL); INSERT INTO retained VALUES ('kept'); PRAGMA user_version = ${version};`);
  db.close();
  const bytes = readFileSync(filename), mode = statSync(filename).mode;
  try {
    // The common store baseline refuses it (C-06 moved the Characters store onto it): the path and the version found are named.
    assert.throws(() => openCharacters(home, "owner"), error => error instanceof SqliteSchemaVersionError
      && error.code === "storage.schema_version_mismatch" && error.path === filename && error.found === version && error.message.includes(filename));
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
