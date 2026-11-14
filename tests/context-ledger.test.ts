import assert from "node:assert/strict";
import test from "node:test";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import type { ContextAccess, ContextLedgerApi, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { FEED_ITEMS_SCHEMA_SQL, fromBetterSqlite, FeedModule } from "@molis-ai/molis-work-plugin-feed/store";
import { ATTENTION_SCHEMA_SQL, AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { feedLedgerKey, feedLedgerPort } from "./fixtures/feed-ledger.js";

const access: ContextAccess = { actor_id: "alice", scope: { kind: "personal", id: "project-a" } };
const reference = (module: ObjectRef["module"], id: string, version: number | null = null): ObjectRef =>
  ({ module, id, version, scope: access.scope });

test("Ledger retains exact reference revisions, idempotent replay, removal and scope isolation", () => {
  const db = openTestSqlite(":memory:");
  try {
    const ledger = createContextLedger(db, { authorize: (request) => request.actor_id === "alice" });
    const input = { key: "output", type: "goal.output", source: reference("goals", "goal-1"),
      target: reference("artifacts", "artifact-1", 2), cause: "published" };
    const first = ledger.commands.put(access, input);
    assert.equal(first.revision, 1);
    assert.deepEqual(ledger.commands.put(access, input), first);
    assert.equal(ledger.commands.put(access, { ...input, target: reference("artifacts", "artifact-1", 3) }).revision, 2);
    assert.deepEqual(ledger.query.history(access, "output").map((item) => item.target.version), [2, 3]);
    assert.deepEqual(ledger.query.list({ ...access, scope: { kind: "personal", id: "project-b" } }), []);
    // R4A2-01: foreign actors cannot access the owner partition; no relation is committed.
    assert.throws(() => ledger.query.list({ ...access, actor_id: "bob" }), (error: unknown) => {
      // LEDGER-01: the same authorization rejection uses the common error and changes no records.
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "context_ledger.access_denied");
      assert.equal(error.message, "无权访问这个关系分区");
      assert.equal(error.kind, "invalid");
      assert.equal(actionHttpStatus(error), 400);
      assert.equal(Object.hasOwn(error, "details"), false);
      return true;
    });
    assert.throws(() => ledger.commands.put({ ...access, actor_id: "bob" }, input), { code: "context_ledger.access_denied" });
    assert.throws(() => ledger.commands.remove({ ...access, actor_id: "bob" }, "output", "denied"), { code: "context_ledger.access_denied" });
    assert.equal(ledger.query.history(access, "output").length, 2);
    assert.throws(() => ledger.commands.put(access, { ...input, target: { ...input.target, scope: { kind: "team_project", id: "project-a" } } }), { code: "context_ledger.scope_mismatch" });
    assert.throws(() => ledger.commands.put(access, { ...input, target: reference("artifacts", "artifact-1") }), { code: "context_ledger.invalid_reference" });
    assert.throws(() => ledger.commands.put(access, { ...input, source: reference("goals", "other") }), { code: "context_ledger.key_conflict" });
    assert.equal(ledger.commands.remove(access, "output", "removed")?.revision, 3);
    assert.equal(ledger.commands.remove(access, "output", "retry")?.revision, 3);
    assert.equal(ledger.query.get(access, "output"), null);
    assert.deepEqual(ledger.query.list(access), []);
    assert.equal(ledger.commands.put(access, input).revision, 4);
    const restarted = createContextLedger(db, { authorize: () => true });
    assert.deepEqual(restarted.query.history(access, "output").map((item) => [item.revision, item.state]),
      [[1, "active"], [2, "active"], [3, "removed"], [4, "active"]]);
  } finally { db.close(); }
});

test("Ledger keeps a reference to an input an agent run holds as given, without reading it (RCPT-390)", () => {
  const db = openTestSqlite(":memory:");
  try {
    const ledger = createContextLedger(db, { authorize: (request) => request.actor_id === "alice" });
    const input: ObjectRef = { ...reference("agent-host", "sess-1/inp-2"), object_type: "agent_input", project_id: "project-a" };
    const proposal = { key: "goal.conversation_input.proposal:goal-1:sess-1/inp-2", type: "goal.conversation_input.proposal",
      source: reference("goals", "goal-1"), target: input, cause: "AI 转述" };
    const edge = ledger.commands.put(access, proposal);
    assert.deepEqual(edge.target, input);
    assert.deepEqual(ledger.commands.put(access, proposal), edge);
    assert.equal(ledger.query.history(access, edge.key).length, 1);
    assert.deepEqual(ledger.query.list(access, { target: input }).map(item => item.key), [edge.key]);
    // The module is part of the reference: the same id under another module is another object.
    assert.deepEqual(ledger.query.list(access, { target: { ...input, module: "assistant" } }), []);
  } finally { db.close(); }
});

test("SCS-17 the Ledger batch returns only active edges between exact candidates in the authorized scope", () => {
  const db = openTestSqlite(":memory:");
  try {
    const ledger = createContextLedger(db, { authorize: request => request.actor_id === access.actor_id && request.scope.id === access.scope.id });
    const source = { ...reference("plugins", "same"), object_type: "note", project_id: "project-a" };
    const target = { ...reference("plugins", "same"), object_type: "document", project_id: "project-a" };
    const outside = { ...target, project_id: "project-b" };
    const type = "example.derived";
    const original = ledger.commands.put(access, { source, target, type, key: "between", cause: "test" });
    ledger.commands.put(access, { source, target: outside, type, key: "outside", cause: "test" });
    assert.deepEqual(ledger.activeBetween(access, [source, target], [type]), [original]);
    assert.deepEqual(ledger.activeBetween(access, [source], [type]), []);
    assert.deepEqual(ledger.activeBetween(access, [source, target], ["another.type"]), []);
    assert.throws(() => ledger.activeBetween({ ...access, actor_id: "another" }, [source, target], [type]), { code: "context_ledger.access_denied" });
    assert.throws(() => ledger.activeBetween(access, [source, { ...target, scope: { kind: "personal", id: "project-b" } }], [type]),
      { code: "context_ledger.scope_mismatch" });
    ledger.commands.remove(access, original.key, "removed");
    assert.deepEqual(ledger.activeBetween(access, [source, target], [type]), [], "a removed latest edge cannot expose its history");
  } finally { db.close(); }
});

function feedHarness() {
  const db = openTestSqlite(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE project_root (project_id TEXT PRIMARY KEY); INSERT INTO project_root VALUES ('project-a'); INSERT INTO project_root VALUES ('project-b');");
  // Feed's tables are its declaration's (FI-5): the platform makes them when it opens a library, and Feed's store does not.
  db.exec(FEED_ITEMS_SCHEMA_SQL);
  const ledger = createContextLedger(db, { authorize: (request) => request.scope.kind === "personal" });
  let feed: FeedModule;
  let fail = false;
  db.exec(ATTENTION_SCHEMA_SQL);
  const attention = new AttentionModule(db, { exists: (projectId, _type, itemId) => feed.query.exists(projectId, itemId) });
  const open = (api: ContextLedgerApi = ledger, observe?: (sql: string, count: number) => void) => {
    const sql = fromBetterSqlite(db);
    const measured = { ...sql, all: <Row = Record<string, unknown>>(query: string, ...params: unknown[]): Row[] => {
      const rows = sql.all<Row>(query, ...params); observe?.(query, rows.length); return rows;
    } };
    feed = new FeedModule(measured, attention, { ledger: feedLedgerPort(api), eventSink: () => { if (fail) throw new Error("event failed"); } });
    return feed;
  };
  const ingest = (id: string) => feed.commands.ingest({ project_id: "project-a", source_id: "source-a",
    source_kind: "github", source_label: "GitHub", external_id: id, title: id, summary: "Notification summary",
    occurred_at: "2026-09-05T00:00:00.000Z", attention: { reason: "source_rule", detail: {} } }).item;
  open();
  return { db, ledger, attention, open, ingest, failEvents: () => { fail = true; } };
}

test("Feed uses Ledger as sole link owner across relink, restart and deletion without changing content", () => {
  const h = feedHarness();
  try {
    const item = h.ingest("issue-1");
    const feed = h.open();
    const linked = feed.commands.linkGoal("project-a", item.item_id, "goal-1", "promoted");
    assert.equal(linked.linked_goal_id, "goal-1");
    assert.equal(linked.disposition, "promoted");
    assert.equal(linked.revision, item.revision + 1);
    assert.deepEqual(feed.commands.linkGoal("project-a", item.item_id, "goal-1", "promoted"), linked);
    assert.equal(h.attention.query.list("project-a")[0]?.status, "done");
    assert.equal(feed.query.findByLinkedGoal("project-a", "goal-1")?.item_id, item.item_id);
    assert.equal(feed.query.findByLinkedGoal("project-b", "goal-1"), null);
    assert.equal((h.db.prepare("SELECT name FROM pragma_table_info('feed_items')").all() as Array<{ name: string }>).some((column) => column.name === "linked_goal_id"), false, "Feed keeps no copy of the link");
    feed.commands.linkGoal("project-a", item.item_id, "goal-2", "promoted");
    assert.equal(feed.query.findByLinkedGoal("project-a", "goal-1"), null);
    const reopened = h.open();
    assert.equal(reopened.query.get("project-a", item.item_id).linked_goal_id, "goal-2");
    assert.equal(reopened.query.get("project-a", item.item_id).title, item.title);
    assert.deepEqual(h.ledger.query.history(access, feedLedgerKey(`feed.goal:${item.item_id}`)).map((edge) => edge.target.id), ["goal-1", "goal-2"]);
    reopened.commands.deleteBySource("project-a", "source-a");
    assert.equal(h.ledger.query.get(access, feedLedgerKey(`feed.goal:${item.item_id}`)), null);
    assert.equal(reopened.query.findByLinkedGoal("project-a", "goal-2"), null);
    assert.deepEqual(h.attention.query.list("project-a"), []);
  } finally { h.db.close(); }
});

test("Feed link and Attention changes roll back with Ledger when event persistence fails", () => {
  const h = feedHarness();
  try {
    const item = h.ingest("issue-rollback");
    const feed = h.open();
    const beforeAttention = h.attention.query.list("project-a");
    const beforeEvents = feed.events.list("project-a");
    h.failEvents();
    assert.throws(() => feed.commands.linkGoal("project-a", item.item_id, "goal-1", "promoted"), /event failed/);
    assert.deepEqual(feed.query.get("project-a", item.item_id), item);
    assert.deepEqual(h.attention.query.list("project-a"), beforeAttention);
    assert.deepEqual(feed.events.list("project-a"), beforeEvents);
    assert.deepEqual(h.ledger.query.history(access, feedLedgerKey(`feed.goal:${item.item_id}`)), []);
  } finally { h.db.close(); }
});

test("D0195: exact-key ledger batches are bounded, isolated and preserve removals", () => {
  const db = openTestSqlite(":memory:");
  try {
    const ledger = createContextLedger(db, { authorize: request => request.actor_id === "alice" });
    for (let n = 0; n < 205; n++) ledger.commands.put(access, { key: `edge-${n}`, type: "feed.goal", source: reference("feed", `item-${n}`), target: reference("goals", `goal-${n}`), cause: "test" });
    const keys = Array.from({ length: 200 }, (_, n) => `edge-${n}`);
    assert.equal(ledger.query.list(access, { keys }).length, 200);
    assert.deepEqual(ledger.query.list(access, { keys: [] }), []);
    assert.deepEqual(ledger.query.list(access, { keys: ["edge-204", "absent"] }).map(edge => edge.key), ["edge-204"]);
    ledger.commands.remove(access, "edge-204", "removed");
    assert.deepEqual(ledger.query.list(access, { keys: ["edge-204"] }), []);
    assert.equal(ledger.query.list(access, { keys: ["edge-204"], include_removed: true })[0]?.state, "removed");
    assert.deepEqual(ledger.query.list({ ...access, scope: { kind: "personal", id: "other" } }, { keys }), []);
    assert.throws(() => ledger.query.list(access, { keys: [...keys, "one-too-many"] }), { code: "context_ledger.invalid_reference" });
    assert.throws(() => ledger.query.list(access, { keys: [""] }), { code: "context_ledger.invalid_reference" });
  } finally { db.close(); }
});

test("D0195: Feed pages fetch only selected materials and one exact-key ledger batch", () => {
  const h = feedHarness();
  try {
    const ingesting = h.open();
    for (let n = 0; n < 405; n++) {
      const item = h.ingest(`page-${String(n).padStart(3, "0")}`);
      ingesting.commands.upsertMaterial({ project_id: "project-a", item_id: item.item_id, material_id: `material-${n}`, canonical_url: null,
        title: item.title, source_name: "GitHub", published_at: null, preview: `Selected material ${n}`, content_hash: null, content_ref: null,
        content_available: true, content_type: "text/plain", character_count: 10, captured_at: null, provenance: {}, selected_for_context: false,
        imported_at: "2026-11-08T00:00:00Z", updated_at: "2026-11-08T00:00:00Z" });
    }
    let gets = 0;
    const batches: number[] = [];
    const reads: { sql: string; count: number }[] = [];
    const feed = h.open({ ...h.ledger, query: { ...h.ledger.query, get: (...args) => { gets++; return h.ledger.query.get(...args); }, list: (...args) => { batches.push(args[1]?.keys?.length ?? -1); return h.ledger.query.list(...args); } } }, (sql, count) => reads.push({ sql, count }));
    const first = feed.query.list("project-a", { limit: 200, offset: 0 });
    const next = feed.query.list("project-a", { limit: 200, offset: 200 });
    const last = feed.query.list("project-a", { limit: 200, offset: 400 });
    assert.deepEqual([first.length, next.length, last.length], [200, 200, 5]);
    assert.equal(new Set([...first, ...next, ...last].map(item => item.item_id)).size, 405);
    assert.deepEqual(batches, [200, 200, 5]); assert.equal(gets, 0, "listing never adds per-item ledger reads");
    assert.ok([...first, ...next, ...last].every(item => item.body === null && item.materials.length === 0));
    // D0205/D0229/D0238: measure rows returned by the real SQL adapter, not just the final page size.
    assert.deepEqual(reads.filter(read => read.sql.includes("FROM feed_items")).map(read => read.count), [200, 200, 5]);
    assert.deepEqual(reads.filter(read => read.sql.includes("FROM feed_materials")), [], "FBR-02 list queries never load materials");
    reads.length = 0; batches.length = 0;
    assert.equal(feed.query.list("project-a", { limit: 10_000, offset: 0 }).length, 200, "oversized requests cannot bypass the page cap");
    reads.length = 0; batches.length = 0;
    assert.deepEqual(feed.query.list("project-a", { limit: 200, offset: 405 }), []);
    assert.deepEqual(feed.query.list("project-b", { limit: 200, offset: 0 }), []);
    assert.deepEqual(batches, [], "empty pages do not scan the relationship ledger");
    assert.equal(reads.filter(read => read.sql.includes("FROM feed_materials")).length, 0, "empty pages do not scan materials");
    // FBR-02: metadata pages select no bodies or materials, even when a single item has many attachments.
    const target = feed.query.get("project-a", last[0]!.item_id);
    for (let n = 0; n < 405; n++) feed.commands.upsertMaterial({ ...target.materials[0]!, material_id: `large-${String(n).padStart(4, "0")}` });
    reads.length = 0;
    const metadata = feed.query.list("project-a", { limit: 200, offset: 400 });
    assert.ok(metadata.every(item => item.body === null && item.materials.length === 0));
    assert.equal(reads.filter(read => read.sql.includes("FROM feed_materials")).length, 0);
    assert.ok(reads.filter(read => read.sql.includes("FROM feed_items")).every(read => !read.sql.includes("SELECT *")));
    // FBR-03: every material remains accessible through bounded pages and the exact detail reader.
    assert.deepEqual([0, 200, 400].map(offset => feed.query.materials("project-a", target.item_id, offset, 200).length), [200, 200, 6]);
    assert.equal(feed.query.get("project-a", target.item_id, { offset: 400, limit: 200 }).materials.length, 6);
    assert.deepEqual(feed.query.materials("project-b", target.item_id, 0, 200), []);
    // D0195: full-content callers keep every material; no SQL result exceeds the page bound.
    reads.length = 0;
    assert.equal(feed.query.get("project-a", target.item_id).materials.length, 406);
    assert.deepEqual(reads.filter(read => read.sql.includes("FROM feed_materials")).map(read => read.count), [200, 200, 6]);

    const matched = feed.query.list("project-a", { limit: 200, offset: 0, search: target.title, source_id: "source-a" });
    assert.deepEqual(matched.map(item => item.item_id), [target.item_id], "search reaches records outside the initial page");
    // FBR-04: stable-key walks keep later records even if an earlier page's item is deleted.
    const idPage = feed.query.list("project-a", { limit: 200, offset: 0, sort: "id" });
    const after = idPage.at(-1)!.item_id;
    h.db.prepare("DELETE FROM feed_items WHERE item_id = ?").run(idPage[0]!.item_id);
    const remainder = feed.query.list("project-a", { limit: 200, offset: 0, sort: "id", after_id: after });
    assert.equal(remainder.length, 200); assert.ok(remainder.every(item => item.item_id > after));
    assert.equal(feed.commands.deleteBySource("project-a", "source-a"), 404, "source deletion processes every batch");
    assert.deepEqual(feed.query.list("project-a", { limit: 200, offset: 0 }), []);

  } finally { h.db.close(); }
});
