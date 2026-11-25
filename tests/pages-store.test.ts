import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesBody } from "@molis-ai/molis-work-plugin-pages/contract";
import { DatabaseSync } from "node:sqlite";
import { ownPagesStores, PAGES_DATABASE, pagesManifest, type PreparedPagesImport } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore, partitionLibraryFile } from "./fixtures/plugin-home-stores.js";
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
