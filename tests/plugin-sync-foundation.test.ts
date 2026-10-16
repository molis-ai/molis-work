import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parsePluginManifest, parsePluginSyncDeclaration, expandPluginSyncSelection, PluginSyncError } from "../packages/plugin-sdk/src/index.js";
import { parseSpaceSyncPolicy } from "@molis-ai/molis-work-contracts/modules/sync-replication";
import { ensureStorageSpace, personalStorageSpace, homeSqlitePath } from "@molis-ai/molis-work-storage";
import { openPagesStore, pagesManifest } from "@molis-ai/molis-work-plugin-pages";

const hasCode = (code: string) => (error: unknown) => error instanceof PluginSyncError && error.code === code;
const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), "plugin-sync-"));
  const space = personalStorageSpace("https://auth.example", "work", "alice");
  const aHome = join(root, "a"), bHome = join(root, "b");
  ensureStorageSpace(aHome, space); ensureStorageSpace(bHome, space);
  const a = openPagesStore(aHome), b = openPagesStore(bHome);
  const context = { spaceId: space.spaceId, projectId: "project", authorize: () => {}, hasReference: () => true };
  t.after(() => { a.close(); b.close(); rmSync(root, { recursive: true, force: true }); });
  return { a, b, aHome, bHome, root, space, context, source: a.syncAdapter(context), target: b.syncAdapter(context) };
}

test("sync declarations are optional, validated, immutable and dependency-aware", () => {
  const { sync: _, ...legacy } = pagesManifest;
  assert.equal(parsePluginManifest(legacy).sync, undefined);
  assert.equal(parsePluginManifest(pagesManifest).sync?.collections[0]?.id, "documents");
  const declaration = { protocol_version: 1 as const, collections: [
    { id: "documents", title: "文档", schema_version: 1, requires: ["attachments"] },
    { id: "attachments", title: "附件", schema_version: 1, requires: [] },
    { id: "history", title: "历史", schema_version: 1, requires: [] },
  ] };
  assert.deepEqual(expandPluginSyncSelection(declaration, ["documents"]), ["attachments", "documents"]);
  assert.deepEqual(expandPluginSyncSelection(declaration, []), []);
  assert.throws(() => expandPluginSyncSelection(declaration, ["unknown"]), hasCode("sync.invalid"));
  assert.ok(Object.isFrozen(parsePluginSyncDeclaration(declaration).collections));
  for (const sync of [null, {}, { ...declaration, collections: [] }, { ...declaration, typo: true },
    { ...declaration, collections: [declaration.collections[0]] },
    { ...declaration, collections: [declaration.collections[1], declaration.collections[1]] },
    { ...declaration, collections: [{ ...declaration.collections[0], requires: ["documents"] }] },
    { ...declaration, collections: [{ ...declaration.collections[1], schema_version: 0 }] }]) {
    assert.throws(() => parsePluginManifest({ ...legacy, sync }), /同步/);
  }
});

test("policy wire format belongs to a space and retains exact unavailable selections for repair", () => {
  const selection = { plugin_id: "io.molis.work.future", publisher_id: "author", publisher_signature: "sig",
    collection_id: "drafts", schema_version: 7 };
  const policy = { spaceId: "space_a", revision: 2, selections: [selection] };
  assert.deepEqual(parseSpaceSyncPolicy(policy, "space_a"), policy);
  assert.throws(() => parseSpaceSyncPolicy(policy, "space_b"), hasCode("sync.scope"));
  assert.throws(() => parseSpaceSyncPolicy({ ...policy, userId: "alice" }, "space_a"), hasCode("sync.invalid"));
  assert.throws(() => parseSpaceSyncPolicy({ ...policy, selections: [selection, { ...selection, schema_version: 8 }] }, "space_a"), hasCode("sync.invalid"));
  assert.throws(() => parseSpaceSyncPolicy({ ...policy, revision: -1 }, "space_a"), hasCode("sync.invalid"));
});

