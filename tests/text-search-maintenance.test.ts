import assert from "node:assert/strict";
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { clearProjectInExistingTextSearchIndex, homeSqlitePath, openTextSearchIndex } from "@molis-ai/molis-work-storage";

function fixture(t: test.TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "search-maintenance-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "target"), path = homeSqlitePath(home, "search");
  const index = openTextSearchIndex({ homeDirectory: home });
  for (const [project, count] of [["target-project", 2], ["other-project", 1], [null, 1]] as const) {
    const key = project ?? "home";
    index.saveSource({ source_key: key, project_id: project, provider_id: "notes", capability_id: "notes.search", version: 1,
      plugin_id: "notes", title: key, collection_revision: "revision-5", state: "ready", error: null, synced_at: 101, checked_at: 102 });
    index.upsert(Array.from({ length: count }, (_, at) => ({ source_key: key, project_id: project, kind: "note", object_id: String(at),
      revision: "3", title: `共享 搜索 ${key}`, summary: "摘要", content: "完整正文 independent", updated_at: "2026-10-25", open: { surface: "notes", id: String(at) }, content_policy: "context" })));
  }
  index.close();
  return { root, home, path, input: { homeDirectory: home, projectId: "target-project", assertCurrent: () => {} } };
}
function rows(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return {
    documents: db.prepare("SELECT * FROM search_documents ORDER BY doc_id").all(),
    sources: db.prepare("SELECT * FROM search_sources ORDER BY source_key").all(),
    fts: db.prepare("SELECT rowid FROM search_fts ORDER BY rowid").all(),
    hits: db.prepare("SELECT rowid FROM search_fts WHERE search_fts MATCH 'independent' ORDER BY rowid").all(),
  }; } finally { db.close(); }
}
function mutate(path: string, sql: string) {
  const db = new DatabaseSync(path); try { db.exec(sql); } finally { db.close(); }
}

test("existing-only cleanup preserves every other project field and FTS result across close/reopen and same-target retries", t => {
  const f = fixture(t), before = rows(f.path);
  cpSync(f.home, join(f.root, "source"), { recursive: true });
  cpSync(f.home, join(f.root, "backup"), { recursive: true });
  const source = homeSqlitePath(join(f.root, "source"), "search"), backup = homeSqlitePath(join(f.root, "backup"), "search");
  const originals = [readFileSync(source), readFileSync(backup)];
  assert.deepEqual(clearProjectInExistingTextSearchIndex(f.input), { state: "cleared", removed: 2 });
  const retained = before.documents.filter(row => row.project_id !== "target-project");
  const ids = retained.map(row => row.doc_id);
  assert.deepEqual(rows(f.path), { documents: retained, sources: before.sources.filter(row => row.project_id !== "target-project"),
    fts: before.fts.filter(row => ids.includes(row.rowid)), hits: before.hits.filter(row => ids.includes(row.rowid)) });
  assert.deepEqual(clearProjectInExistingTextSearchIndex(f.input), { state: "cleared", removed: 0 });
  const reopened = openTextSearchIndex({ homeDirectory: f.home });
  assert.equal(reopened.documents("target-project").length, 0);
  assert.equal(reopened.documents("other-project")[0]?.content, "完整正文 independent");
  assert.equal(reopened.source("target-project"), null);
  assert.equal(reopened.related("other-project", "independent", 10).length, 1);
  reopened.close();
  assert.deepEqual([readFileSync(source), readFileSync(backup)], originals);
});

test("actual target absence creates no Home, directory or database and is not a cleared receipt", t => {
  const f = fixture(t);
  for (const home of [join(f.root, "absent"), join(f.root, "empty"), join(f.root, "empty-search")]) {
    if (home.endsWith("empty")) mkdirSync(home);
    if (home.endsWith("empty-search")) mkdirSync(join(home, "search"), { recursive: true });
    const existed = existsSync(home), children = existed ? readdirSync(home) : [];
    assert.deepEqual(clearProjectInExistingTextSearchIndex({ ...f.input, homeDirectory: home }), { state: "absent" });
    assert.equal(existsSync(home), existed);
    if (existed) assert.deepEqual(readdirSync(home), children);
    assert.equal(existsSync(homeSqlitePath(home, "search")), false);
  }
  // A source with no cache says nothing about this nonempty target.
  assert.deepEqual(clearProjectInExistingTextSearchIndex(f.input), { state: "cleared", removed: 2 });
});

test("old, incomplete, collateral-writing and altered FTS schemas are refused without rebuilding", async t => {
  for (const [name, sql] of [
    ["old identity version", "UPDATE search_meta SET value = '3' WHERE key = 'schema'"],
    ["missing table", "DROP TABLE search_sources"],
    ["trigger", "CREATE TRIGGER collateral AFTER DELETE ON search_documents BEGIN DELETE FROM search_sources; END"],
    ["collation", "ALTER TABLE search_documents ADD COLUMN unexpected TEXT COLLATE NOCASE"],
    ["FTS options", "DROP TABLE search_fts; CREATE VIRTUAL TABLE search_fts USING fts5(title, body)"],
    ["unknown table", "CREATE TABLE unrecognized (value TEXT)"],
  ]) await t.test(name!, child => {
    const f = fixture(child); mutate(f.path, sql!); const before = readFileSync(f.path);
    assert.throws(() => clearProjectInExistingTextSearchIndex(f.input), { code: "search.maintenance_schema" });
    assert.deepEqual(readFileSync(f.path), before);
  });
  await t.test("corrupt bytes", child => {
    const f = fixture(child); writeFileSync(f.path, "not a database"); const before = readFileSync(f.path);
    assert.throws(() => clearProjectInExistingTextSearchIndex(f.input));
    assert.deepEqual(readFileSync(f.path), before);
  });
});

