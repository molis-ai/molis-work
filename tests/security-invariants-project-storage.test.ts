import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";

// S-102: a project's storage directory is <projects directory>/<project_id>; a project id is one plain directory name, so a catalog row
// (an edited or restored catalog) can never point a file operation (delete, rename, source-state scan) outside that directory.

const insertRow = (home: string, projectId: string) => {
  const db = new Database(join(home, "projects", "catalog.db"));
  try {
    db.prepare("INSERT INTO projects (project_id, display_name, source, data_class, created_at, updated_at) VALUES (?, 'x', 'created', 'user', 't', 't')").run(projectId);
  } finally { db.close(); }
};
const guarded = { code: "catalog.project_storage_invalid" };

test("S-102 a catalog row whose project id is not a plain directory name is refused before any file is touched: reading, deleting and removing a demo project", async t => {
  const root = mkdtempSync(join(tmpdir(), "security-project-storage-")), home = join(root, "home");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    // What a row with id "../victim" would delete: the directory next to the projects directory.
    const victim = join(home, "victim");
    mkdirSync(victim); writeFileSync(join(victim, "keep.txt"), "keep");
    const before = readdirSync(join(home, "projects")).sort();
    for (const id of ["..", "../victim", "a/b", "a\\b", "/etc"]) {
      insertRow(home, id);
      assert.throws(() => catalog.getProject(id), guarded, `getProject ${JSON.stringify(id)}`);
      assert.throws(() => catalog.listProjects(), guarded, `listProjects with ${JSON.stringify(id)} in the catalog`);
      await assert.rejects(catalog.deleteProject({ project_id: id, actor_id: "tester", delete_confirmed: true, idempotency_key: `delete-${id}` }), guarded, `deleteProject ${JSON.stringify(id)}`);
      await assert.rejects(catalog.removeDemoProject({ project_id: id, actor_id: "tester", delete_confirmed: true, idempotency_key: `demo-${id}` }), guarded, `removeDemoProject ${JSON.stringify(id)}`);
      const db = new Database(join(home, "projects", "catalog.db"));
      try { db.prepare("DELETE FROM projects WHERE project_id = ?").run(id); } finally { db.close(); }
    }
    assert.equal(readFileSync(join(victim, "keep.txt"), "utf8"), "keep", "the directory next to the projects directory is untouched");
    assert.deepEqual(readdirSync(join(home, "projects")).sort(), before, "nothing was staged, renamed or created beside the catalog");
    assert.equal(existsSync(join(home, "projects", "..", "victim")), true);
  } finally { catalog.close(); }
});