test("Pages snapshots round-trip drafts, folders, embedded images, metadata and stable identities", t => {
  const f = fixture(t);
  const folder = f.a.createFolder({ project_id: "project", title: "设计" });
  const page = f.a.create({ project_id: "project", folder_id: folder.id, title: "草稿", starred: true,
    body: { type: "doc", content: [...body("未发布正文").content, { type: "image", attrs: { src: "data:image/png;base64,AAAA" } }] } });
  f.a.update(page.id, { title: "新草稿" });
  const snapshot = f.source.read("documents");
  assert.equal(f.target.apply(snapshot, f.target.read("documents").source_revision).status, "applied");
  assert.deepEqual(f.target.read("documents").payload, snapshot.payload);
  const localVersion = f.b.get(page.id).version;
  assert.ok(localVersion >= 1);
  const revision = f.target.read("documents").source_revision;
  assert.equal(f.target.apply(snapshot, "0").status, "unchanged");
  assert.equal(f.target.read("documents").source_revision, revision);
  assert.equal(f.b.get(page.id).version, localVersion);
  assert.deepEqual(f.b.getFolder(folder.id), folder);
});

test("remote changes advance local editor versions and stale writes cannot overwrite them", t => {
  const f = fixture(t);
  const page = f.a.create({ project_id: "project", title: "v1", body: body("original") });
  f.target.apply(f.source.read("documents"), "0");
  const stale = f.b.get(page.id);
  const expected = f.target.read("documents").source_revision;
  f.a.update(page.id, { title: "remote v2" });
  f.target.apply(f.source.read("documents"), expected);
  assert.ok(f.b.get(page.id).version > stale.version);
  assert.throws(() => f.b.update(page.id, { title: "stale", expected_version: stale.version }), /其他窗口/);
  f.b.update(page.id, { title: "local edit" });
  f.a.update(page.id, { title: "remote v3" });
  assert.throws(() => f.target.apply(f.source.read("documents"), expected), hasCode("sync.conflict"));
  assert.equal(f.b.get(page.id).title, "local edit");
});

test("deletion and reopening retain CAS history; old snapshots cannot resurrect deleted records", t => {
  const f = fixture(t);
  const page = f.a.create({ project_id: "project", body: body("keep") });
  const old = f.source.read("documents");
  f.target.apply(old, "0");
  const beforeDelete = f.target.read("documents").source_revision;
  f.a.delete(page.id);
  f.target.apply(f.source.read("documents"), beforeDelete);
  assert.equal(f.b.list("project").length, 0);
  assert.throws(() => f.target.apply(old, "0"), hasCode("sync.conflict"));
  assert.throws(() => f.target.apply(old, beforeDelete), hasCode("sync.conflict"));
  // Explicit restoration with a fresh local precondition must still invalidate pre-delete editors.
  f.target.apply(old, f.target.read("documents").source_revision);
  assert.ok(f.b.get(page.id).version > 1);
  assert.throws(() => f.b.update(page.id, { title: "stale pre-delete editor", expected_version: 1 }), /其他窗口/);
  const reopened = openPagesStore(f.bHome);
  try { assert.equal(reopened.syncAdapter(f.context).read("documents").source_revision, f.target.read("documents").source_revision); }
  finally { reopened.close(); }
});

test("scope, publisher, unsupported schema and globally colliding IDs are rejected without writes", t => {
  const f = fixture(t);
  const page = f.a.create({ project_id: "project", title: "a" });
  const snapshot = f.source.read("documents");
  for (const patch of [{ spaceId: "other" }, { projectId: "other" }, { publisher_signature: "other" }]) {
    assert.throws(() => f.target.apply({ ...snapshot, ...patch }, "0"), hasCode("sync.scope"));
  }
  assert.throws(() => f.target.apply({ ...snapshot, schema_version: 2 }, "0"), hasCode("sync.unsupported"));
  const otherProject = f.b.syncAdapter({ ...f.context, projectId: "other" });
  otherProject.apply({ ...snapshot, projectId: "other" }, "0");
  assert.throws(() => f.target.apply(snapshot, "0"), hasCode("sync.scope"));
  assert.equal(f.b.list("project").length, 0);
  assert.equal(f.b.get(page.id, "other").title, "a");
  const local = openPagesStore(join(f.root, "local"));
  try { assert.throws(() => local.syncAdapter(f.context), hasCode("sync.scope")); }
  finally { local.close(); }
});

