import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ownPptStores, PPT_DATABASE, PPT_HOME_STORE } from "@molis-ai/molis-work-plugin-ppt";
import { openPptStore } from "./fixtures/plugin-home-stores.js";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";

// W5-01-PPT-STORE-01: the unique declaration is the Home baseline, and the narrow SQL port reads and writes through one store.
test("W5-01-PPT-STORE-01: one PPT declaration and one SQL port under the original library", async t => {
  assert.equal(PPT_HOME_STORE.library?.baseline.version, PPT_DATABASE.version);
  assert.equal(PPT_HOME_STORE.library?.baseline.schema, PPT_DATABASE.schema);
  const home = await mkdtemp(join(tmpdir(), "ppt-store-"));
  const store = openPptStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownPptStores(run => run(store));
  const caller: ActionExecutionContext = { actor_id: "test", project_id: "a", audience: "user", permissions: [], beforeEffect: async () => {} };
  const deck = await stores.write(caller, current => current.create({ project_id: "a", title: "Store port" }));
  assert.equal(stores.read(current => current.get(deck.id, "a")).title, "Store port");
  assert.deepEqual(stores.read(current => current.list("a")).map(item => item.id), [deck.id]);
});

// W5-01-PPT-STORE-02: the production seam rolls back the deck and the receipt together when a copy or receive fails halfway.
test("W5-01-PPT-STORE-02: a failed copy or receive leaves no half deck or receipt", async t => {
  const home = await mkdtemp(join(tmpdir(), "ppt-store-rollback-"));
  const store = openPptStore(home), db = openHomeSqliteDatabase(home, "ppt");
  t.after(async () => { db.close(); store.close(); await rm(home, { recursive: true, force: true }); });
  const source = store.create({ project_id: "a", title: "Source" });
  db.exec("CREATE TRIGGER fail_copy BEFORE INSERT ON presentation_copies WHEN NEW.request_id = 'copy-fail' BEGIN SELECT RAISE(ABORT, 'fixture copy failure'); END");
  assert.throws(() => store.duplicate(source.id, "a", "b", "copy-fail"), /fixture copy failure/u);
  assert.deepEqual(store.list("b"), []);
  db.exec("DROP TRIGGER fail_copy");
  db.exec("CREATE TRIGGER fail_receive BEFORE INSERT ON presentation_copies WHEN NEW.request_id LIKE 'receive:%' BEGIN SELECT RAISE(ABORT, 'fixture receive failure'); END");
  assert.throws(() => store.receive("a", "r1", "From workflow", [{ title: "Slide", bullets: ["point"], notes: "" }]), /fixture receive failure/u);
  assert.deepEqual(store.list("a").map(item => item.id), [source.id]);
  const receipts = db.prepare("SELECT COUNT(*) AS n FROM presentation_copies").get() as { n: number };
  assert.equal(Number(receipts.n), 0);
});

// W5-01-PPT-STORE-03: the authority wait comes before the callback, so a refusal never enters the write.
test("W5-01-PPT-STORE-03: a refused beforeEffect does not enter the write", async t => {
  const home = await mkdtemp(join(tmpdir(), "ppt-store-refused-"));
  const store = openPptStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownPptStores(run => run(store));
  let entered = false;
  const caller: ActionExecutionContext = { actor_id: "test", project_id: "a", audience: "user", permissions: [],
    beforeEffect: async () => { throw new Error("refused"); } };
  await assert.rejects(stores.write(caller, () => { entered = true; return 0; }), /refused/u);
  assert.equal(entered, false);
  assert.deepEqual(store.list("a"), []);
});
