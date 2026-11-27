import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, objectLink, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesBody } from "@molis-ai/molis-work-plugin-pages/contract";
import { DatabaseSync } from "node:sqlite";
import { createPagesSyncContent, ownPagesStores, PAGES_DATABASE, pagesManifest, type PreparedPagesImport } from "@molis-ai/molis-work-plugin-pages";
import { ensureStorageSpace, personalStorageSpace } from "@molis-ai/molis-work-storage";
import { openPagesStore, partitionLibraryFile } from "./fixtures/plugin-home-stores.js";
import { openPagesStore as openSyncPagesStore } from "./fixtures/plugin-sync-stores.js";
import { servePages } from "./fixtures/pages-runtime.js";

const body = (text: string): PagesBody => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const caller = (beforeEffect: () => Promise<void> = async () => {}): ActionExecutionContext =>
  ({ actor_id: "test", project_id: "a", audience: "user", permissions: [], beforeEffect });

// W5-01-PAGES-STORE-01 (and the library half of W5-01-PAGES-09): the one declaration is the library in each partition (U2), and the narrow SQL port
// reads and writes through one store.
test("W5-01-PAGES-STORE-01 one Pages declaration and one SQL port under the partition's library", async t => {
  assert.equal(pagesManifest.databases?.partition, PAGES_DATABASE);
  assert.equal(pagesManifest.databases?.home, undefined);
  const home = await mkdtemp(join(tmpdir(), "pages-store-"));
  const store = openPagesStore(home, "a");
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownPagesStores(run => run(store));
  const page = await stores.write(caller(), current => current.create({ title: "Store port" }));
  assert.equal(stores.read(current => current.get(page.id)).title, "Store port");
  assert.deepEqual(stores.read(current => current.list()).map(item => item.id), [page.id]);
});

// W5-01-PAGES-STORE-02: one import is one unit; a receipt that cannot be written takes the documents with it.
test("W5-01-PAGES-STORE-02 an import or a copy that fails halfway leaves no document and no receipt", async t => {
  const home = await mkdtemp(join(tmpdir(), "pages-store-rollback-"));
  const store = openPagesStore(home, "a"), target = openPagesStore(home, "b"), db = new DatabaseSync(partitionLibraryFile(home, "a", "pages"));
  const targetDb = new DatabaseSync(partitionLibraryFile(home, "b", "pages"));
  t.after(async () => { db.close(); targetDb.close(); store.close(); target.close(); await rm(home, { recursive: true, force: true }); });
  const source = store.create({ title: "Source" });
  db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON page_imports WHEN NEW.request_id = 'import-fail' BEGIN SELECT RAISE(ABORT, 'fixture receipt failure'); END");
  assert.throws(() => store.importDocuments({ request_id: "import-fail", request_hash: "h", documents: [{ title: "A", body: body("甲") }, { title: "B", body: body("乙") }] }),
    /fixture receipt failure/u);
  assert.deepEqual(store.list().map(item => item.id), [source.id], "neither imported document stayed");
  db.exec("DROP TRIGGER fail_receipt");
  // A copy into another partition is put there from the source's export: a put whose receipt fails leaves the target as it was.
  targetDb.exec("CREATE TRIGGER fail_copy BEFORE INSERT ON page_imports WHEN NEW.request_id LIKE 'copy:%' BEGIN SELECT RAISE(ABORT, 'fixture copy failure'); END");
  const carried = store.exportRecord(source.id);
  assert.throws(() => target.putRecord(carried.record, "copy-fail"), /fixture copy failure/u);
  assert.deepEqual(target.list(), []);
  assert.deepEqual(store.list().map(item => item.id), [source.id], "the source is untouched");
  const receipts = targetDb.prepare("SELECT COUNT(*) AS n FROM page_imports").get() as { n: number };
  assert.equal(Number(receipts.n), 0);
});

// W5-01-PAGES-STORE-03: the authority wait comes before the callback, so a refusal never enters the write.
test("W5-01-PAGES-STORE-03 a refused beforeEffect does not enter the write", async t => {
  const home = await mkdtemp(join(tmpdir(), "pages-store-refused-"));
  const store = openPagesStore(home, "a");
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownPagesStores(run => run(store));
  let entered = false;
  await assert.rejects(stores.write(caller(async () => { throw new Error("refused"); }), () => { entered = true; return 0; }), /refused/u);
  assert.equal(entered, false);
  assert.deepEqual(store.list(), []);
});