test("references, incomplete publication and nonportable links block instead of losing data", t => {
  const f = fixture(t);
  const page = f.a.create({ project_id: "project", goal_id: "goal-1", body: body("linked") });
  const waiting = f.b.syncAdapter({ ...f.context, hasReference: () => false });
  assert.throws(() => waiting.apply(f.source.read("documents"), "0"), hasCode("sync.dependencies"));
  assert.equal(f.b.list("project").length, 0);
  f.a.beginPublication(page.id, "project", "actor");
  assert.throws(() => f.source.read("documents"), hasCode("sync.busy"));
  f.a.delete(page.id);
  f.a.create({ project_id: "project", body: { type: "doc", content: [{ type: "image", attrs: { src: "blob:local-image" } }] } });
  assert.throws(() => f.source.read("documents"), hasCode("sync.dependencies"));
});

test("malformed snapshots are rejected before deleting or updating anything", t => {
  const f = fixture(t);
  f.a.create({ project_id: "project", title: "a" });
  const snapshot = f.source.read("documents");
  f.b.create({ project_id: "project", title: "local" });
  const before = f.target.read("documents");
  const payload = snapshot.payload as { folders: unknown[]; documents: Record<string, unknown>[] };
  for (const patch of [{ body: null }, { secret: "must not transfer" }, { starred: "true" }, { created_at: "invalid" }, { folder_id: "missing" }]) {
    assert.throws(() => f.target.apply({ ...snapshot, payload: { ...payload, documents: [{ ...payload.documents[0], ...patch }] } }, before.source_revision));
    assert.deepEqual(f.target.read("documents"), before);
  }
});

test("revocation during apply rolls back both business writes and revision increments", t => {
  const f = fixture(t);
  f.a.create({ project_id: "project", title: "remote" });
  let checks = 0;
  const guarded = f.b.syncAdapter({ ...f.context, authorize: () => { if (++checks === 3) throw new Error("revoked"); } });
  assert.throws(() => guarded.apply(f.source.read("documents"), "0"), /revoked/);
  assert.equal(f.b.list("project").length, 0);
  assert.equal(f.target.read("documents").source_revision, "0");
});

test("all existing write paths participate in the same transactional revision counter", t => {
  const f = fixture(t);
  const folder = f.a.createFolder({ project_id: "project", title: "folder" });
  const page = f.a.create({ project_id: "project", folder_id: folder.id });
  const before = f.source.read("documents").source_revision;
  f.a.deleteFolder(folder.id);
  assert.ok(Number(f.source.read("documents").source_revision) > Number(before));
  assert.equal(f.a.get(page.id).folder_id, "");
  const db = new DatabaseSync(homeSqlitePath(f.aHome, "pages"));
  try {
    const revision = f.source.read("documents").source_revision;
    db.exec("BEGIN IMMEDIATE");
    db.prepare("UPDATE pages SET title = 'rolled back' WHERE id = ?").run(page.id);
    db.exec("ROLLBACK");
    assert.equal(f.source.read("documents").source_revision, revision);
  } finally { db.close(); }
});

test("legacy Stores seed revision high-water marks without rewriting existing content", t => {
  const f = fixture(t);
  const page = f.a.create({ project_id: "project", title: "legacy" });
  const db = new DatabaseSync(homeSqlitePath(f.aHome, "pages"));
  try {
    db.prepare("UPDATE pages SET version = 100 WHERE id = ?").run(page.id);
    for (const table of ["pages", "folders"]) for (const event of ["insert", "update", "delete"]) db.exec(`DROP TRIGGER ${table}_sync_${event}`);
    db.exec("DROP TABLE pages_sync_revisions");
  } finally { db.close(); }
  const reopened = openPagesStore(f.aHome);
  try {
    const adapter = reopened.syncAdapter(f.context);
    const snapshot = adapter.read("documents");
    assert.equal(reopened.get(page.id).version, 100);
    assert.equal(snapshot.source_revision, "100");
    reopened.delete(page.id);
    adapter.apply(snapshot, adapter.read("documents").source_revision);
    assert.ok(reopened.get(page.id).version > 100);
    assert.throws(() => reopened.update(page.id, { title: "old editor", expected_version: 100 }), /其他窗口/);
  } finally { reopened.close(); }
});

test("snapshot pilot rejects oversized collections without truncating them", t => {
  const f = fixture(t);
  for (let index = 0; index < 1001; index++) f.a.createFolder({ project_id: "project", title: String(index) });
  assert.throws(() => f.source.read("documents"), hasCode("sync.limit"));
  assert.equal(f.a.listFolders("project").length, 1001);
});
