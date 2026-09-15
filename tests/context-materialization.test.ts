import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createContextLedger, createContextMaterializer } from "@molis-ai/molis-work-module-context-ledger";
import type { ContextObjectRead, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { readLinkedFeedContext } from "@molis-ai/molis-work-plugin-feed";

const scope = { kind: "personal" as const, id: "project-a" };
const access = { actor_id: "test-reader", scope };
const goal: ObjectRef = { module: "goals", id: "goal-a", version: null, scope };
const feed: ObjectRef = { module: "feed", id: "item-a", version: null, scope };
const artifact: ObjectRef = { module: "artifacts", id: "artifact-a", version: 2, scope };

test("Context rebuild walks cyclic references once, preserves exact versions, and exposes missing/denied/stale sources", () => {
  const db = new Database(":memory:");
  try {
    const ledger = createContextLedger(db, { authorize: () => true });
    const materializer = createContextMaterializer(ledger);
    for (const [key, source, target] of [["goal-feed", goal, feed], ["feed-goal", feed, goal],
      ["feed-artifact", feed, artifact]] as const) {
      ledger.commands.put(access, { key, source, target, type: "test.source", cause: "confirmed" });
    }
    const request = { roots: [goal], direction: "outgoing" as const, relation_types: ["test.source"], max_depth: 8, max_nodes: 10 };
    const calls: string[] = [];
    const read = (ref: ObjectRef): ContextObjectRead<string> => {
      calls.push(ref.id);
      return { state: "resolved", ref: { ...ref, version: ref.version ?? 3 }, value: `owner:${ref.id}` };
    };
    const result = materializer.rebuild(access, request, read);
    assert.deepEqual(calls, ["goal-a", "item-a", "artifact-a"]);
    assert.deepEqual(result.nodes.map((node) => [node.requested.id, node.state]),
      [["goal-a", "resolved"], ["item-a", "resolved"], ["artifact-a", "resolved"]]);
    assert.equal(result.edges.length, 3);
    assert.equal(result.truncated, false);
    const snapshot = result.nodes[2]!;
    assert.equal(snapshot.state === "resolved" && snapshot.ref.version, 2);
    const stale = materializer.rebuild(access, { ...request, roots: [artifact] }, (ref) => ({
      state: "resolved", ref: { ...ref, version: 3 }, value: "must-not-be-used",
    }));
    assert.deepEqual(stale.nodes, [{ requested: artifact, state: "stale" }]);
    for (const state of ["missing", "denied", "unavailable"] as const) {
      const unavailable = materializer.rebuild(access, request, () => ({ state }));
      assert.deepEqual(unavailable.nodes, [{ requested: goal, state }]);
      assert.deepEqual(unavailable.edges, [], "unreadable content cannot expand a traversal");
    }
    const limited = materializer.rebuild(access, { ...request, max_nodes: 1 }, read);
    assert.equal(limited.nodes.length, 1);
    assert.equal(limited.truncated, true);
    ledger.commands.remove(access, "feed-artifact", "source revoked");
    assert.deepEqual(materializer.rebuild(access, request, read).nodes.map((node) => node.requested.id), ["goal-a", "item-a"]);
  } finally { db.close(); }
});

test("Rebuild rejects unauthorized roots before content access and retries fresh owner state after failure", () => {
  const db = new Database(":memory:");
  try {
    const ledger = createContextLedger(db, { authorize: (input) => input.actor_id === "test-reader" });
    const materializer = createContextMaterializer(ledger);
    const request = { roots: [goal], direction: "outgoing" as const, relation_types: [], max_depth: 0, max_nodes: 10 };
    let calls = 0;
    const read = (ref: ObjectRef): ContextObjectRead<string> => {
      calls++;
      return { state: "resolved", ref, value: "private content" };
    };
    assert.throws(() => materializer.rebuild({ ...access, actor_id: "intruder" }, request, read), { code: "context.access_denied" });
    assert.throws(() => materializer.rebuild(access, { ...request, roots: [goal, { ...feed,
      scope: { kind: "team_project", id: "team-a" } }] }, read), { code: "context.scope_mismatch" });
    assert.equal(calls, 0);
    assert.throws(() => materializer.rebuild(access, request, () => { throw new Error("owner temporarily offline"); }), /temporarily offline/);
    // Discard the handler (and its view), then reconstruct from fresh owner content.
    const rebuilt = createContextMaterializer(ledger).rebuild(access, request, (ref) => ({
      state: "resolved", ref: { ...ref, version: 4 }, value: "current owner content",
    }));
    assert.equal(rebuilt.nodes[0]?.state === "resolved" && rebuilt.nodes[0].value, "current owner content");
    const wrongScope = materializer.rebuild(access, request, (ref) => ({ state: "resolved",
      ref: { ...ref, scope: { kind: "personal", id: "project-other" } }, value: "private other project",
    }));
    assert.deepEqual(wrongScope.nodes, [{ requested: goal, state: "stale" }]);
  } finally { db.close(); }
});

test("Runtime Feed context uses live Ledger links, deterministic selection and owner data on every rebuild", () => {
  const db = new Database(":memory:");
  try {
    const ledger = createContextLedger(db, { authorize: () => true });
    const items = new Map([
      ["item-a", { item_id: "item-a", revision: 2, updated_at: "2026-09-05T10:00:00Z", body: "older" }],
      ["item-b", { item_id: "item-b", revision: 1, updated_at: "2026-09-05T11:00:00Z", body: "newer" }],
    ]);
    for (const id of ["item-a", "item-b", "missing"]) ledger.commands.put(access, {
      key: `feed.goal:${id}`, type: "feed.goal", source: { ...feed, id }, target: goal, cause: "feed.link_goal",
    });
    const input = { project_id: "project-a", goal_id: "goal-a", materializer: createContextMaterializer(ledger),
      readGoal: () => ({ goal_id: "goal-a", board_id: "project-a", current_contract_revision: 1 }),
      readItem: (id: string) => items.get(id) ?? null,
      renderItem: (item: { body: string }) => item.body,
    };
    assert.deepEqual(readLinkedFeedContext(input), { source_context: "newer" });
    assert.deepEqual(readLinkedFeedContext({ ...input, item_id: "item-a" }), { source_context: "older" });
    assert.equal(readLinkedFeedContext({ ...input, item_id: "not-linked" }), null);
    items.get("item-a")!.body = "updated content";
    ledger.commands.put(access, { key: "feed.goal:item-b", type: "feed.goal", source: { ...feed, id: "item-b" },
      target: { ...goal, id: "goal-other" }, cause: "feed.relink" });
    assert.deepEqual(readLinkedFeedContext(input), { source_context: "updated content" });
    assert.equal(readLinkedFeedContext({ ...input, item_id: "item-b" }), null);
    ledger.commands.remove(access, "feed.goal:item-a", "feed.item_deleted");
    assert.equal(readLinkedFeedContext(input), null);
  } finally { db.close(); }
});