test("old search identity cache is rebuilt by its ordinary owner without carrying old bindings", t => {
  const f = fixture(t);
  const stale = new DatabaseSync(f.path);
  stale.prepare("UPDATE search_documents SET retention_json = ?").run(JSON.stringify({ generation: "old-install" }));
  stale.exec("UPDATE search_meta SET value = '3' WHERE key = 'schema'"); stale.close();
  const before = readFileSync(f.path);
  assert.throws(() => clearProjectInExistingTextSearchIndex(f.input), { code: "search.maintenance_schema" });
  assert.deepEqual(readFileSync(f.path), before, "existing-only never adopts or rebuilds the stale cache");
  const current = openTextSearchIndex({ homeDirectory: f.home });
  try {
    assert.deepEqual(current.sources(), []);
    assert.deepEqual(current.documents("target-project"), []);
    assert.deepEqual(current.documents("other-project"), []);
  } finally { current.close(); }
  const reopened = new DatabaseSync(f.path, { readOnly: true });
  try { assert.equal(reopened.prepare("SELECT value FROM search_meta WHERE key = 'schema'").get()!.value, "4"); }
  finally { reopened.close(); }
});

test("unsafe paths and linked SQLite files are rejected before opening or changing them", async t => {
  for (const kind of ["home-link", "directory-link", "db-link", "hardlink", "wal-link", "shm-hardlink", "relative", "orphan-wal"]) await t.test(kind, child => {
    const f = fixture(child), before = readFileSync(f.path); let home = f.home;
    if (kind === "home-link") { home = join(f.root, "redirect"); symlinkSync(f.home, home); }
    if (kind === "directory-link") { renameSync(join(f.home, "search"), join(f.root, "real-search")); symlinkSync(join(f.root, "real-search"), join(f.home, "search")); }
    if (kind === "db-link") { renameSync(f.path, join(f.root, "real.db")); symlinkSync(join(f.root, "real.db"), f.path); }
    if (kind === "hardlink") linkSync(f.path, join(f.root, "linked.db"));
    if (kind === "wal-link") symlinkSync(f.path, f.path + "-wal");
    if (kind === "shm-hardlink") linkSync(f.path, f.path + "-shm");
    if (kind === "relative") home = ".";
    if (kind === "orphan-wal") { home = join(f.root, "orphan"); mkdirSync(join(home, "search"), { recursive: true }); writeFileSync(homeSqlitePath(home, "search") + "-wal", "orphan"); }
    assert.throws(() => clearProjectInExistingTextSearchIndex({ ...f.input, homeDirectory: home }), { code: "search.maintenance_path" });
    assert.deepEqual(readFileSync(f.path), before);
  });
});

test("current owner/permission and cancellation are checked before open, before delete and before COMMIT", async t => {
  for (const failAt of [1, 2, 3, 4]) for (const kind of ["revoke", "cancel"]) await t.test(`${kind} at check ${failAt}`, child => {
    const f = fixture(child), before = rows(f.path), bytes = readFileSync(f.path), controller = new AbortController(); let checks = 0;
    assert.throws(() => clearProjectInExistingTextSearchIndex({ ...f.input, signal: controller.signal, assertCurrent: () => {
      if (++checks !== failAt) return;
      if (kind === "cancel") controller.abort(); else throw Object.assign(new Error("maintenance owner revoked"), { code: "actions.forbidden" });
    } }), { code: kind === "cancel" ? "search.maintenance_cancelled" : "actions.forbidden" });
    assert.deepEqual(rows(f.path), before); assert.deepEqual(readFileSync(f.path), bytes);
  });
});

test("async current checks cannot authorize a transaction and request mutation cannot retarget it", t => {
  const f = fixture(t), before = rows(f.path);
  assert.throws(() => clearProjectInExistingTextSearchIndex({ ...f.input, assertCurrent: async () => {} }), { code: "search.maintenance_conflict" });
  assert.deepEqual(rows(f.path), before);
  const input = { ...f.input, assertCurrent: () => { input.projectId = "other-project"; } };
  assert.deepEqual(clearProjectInExistingTextSearchIndex(input), { state: "cleared", removed: 2 });
  assert.deepEqual(rows(f.path).documents, before.documents.filter(row => row.project_id !== "target-project"));
});

test("a valid uncheckpointed target WAL is read and the original project cleanup still uses the shared owner", t => {
  const f = fixture(t), live = openTextSearchIndex({ homeDirectory: f.home });
  try {
    const db = new DatabaseSync(f.path);
    try { db.exec("PRAGMA wal_autocheckpoint=0; UPDATE search_documents SET revision='wal-only' WHERE project_id='other-project'"); }
    finally { db.close(); }
    assert.ok(existsSync(f.path + "-wal"));
    assert.deepEqual(clearProjectInExistingTextSearchIndex(f.input), { state: "cleared", removed: 2 });
    assert.equal(live.documents("other-project")[0]?.revision, "wal-only");
    assert.equal(live.removeProject("other-project"), 1);
    assert.equal(live.related("other-project", "independent", 10).length, 0);
    assert.equal(live.sources().length, 1);
  } finally { live.close(); }
  assert.equal(rows(f.path).documents.length, 1);
});
