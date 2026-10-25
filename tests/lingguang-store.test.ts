import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLingguangActionHandlers, ownLingguangStores, type LingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { openLingguangStore } from "./fixtures/plugin-home-stores.js";

function fixture(t: test.TestContext): LingguangStore {
  const home = mkdtempSync(join(tmpdir(), "lingguang-store-"));
  const store = openLingguangStore(home);
  t.after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });
  return store;
}

test("a request id names one save: the same input repeats, another input under it is refused and nothing is lost", t => {
  const store = fixture(t);
  const first = store.create({ title: "A idea", body: "A body", project_id: "P", request_id: "req-1" });
  assert.equal(store.create({ title: "A idea", body: "A body", project_id: "P", request_id: "req-1" }).id, first.id, "the same input is the same save");
  assert.equal(store.create({ title: " A idea ", body: "A body", project_id: "P", request_id: "req-1" }).id, first.id, "the title is compared as it is stored");
  assert.throws(() => store.create({ title: "B idea", body: "B body", project_id: "P", request_id: "req-1" }), { code: "lingguang.request_conflict" });
  assert.throws(() => store.create({ title: "A idea", body: "another body", project_id: "P", request_id: "req-1" }), { code: "lingguang.request_conflict" });
  assert.deepEqual(store.list("P").map(spark => [spark.id, spark.title, spark.body]), [[first.id, "A idea", "A body"]], "the first save is untouched and no second one appeared");
  // Ids are independent per partition and per request; an id that merely starts with another one is another id.
  const elsewhere = store.create({ title: "Q idea", project_id: "Q", request_id: "req-1" });
  assert.notEqual(elsewhere.id, first.id);
  const longer = store.create({ title: "B idea", body: "B body", project_id: "P", request_id: "req-1#x" });
  assert.notEqual(longer.id, first.id);
  assert.equal(store.create({ title: "B idea", body: "B body", project_id: "P", request_id: "req-1#x" }).id, longer.id);
  assert.equal(store.list("P").length, 2);
});

test("lingguang.create refuses a reused request id for different content, whoever asks", async t => {
  const store = fixture(t);
  const handlers = createLingguangActionHandlers({ ...ownLingguangStores(run => run(store)), modelAvailability: () => ({ available: false }) });
  const handler = handlers.find(handler => handler.capability_id === "lingguang.create")!;
  const caller = (actor: string) => ({ actor_id: actor, project_id: "P", audience: "mcp", permissions: ["lingguang:write"], beforeEffect: async () => {} }) as never;
  const create = async (actor: string, input: Record<string, string>) => (await handler.handle(caller(actor), input)) as { spark: { id: string } };
  const a = await create("mcp:A", { title: "A idea", body: "A body", request_id: "req-1" });
  await assert.rejects(create("mcp:B", { title: "B idea", body: "B body", request_id: "req-1" }), { code: "lingguang.request_conflict" });
  assert.equal((await create("mcp:A", { title: "A idea", body: "A body", request_id: "req-1" })).spark.id, a.spark.id);
  assert.deepEqual(store.list("P").map(spark => spark.title), ["A idea"]);
});

test("a delivery retried after the person moved its spark returns that spark; a copy retry does too", t => {
  const store = fixture(t);
  const key = "workflow:inst-1:2";
  const delivered = store.create({ title: "delivered", body: "b", project_id: "A", request_id: key });
  store.relocate(delivered.id, "A", "B");
  const retried = store.create({ title: "delivered", body: "b", project_id: "A", request_id: key });
  assert.equal(retried.id, delivered.id);
  assert.equal(retried.project_id, "B", "it says where the spark is now");
  assert.equal(store.list("A").length + store.list("C").length, 0, "the retry made no second spark");
  assert.throws(() => store.create({ title: "other", body: "b", project_id: "A", request_id: key }), { code: "lingguang.request_conflict" }, "moving the spark does not free the id");

  const copy = store.duplicate(delivered.id, "B", "C", "copy-req");
  assert.equal(copy.project_id, "C");
  store.relocate(copy.id, "C", "D");
  assert.equal(store.duplicate(delivered.id, "B", "C", "copy-req").id, copy.id, "the copy that moved on is still the answer to its request");
  store.update(delivered.id, { body: "edited since" }, "B");
  assert.equal(store.duplicate(delivered.id, "B", "C", "copy-req").id, copy.id, "a copy request is about the spark, not what it says at retry time");
  store.relocate(delivered.id, "B", "E");
  assert.equal(store.duplicate(delivered.id, "B", "C", "copy-req").id, copy.id, "and not about where the source is now");
  assert.throws(() => store.duplicate(delivered.id, "E", "C", "copy-req"), { code: "lingguang.request_conflict" }, "another source under the same request is another copy");
  assert.equal(store.list("C").length + store.list("A").length, 0);
});

// A discard can say which copy of the spark it was decided on (expected_updated_at, the guard update has), so words another
// writer put in after that copy was read are not thrown away with the spark. (Findings 4 and 16 of the batch B compliance check.)
test("a discard that names the copy it was decided on is refused once the spark has changed, and takes nothing else in the batch", t => {
  const store = fixture(t);
  const blank = store.create({ project_id: "P" }), other = store.create({ project_id: "P", body: "another idea" });
  const read = blank.updated_at;
  const written = store.update(blank.id, { body: "written meanwhile by the Assistant" }, "P");
  assert.notEqual(written.updated_at, read);
  assert.throws(() => store.discard([blank.id], "P", { [blank.id]: read }), { code: "lingguang.conflict" });
  assert.throws(() => store.discard([other.id, blank.id], "P", { [other.id]: other.updated_at, [blank.id]: read }), { code: "lingguang.conflict" });
  assert.deepEqual(store.list("P").map(spark => [spark.id, spark.status, spark.body]).sort(), [[blank.id, "inbox", "written meanwhile by the Assistant"], [other.id, "inbox", "another idea"]].sort(),
    "the changed spark stays, and so does the one that had not changed: the batch is all or nothing");
  store.discard([blank.id], "P", { [blank.id]: written.updated_at });
  assert.deepEqual(store.list("P").map(spark => spark.id), [other.id], "the copy that is current goes");
});

test("a discard without a named copy goes as before, one already discarded is not a conflict, and a copy named for another id is refused", t => {
  const store = fixture(t);
  const a = store.create({ project_id: "P", body: "a" }), b = store.create({ project_id: "P", body: "b" });
  store.update(a.id, { body: "a, edited" }, "P");
  store.discard([a.id], "P");
  assert.equal(store.get(a.id, "P").status, "discarded");
  store.discard([a.id], "P", { [a.id]: a.updated_at });
  assert.throws(() => store.discard([b.id], "P", { [a.id]: a.updated_at }), { code: "lingguang.invalid" });
  assert.equal(store.get(b.id, "P").status, "inbox");
  assert.throws(() => store.discard([a.id, b.id], "Q", { [b.id]: b.updated_at }), { code: "lingguang.not_found" }, "the project still bounds it");
});
