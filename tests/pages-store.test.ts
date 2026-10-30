import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesBody } from "@molis-ai/molis-work-plugin-pages/contract";
import { ownPagesStores, PAGES_DATABASE, PAGES_HOME_STORE, type PreparedPagesImport } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { servePages } from "./fixtures/pages-runtime.js";

const body = (text: string): PagesBody => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const caller = (beforeEffect: () => Promise<void> = async () => {}): ActionExecutionContext =>
  ({ actor_id: "test", project_id: "a", audience: "user", permissions: [], beforeEffect });

// W5-01-PAGES-STORE-01 (and the library half of W5-01-PAGES-09): the one declaration is the Home baseline, and the narrow SQL port reads and writes through one store.
test("W5-01-PAGES-STORE-01 one Pages declaration and one SQL port under the original library", async t => {
  assert.equal(PAGES_HOME_STORE.library?.baseline.version, PAGES_DATABASE.version);
  assert.equal(PAGES_HOME_STORE.library?.baseline.schema, PAGES_DATABASE.schema);
  const home = await mkdtemp(join(tmpdir(), "pages-store-"));
  const store = openPagesStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownPagesStores(run => run(store));
  const page = await stores.write(caller(), current => current.create({ project_id: "a", title: "Store port" }));
  assert.equal(stores.read(current => current.get(page.id, "a")).title, "Store port");
  assert.deepEqual(stores.read(current => current.list("a")).map(item => item.id), [page.id]);
});

// W5-01-PAGES-STORE-02: one import is one unit; a receipt that cannot be written takes the documents with it.
test("W5-01-PAGES-STORE-02 an import or a copy that fails halfway leaves no document and no receipt", async t => {
  const home = await mkdtemp(join(tmpdir(), "pages-store-rollback-"));
  const store = openPagesStore(home), db = openHomeSqliteDatabase(home, "pages");
  t.after(async () => { db.close(); store.close(); await rm(home, { recursive: true, force: true }); });
  const source = store.create({ project_id: "a", title: "Source" });
  db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON page_imports WHEN NEW.request_id = 'import-fail' BEGIN SELECT RAISE(ABORT, 'fixture receipt failure'); END");
  assert.throws(() => store.importDocuments({ project_id: "a", request_id: "import-fail", request_hash: "h", documents: [{ title: "A", body: body("甲") }, { title: "B", body: body("乙") }] }),
    /fixture receipt failure/u);
  assert.deepEqual(store.list("a").map(item => item.id), [source.id], "neither imported document stayed");
  db.exec("DROP TRIGGER fail_receipt");
  db.exec("CREATE TRIGGER fail_copy BEFORE INSERT ON page_imports WHEN NEW.request_id LIKE 'copy:%' BEGIN SELECT RAISE(ABORT, 'fixture copy failure'); END");
  assert.throws(() => store.duplicate(source.id, "a", "b", "copy-fail"), /fixture copy failure/u);
  assert.deepEqual(store.list("b"), []);
  const receipts = db.prepare("SELECT COUNT(*) AS n FROM page_imports").get() as { n: number };
  assert.equal(Number(receipts.n), 0);
});

// W5-01-PAGES-STORE-03: the authority wait comes before the callback, so a refusal never enters the write.
test("W5-01-PAGES-STORE-03 a refused beforeEffect does not enter the write", async t => {
  const home = await mkdtemp(join(tmpdir(), "pages-store-refused-"));
  const store = openPagesStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownPagesStores(run => run(store));
  let entered = false;
  await assert.rejects(stores.write(caller(async () => { throw new Error("refused"); }), () => { entered = true; return 0; }), /refused/u);
  assert.equal(entered, false);
  assert.deepEqual(store.list("a"), []);
});

// W5-01-PAGES-STORE-04: the Runtime's own `database.transaction` is the same unit: the documents and their receipt commit together or not at all.
test("W5-01-PAGES-STORE-04 on the Runtime a failing import receipt rolls the imported documents back, and the same import works once the failure is gone", async t => {
  const pages = await servePages(t);
  const db = openHomeSqliteDatabase(pages.home, "pages");
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
