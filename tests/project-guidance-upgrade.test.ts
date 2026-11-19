import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LocalProjectDatabase, PROJECT_DATABASE_BASELINE } from "@molis-ai/molis-work-app-local-host";
import { createProjectGuidance } from "@molis-ai/molis-work-module-projects";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { LocalSqliteJournal, runSqliteUpgrade, type SqliteDatabase } from "@molis-ai/molis-work-storage";

// PEQ-10 (specs/plugin-equal-standing/contract-design.md §9, CONTRACT-CHANGES 「第 44 批存量搬迁」 A): the project library's 5→6 step hands
// Goals' guidance to the platform. The library is the 0.1.1-dev.7 golden's own, at 5, whose Goals added an entry and edited it once through
// `goals.guidance.add` / `.update`: after the step the platform reads both revisions, the journal's events and the receipts carry the
// platform's names, and a retry of either original request with its key replays the receipt Goals wrote rather than writing again.

const PROJECT = "project-42ffae10-577d-44d7-9f41-0f14cccd67b2";
const GOLDEN = new URL(`./fixtures/golden-homes/0.1.1-dev.7/stores/projects/${PROJECT}/molis-work.db.sql`, import.meta.url);
const GUIDANCE = "a57228be-c38a-4f4a-a505-13a68201c95e";
const GOALS = "io.molis.work.goals:";

/** The golden's library upgraded by the step itself, then opened as the Host opens a project library. */
function upgradedGolden(t: { after(fn: () => void): void }): SqliteDatabase {
  const directory = mkdtempSync(join(tmpdir(), "guidance-5-6-")), file = join(directory, "molis-work.db");
  const raw = new DatabaseSync(file);
  raw.exec(readFileSync(GOLDEN, "utf8"));
  assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 5, "the golden's library is at 5");
  assert.deepEqual(runSqliteUpgrade(raw, file, PROJECT_DATABASE_BASELINE), { from: 5, to: 6 });
  raw.close();
  const store = new LocalProjectDatabase(file);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return store.db;
}

const storeOf = (db: SqliteDatabase) => createProjectGuidance({ db, journal: new LocalSqliteJournal(db),
  now: () => new Date("2026-11-18T00:00:00.000Z"), requestHash: value => createHash("sha256").update(canonicalJsonText(value)!).digest("hex") });
const count = (db: SqliteDatabase, sql: string, ...params: string[]) => (db.prepare(sql).get(...params) as { n: number }).n;

test("PEQ-10 the 5→6 step moves the golden's guidance, its two revisions, its events and its receipts to the platform", t => {
  const db = upgradedGolden(t);
  const tables = (db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE '%guidance%' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name);
  assert.ok(tables.includes("guidance_entries") && tables.includes("guidance_revisions"), "the platform's tables are there");
  assert.equal(tables.includes("project_guidance_entries") || tables.includes("project_guidance_revisions"), false, "Goals' two tables are gone");

  const view = storeOf(db).read(PROJECT);
  assert.deepEqual(view.entries.map(entry => [entry.guidance_id, entry.revision, entry.kind, entry.content, entry.source_refs]),
    [[GUIDANCE, 2, "convention", "金样项目说明（改过） seed", ["golden:guidance"]]]);
  assert.deepEqual(view.revisions.map(revision => [revision.revision, revision.change_kind, revision.content]).sort(),
    [[1, "created", "金样项目说明 seed"], [2, "edited", "金样项目说明（改过） seed"]]);
  assert.match(view.runtime_prompt_prefix, /金样项目说明（改过） seed/, "a Run starts with the moved guidance");

  assert.equal(count(db, "SELECT count(*) AS n FROM events WHERE type LIKE ? OR object_type = ?", GOALS + "project.guidance%", GOALS + "project_guidance"), 0,
    "no guidance event keeps Goals' prefix");
  assert.deepEqual((db.prepare("SELECT type, object_type FROM events WHERE object_id = ? ORDER BY seq").all(GUIDANCE) as Array<{ type: string; object_type: string }>)
    .map(row => [row.type, row.object_type]), [["project.guidance_added", "project_guidance"], ["project.guidance_edited", "project_guidance"]]);
  assert.deepEqual((db.prepare("SELECT operation FROM idempotency_records WHERE idempotency_key LIKE 'golden-guidance-%' ORDER BY operation").all() as Array<{ operation: string }>)
    .map(row => row.operation), ["add_project_guidance", "update_project_guidance"]);
  assert.ok(count(db, "SELECT count(*) AS n FROM events WHERE type LIKE ?", GOALS + "%") > 0, "Goals' own events keep their names");
});

test("PEQ-10 a retry of Goals' original add and edit replays their receipts, and the moved entry takes a new revision", t => {
  const db = upgradedGolden(t), store = storeOf(db);
  const eventsBefore = count(db, "SELECT count(*) AS n FROM events");
  const added = store.add(PROJECT, "web-user", { kind: "convention", content: "金样项目说明 seed", source_refs: ["golden:guidance"], reason: "合成的理由",
    confirmation_summary: "用户确认了这条说明", user_confirmed: true, idempotency_key: "golden-guidance-seed" });
  assert.equal(added.replayed, true, "the add's receipt replays");
  assert.equal(added.entry.guidance_id, GUIDANCE);
  // The golden's edit sent no `source_refs` (the entry kept its own), and Goals hashed that absence as `null`: so does the platform.
  const edited = store.update(PROJECT, "web-user", { guidance_id: GUIDANCE, action: "edit", kind: "convention", content: "金样项目说明（改过） seed",
    reason: "合成的修改", confirmation_summary: "用户确认了修改", user_confirmed: true, idempotency_key: "golden-guidance-edit-seed" });
  assert.equal(edited.replayed, true, "the edit's receipt replays");
  assert.equal(count(db, "SELECT count(*) AS n FROM events"), eventsBefore, "replays write nothing");

  const next = store.update(PROJECT, "web-user", { guidance_id: GUIDANCE, action: "deactivate", reason: "升级后停用", confirmation_summary: "用户确认停用",
    user_confirmed: true, idempotency_key: "after-upgrade" });
  assert.deepEqual([next.replayed, next.entry.revision, next.entry.active], [false, 3, false], "the platform keeps writing the moved entry");
});
