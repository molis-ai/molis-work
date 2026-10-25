import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import type { ContextAccess, ContextLedgerApi, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { fromBetterSqlite, FeedModule } from "@molis-ai/molis-work-plugin-feed/store";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";

const access: ContextAccess = { actor_id: "alice", scope: { kind: "personal", id: "project-a" } };
const reference = (module: ObjectRef["module"], id: string, version: number | null = null): ObjectRef =>
  ({ module, id, version, scope: access.scope });

test("Ledger retains exact reference revisions, idempotent replay, removal and scope isolation", () => {
  const db = new Database(":memory:");
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
  const db = new Database(":memory:");
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

function feedHarness() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE project_root (project_id TEXT PRIMARY KEY); INSERT INTO project_root VALUES ('project-a'); INSERT INTO project_root VALUES ('project-b');");
  const ledger = createContextLedger(db, { authorize: (request) => request.scope.kind === "personal" });
  let feed: FeedModule;
  let fail = false;
  const attention = new AttentionModule(db, { exists: (projectId, _type, itemId) => feed.query.exists(projectId, itemId) });
  const open = (api: ContextLedgerApi = ledger) => {
    feed = new FeedModule(fromBetterSqlite(db), attention, { ledger: api, eventSink: () => { if (fail) throw new Error("event failed"); } });
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
    const linked = feed.commands.linkGoal("project-a", item.item_id, "goal-1", "processing");
    assert.equal(linked.linked_goal_id, "goal-1");
    assert.equal(linked.disposition, "processing");
    assert.equal(linked.revision, item.revision + 1);
    assert.deepEqual(feed.commands.linkGoal("project-a", item.item_id, "goal-1", "processing"), linked);
    assert.equal(h.attention.query.list("project-a")[0]?.status, "in_progress");
    assert.equal(feed.query.findByLinkedGoal("project-a", "goal-1")?.item_id, item.item_id);
    assert.equal(feed.query.findByLinkedGoal("project-b", "goal-1"), null);
    assert.equal((h.db.prepare("SELECT name FROM pragma_table_info('feed_items')").all() as Array<{ name: string }>).some((column) => column.name === "linked_goal_id"), false, "Feed keeps no copy of the link");
    feed.commands.linkGoal("project-a", item.item_id, "goal-2", "promoted");
    assert.equal(feed.query.findByLinkedGoal("project-a", "goal-1"), null);
    const reopened = h.open();
    assert.equal(reopened.query.get("project-a", item.item_id).linked_goal_id, "goal-2");
    assert.equal(reopened.query.get("project-a", item.item_id).title, item.title);
    assert.deepEqual(h.ledger.query.history(access, `feed.goal:${item.item_id}`).map((edge) => edge.target.id), ["goal-1", "goal-2"]);
    reopened.commands.deleteBySource("project-a", "source-a");
    assert.equal(h.ledger.query.get(access, `feed.goal:${item.item_id}`), null);
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
    assert.throws(() => feed.commands.linkGoal("project-a", item.item_id, "goal-1", "processing"), /event failed/);
    assert.deepEqual(feed.query.get("project-a", item.item_id), item);
    assert.deepEqual(h.attention.query.list("project-a"), beforeAttention);
    assert.deepEqual(feed.events.list("project-a"), beforeEvents);
    assert.deepEqual(h.ledger.query.history(access, `feed.goal:${item.item_id}`), []);
  } finally { h.db.close(); }
});