// W5-01-PAGES-STORE-04: the Runtime's own `database.transaction` is the same unit: the documents and their receipt commit together or not at all.
test("W5-01-PAGES-STORE-04 on the Runtime a failing import receipt rolls the imported documents back, and the same import works once the failure is gone", async t => {
  const pages = await servePages(t);
  // The partition's library is made the first time the plugin reads there (batch 107); the fixture's trigger goes into that one file.
  assert.deepEqual((await pages.http<{ documents: unknown[] }>("")).documents, []);
  const db = new DatabaseSync(partitionLibraryFile(pages.home, pages.project.project_id, "pages"));
  t.after(() => db.close());
  const files = [{ name: "甲.md", data: Buffer.from("# 甲\n\n正文甲").toString("base64") }, { name: "乙.md", data: Buffer.from("# 乙\n\n正文乙").toString("base64") }];
  const prepared = await pages.http<PreparedPagesImport>("/import/preview", { files });
  const request = { files, selected_keys: prepared.documents.map(document => document.key), request_id: randomUUID() };
  db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON page_imports BEGIN SELECT RAISE(ABORT, 'fixture receipt failure'); END");
  const refused = await pages.request("/import", request);
  assert.notEqual(refused.status, 200);
  assert.deepEqual((await pages.http<{ documents: unknown[] }>("")).documents, [], "no half-imported document is visible");
  db.exec("DROP TRIGGER fail_receipt");
  const imported = await pages.http<{ documents: Array<{ title: string }> }>("/import", request);
  assert.equal(imported.documents.length, 2);
  assert.equal((await pages.http<{ documents: unknown[] }>("")).documents.length, 2, "the retry of the same request id wrote each document once");
});

function openPagesSyncPair(t: { after(fn: () => void): void }, homeRoot: string) {
  const space = personalStorageSpace("https://auth.example", "work", "alice");
  const aHome = join(homeRoot, "a"), bHome = join(homeRoot, "b");
  ensureStorageSpace(aHome, space); ensureStorageSpace(bHome, space);
  const a = openSyncPagesStore(aHome, "project"), b = openSyncPagesStore(bHome, "project");
  const context = { spaceId: space.spaceId, authorize: () => {}, project: (id: string) => ({ title: id }), canUploadProject: () => true, hasArtifact: () => true, hasReference: () => true };
  t.after(() => { a.close(); b.close(); });
  return { a, b, source: a.replica(context), target: b.replica(context) };
}

