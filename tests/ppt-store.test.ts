import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { DatabaseSync } from "node:sqlite";
import { ownPptStores, PPT_DATABASE, pptManifest } from "@molis-ai/molis-work-plugin-ppt";
import { openPptStore, partitionLibraryFile } from "./fixtures/plugin-home-stores.js";

// W5-01-PPT-STORE-01: the unique declaration is the library in each partition (U2), and the narrow SQL port reads and writes through one store.
test("W5-01-PPT-STORE-01: one PPT declaration and one SQL port under the partition's library", async t => {
  assert.equal(pptManifest.databases?.partition, PPT_DATABASE);
  assert.equal(pptManifest.databases?.home, undefined);
  const home = await mkdtemp(join(tmpdir(), "ppt-store-"));
  const store = openPptStore(home, "a");
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownPptStores(run => run(store));
  const caller: ActionExecutionContext = { actor_id: "test", project_id: "a", audience: "user", permissions: [], beforeEffect: async () => {} };
  const deck = await stores.write(caller, current => current.create({ title: "Store port" }));
  assert.equal(stores.read(current => current.get(deck.id)).title, "Store port");
  assert.deepEqual(stores.read(current => current.list()).map(item => item.id), [deck.id]);
});

// W5-01-PPT-STORE-02: the production seam rolls back the deck and the receipt together when a copy or receive fails halfway.
test("W5-01-PPT-STORE-02: a failed copy or receive leaves no half deck or receipt", async t => {
  const home = await mkdtemp(join(tmpdir(), "ppt-store-rollback-"));
  const store = openPptStore(home, "a"), target = openPptStore(home, "b");
  const db = new DatabaseSync(partitionLibraryFile(home, "a", "ppt")), targetDb = new DatabaseSync(partitionLibraryFile(home, "b", "ppt"));
  t.after(async () => { db.close(); targetDb.close(); store.close(); target.close(); await rm(home, { recursive: true, force: true }); });
  const source = store.create({ title: "Source" });
  // A copy into another partition is put there from the source's export: a put whose receipt fails leaves the target as it was.
  targetDb.exec("CREATE TRIGGER fail_copy BEFORE INSERT ON presentation_copies WHEN NEW.request_id = 'copy:copy-fail' BEGIN SELECT RAISE(ABORT, 'fixture copy failure'); END");
  assert.throws(() => target.putRecord(store.exportRecord(source.id).record, "copy-fail"), /fixture copy failure/u);
  assert.deepEqual(target.list(), []);
  assert.equal(Number((targetDb.prepare("SELECT COUNT(*) AS n FROM presentation_copies").get() as { n: number }).n), 0);
  db.exec("CREATE TRIGGER fail_receive BEFORE INSERT ON presentation_copies WHEN NEW.request_id LIKE 'receive:%' BEGIN SELECT RAISE(ABORT, 'fixture receive failure'); END");
  assert.throws(() => store.receive("r1", "From workflow", [{ title: "Slide", bullets: ["point"], notes: "" }]), /fixture receive failure/u);
  assert.deepEqual(store.list().map(item => item.id), [source.id]);
  const receipts = db.prepare("SELECT COUNT(*) AS n FROM presentation_copies").get() as { n: number };
  assert.equal(Number(receipts.n), 0);
});

// W5-01-PPT-STORE-03: the authority wait comes before the callback, so a refusal never enters the write.
test("W5-01-PPT-STORE-03: a refused beforeEffect does not enter the write", async t => {
  const home = await mkdtemp(join(tmpdir(), "ppt-store-refused-"));
  const store = openPptStore(home, "a");
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownPptStores(run => run(store));
  let entered = false;
  const caller: ActionExecutionContext = { actor_id: "test", project_id: "a", audience: "user", permissions: [],
    beforeEffect: async () => { throw new Error("refused"); } };
  await assert.rejects(stores.write(caller, () => { entered = true; return 0; }), /refused/u);
  assert.equal(entered, false);
  assert.deepEqual(store.list(), []);
});
