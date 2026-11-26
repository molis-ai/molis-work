import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLingguangActionHandlers, ownLingguangStores, type LingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { openLingguangStore } from "./fixtures/plugin-home-stores.js";

function fixture(t: test.TestContext): LingguangStore & { home: string; in(partition: string): LingguangStore } {
  const home = mkdtempSync(join(tmpdir(), "lingguang-store-"));
  const store = openLingguangStore(home, "P"), others: LingguangStore[] = [];
  t.after(() => { store.close(); for (const other of others) other.close(); rmSync(home, { recursive: true, force: true }); });
  /** The same plugin's library in another partition (U2). */
  const inPartition = (partition: string) => { const other = openLingguangStore(home, partition); others.push(other); return other; };
  return Object.assign(store, { home, in: inPartition });
}
/** What placement does to move a spark between two partitions' libraries: export it there, put it here under its id, remove it there. */
function carry(from: LingguangStore, to: LingguangStore, id: string): void {
  const carried = from.exportRecord(id);
  to.putRecord(carried.record, "move:" + id, id);
  assert.equal(from.removeCarried(id, carried.revision), true);
}

test("a request id names one save: the same input repeats, another input under it is refused and nothing is lost", t => {
  const store = fixture(t);
  const first = store.create({ title: "A idea", body: "A body", request_id: "req-1" });
  assert.equal(store.create({ title: "A idea", body: "A body", request_id: "req-1" }).id, first.id, "the same input is the same save");
  assert.equal(store.create({ title: " A idea ", body: "A body", request_id: "req-1" }).id, first.id, "the title is compared as it is stored");
  assert.throws(() => store.create({ title: "B idea", body: "B body", request_id: "req-1" }), { code: "lingguang.request_conflict" });
  assert.throws(() => store.create({ title: "A idea", body: "another body", request_id: "req-1" }), { code: "lingguang.request_conflict" });
  assert.deepEqual(store.list().map(spark => [spark.id, spark.title, spark.body]), [[first.id, "A idea", "A body"]], "the first save is untouched and no second one appeared");
  // Ids are independent per partition and per request; an id that merely starts with another one is another id.
  const elsewhere = store.in("Q").create({ title: "Q idea", request_id: "req-1" });
  assert.notEqual(elsewhere.id, first.id);
  const longer = store.create({ title: "B idea", body: "B body", request_id: "req-1#x" });
  assert.notEqual(longer.id, first.id);
  assert.equal(store.create({ title: "B idea", body: "B body", request_id: "req-1#x" }).id, longer.id);
  assert.equal(store.list().length, 2);
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
  assert.deepEqual(store.list().map(spark => spark.title), ["A idea"]);
});

test("a delivery retried after the person moved its spark makes no second one; a copy retry returns the same copy", t => {
  const store = fixture(t), b = store.in("B"), c = store.in("C"), d = store.in("D");
  const key = "workflow:inst-1:2";
  const delivered = store.create({ title: "delivered", body: "b", request_id: key });
  carry(store, b, delivered.id);
  assert.equal(b.get(delivered.id).project_id, "B", "it says where the spark is now");
  // The request's receipt stays where it was delivered: a retry there finds its spark gone from this partition and makes none.
  assert.throws(() => store.create({ title: "delivered", body: "b", request_id: key }), { code: "lingguang.not_found" });
  assert.equal(store.list().length, 0, "the retry made no second spark");
  assert.throws(() => store.create({ title: "other", body: "b", request_id: key }), { code: "lingguang.request_conflict" }, "moving the spark does not free the id");

  const copy = c.putRecord(b.exportRecord(delivered.id).record, "copy-req");
  assert.equal(copy.project_id, "C");
  assert.equal(c.putRecord(b.exportRecord(delivered.id).record, "copy-req").id, copy.id, "the same copy request makes the same copy");
  carry(c, d, copy.id);
  assert.equal(d.get(copy.id).project_id, "D");
  b.update(delivered.id, { body: "edited since" });
  assert.throws(() => c.putRecord(b.exportRecord(delivered.id).record, "copy-req"), { code: "lingguang.request_conflict" }, "other words under the same request are another copy");
  assert.equal(c.list().length + store.list().length, 0);
});

// A discard can say which copy of the spark it was decided on (expected_updated_at, the guard update has), so words another
// writer put in after that copy was read are not thrown away with the spark. (Findings 4 and 16 of the batch B compliance check.)
test("a discard that names the copy it was decided on is refused once the spark has changed, and takes nothing else in the batch", t => {
  const store = fixture(t);
  const blank = store.create({  }), other = store.create({ body: "another idea" });
  const read = blank.updated_at;
  const written = store.update(blank.id, { body: "written meanwhile by the Assistant" });
  assert.notEqual(written.updated_at, read);
  assert.throws(() => store.discard([blank.id], { [blank.id]: read }), { code: "lingguang.conflict" });
  assert.throws(() => store.discard([other.id, blank.id], { [other.id]: other.updated_at, [blank.id]: read }), { code: "lingguang.conflict" });
  assert.deepEqual(store.list().map(spark => [spark.id, spark.status, spark.body]).sort(), [[blank.id, "inbox", "written meanwhile by the Assistant"], [other.id, "inbox", "another idea"]].sort(),
    "the changed spark stays, and so does the one that had not changed: the batch is all or nothing");
  store.discard([blank.id], { [blank.id]: written.updated_at });
  assert.deepEqual(store.list().map(spark => spark.id), [other.id], "the copy that is current goes");
});

test("a discard without a named copy goes as before, one already discarded is not a conflict, and a copy named for another id is refused", t => {
  const store = fixture(t);
  const a = store.create({ body: "a" }), b = store.create({ body: "b" });
  store.update(a.id, { body: "a, edited" });
  store.discard([a.id]);
  assert.equal(store.get(a.id).status, "discarded");
  store.discard([a.id], { [a.id]: a.updated_at });
  assert.throws(() => store.discard([b.id], { [a.id]: a.updated_at }), { code: "lingguang.invalid" });
  assert.equal(store.get(b.id).status, "inbox");
  assert.throws(() => store.in("Q").discard([a.id, b.id], { [b.id]: b.updated_at }), { code: "lingguang.not_found" }, "another partition's library has neither");
});