test("F-pm3-12: Pages sync counts document titles and folder names by Unicode code points, matching store limits", async t => {
  const root = await mkdtemp(join(tmpdir(), "pages-sync-unicode-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const { a, b, source, target } = openPagesSyncPair(t, root);
  const folderTitle = "🟢".repeat(40);
  const pageTitle = "🟢".repeat(80);
  const folder = a.createFolder({ title: folderTitle });
  const page = a.create({ folder_id: folder.id, title: pageTitle, body: body("非 BMP 标题正文") });
  let revision = 1;
  let lastPageEvent: ReturnType<typeof source.next> = null;
  let pageRevision = 0;
  for (let event = source.next(); event; event = source.next()) {
    const received = { ...event, revision: revision++ };
    target.receive(received);
    assert.deepEqual(target.conflicts(), []);
    source.acknowledge(event.key, event.operationId, received.revision);
    if (event.key === JSON.stringify(["project", "document", page.id])) {
      lastPageEvent = event;
      pageRevision = received.revision;
    }
  }
  assert.equal(b.getFolder(folder.id).title, folderTitle);
  assert.equal(b.get(page.id).title, pageTitle);
  assert.ok(lastPageEvent);
  const envelope = lastPageEvent.value as { project: unknown; record: Record<string, unknown> };
  target.receive({ ...lastPageEvent, base: pageRevision, operationId: "too-long-title", revision: revision++,
    value: { ...envelope, record: { ...envelope.record, title: "🟢".repeat(81) } } });
  assert.equal(target.conflicts().length, 1);
  assert.equal(target.conflicts()[0]!.waiting, false);
  assert.equal(b.get(page.id).title, pageTitle);
});

test("F-pm3-13: Pages sync allows same-project portable object links and refuses cross-project or unsafe links", async t => {
  const root = await mkdtemp(join(tmpdir(), "pages-sync-links-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const { a, b, source, target } = openPagesSyncPair(t, root);
  const linkBody = (hrefs: readonly string[]): PagesBody => ({
    type: "doc",
    content: hrefs.map(href => ({
      type: "paragraph",
      content: [{ type: "text", text: "回链", marks: [{ type: "link", attrs: { href } }] }],
    })),
  });
  const allowedLinks = [
    objectLink("project", { surface: "pages", id: "doc-1", title: "中文 标题" }),
    objectLink("project", { surface: "inbox", id: "inbox-1" }),
    objectLink("project", { kind: "pages_document", id: "doc-2" }),
  ];
  const page = a.create({ title: "带回链的文稿", body: linkBody(allowedLinks) });
  const event = source.next();
  assert.ok(event);
  target.receive({ ...event, revision: 1 });
  assert.deepEqual(target.conflicts(), []);
  source.acknowledge(event.key, event.operationId, 1);
  assert.deepEqual(b.get(page.id).body, page.body);

  const rejectedLinks = [
    objectLink("other", { surface: "pages", id: "doc-1" }),
    "//evil.example/projects/project/?openPlugin=pages",
    "/\\evil.example",
    "/projects/project/../other/?openPlugin=pages",
    "./local.md",
    "/projects/project/?openPlugin=pages\nfoo",
  ];
  for (const href of rejectedLinks) {
    a.update(page.id, { body: linkBody([href]) });
    assert.throws(
      () => source.next(),
      (error: unknown) => error instanceof ActionError && /本机或相对链接/u.test(error.message),
    );
  }
  const envelope = event.value as { project: unknown; record: Record<string, unknown> };
  target.receive({
    ...event,
    base: 1,
    operationId: "foreign-project-link",
    revision: 2,
    value: { ...envelope, record: { ...envelope.record, body: linkBody([objectLink("other", { surface: "pages", id: "doc-1" })]) } },
  });
  assert.equal(target.conflicts().length, 1);
  assert.equal(target.conflicts()[0]!.waiting, true);
  assert.match(target.conflicts()[0]!.reason, /本机或相对链接/u);
  assert.deepEqual(b.get(page.id).body, page.body);
});

test("F-pm3-18: createPagesSyncContent projects only image.attrs.src, ignores data:image text in prose/code, and never mutates input", async () => {
  const codec = createPagesSyncContent({ spaceId: "alice", authorize() {} });
  const png = Buffer.alloc(64, 31);
  const validUri = "data:image/png;base64," + png.toString("base64");
  const malformedUri = "data:image/png;base64,abc";
  const value = {
    project: { id: "project", title: "Pages" },
    record: {
      body: {
        type: "doc",
        content: [
          { type: "code_block", content: [{ type: "text", text: malformedUri }] },
          { type: "paragraph", content: [{ type: "text", text: validUri }] },
          { type: "callout", content: [{ type: "image", attrs: { src: validUri, alt: malformedUri } }] },
        ],
      },
    },
  };
  const snapshot = structuredClone(value);
  const encoded = codec.encode("asset", value);
  assert.deepEqual(value, snapshot, "encode must not mutate caller input in place");
  const pngBlobs = encoded.blobs.filter(blob => Buffer.from(blob.bytes).equals(png));
  assert.equal(pngBlobs.length, 1, "only the real image node's src is projected to a blob");
  const restored = await codec.decode("asset", encoded.value, async ref => {
    const found = encoded.blobs.find(blob => blob.digest === ref.digest && blob.size === ref.size);
    assert.ok(found);
    return found.bytes;
  });
  assert.deepEqual(restored, snapshot);

  const badImage = {
    project: { id: "project", title: "Pages" },
    record: { body: { type: "doc", content: [{ type: "image", attrs: { src: malformedUri } }] } },
  };
  assert.throws(
    () => codec.encode("asset", badImage),
    (error: unknown) => error instanceof ActionError && error.code === "pages.sync_invalid",
  );
});
