import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { openCharacterRuns, openCharacters, purgeCharactersProject } from "@molis-ai/molis-work-module-characters";
import { projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";

// BL-385: a project's deletion clears the native Character runs recorded in it (`character_runs`), whoever launched them,
// and leaves other projects' runs and the person's drafts alone.
const start = (n: number) => ({ panel_id: `panel-${n}`, title: `Run ${n}`, reference: { artifact_id: "artifact-1", version: 1 }, workspace_path: "/work",
  character_id: "character-1", task: `task ${n}`, workspace_id: "workspace", runtime_id: "runtime", bundle_path: "/bundle" });

function home(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), "characters-project-deletion-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

/** Two people launch in the project that goes and one in the project that stays; the first person also has a draft. */
function seed(directory: string) {
  const launched = (actor: string, project: string, n: number) => {
    const opened = openCharacterRuns(directory, actor, project);
    try { opened.runs.start(start(n)); } finally { opened.close(); }
  };
  launched("person-a", "doomed", 1); launched("person-b", "doomed", 2); launched("person-a", "kept", 3);
  const drafts = openCharacters(directory, "person-a");
  try { drafts.service.create(); } finally { drafts.close(); }
}

const rows = (directory: string, sql: string) => {
  const db = new DatabaseSync(join(directory, "characters", "characters.sqlite"));
  try { return db.prepare(sql).all().map(row => ({ ...row })); } finally { db.close(); }
};

test("RAC-254 BL-385: purging a project clears its Character runs for every launcher, and keeps other projects' runs and the drafts", t => {
  const directory = home(t);
  seed(directory);
  const drafts = rows(directory, "SELECT * FROM character_drafts");
  assert.equal(drafts.length, 1);
  purgeCharactersProject(directory, "doomed");
  assert.deepEqual(rows(directory, "SELECT project_id, owner_actor_id, panel_id FROM character_runs"), [{ project_id: "kept", owner_actor_id: "person-a", panel_id: "panel-3" }]);
  assert.deepEqual(rows(directory, "SELECT * FROM character_drafts"), drafts, "the drafts name no project and stay");
  purgeCharactersProject(directory, "doomed");
  assert.equal(rows(directory, "SELECT * FROM character_runs").length, 1, "running it again finds nothing");
});

test("RAC-255 BL-385: the Host lists Characters among a project's data owners and clears it by the receipt's owner id", async t => {
  const directory = home(t);
  seed(directory);
  const hooks = projectDeletedHooksFor(directory);
  const owner = hooks.owners().find(item => item.id === "characters");
  assert.equal(owner?.label, "角色在这个项目里的执行记录");
  assert.equal(await hooks.clear("characters", "doomed"), true);
  assert.deepEqual(rows(directory, "SELECT panel_id FROM character_runs"), [{ panel_id: "panel-3" }]);
});

test("RAC-255 BL-385: a Home with no Characters library has nothing to clear and gets none; a store at another version is refused untouched", t => {
  const empty = home(t);
  purgeCharactersProject(empty, "doomed");
  assert.equal(existsSync(join(empty, "characters")), false, "the purge creates nothing");
  const old = home(t);
  seed(old);
  const file = join(old, "characters", "characters.sqlite"), db = new DatabaseSync(file);
  db.exec("PRAGMA user_version = 1"); db.close();
  const bytes = readFileSync(file);
  assert.throws(() => purgeCharactersProject(old, "doomed"), error => error instanceof SqliteSchemaVersionError && error.found === 1);
  assert.deepEqual(readFileSync(file), bytes, "the refusal writes nothing");
  writeFileSync(file, bytes);
});
