import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalAssistantMaterialInspector } from "../apps/local-host/src/personal-assistant-sources.js";
import { assistantCaller } from "./personal-assistant-fixture.js";

test("material inspector traces Inbox to original Feed, rechecks grant and ignores sync-only source updates", async () => {
  const source = { source_id: "s", name: "公开来源", kind: "custom_rss", sync_kind: "public_source" as const, status: "active" as const, enabled: true,
    config: { feed_url: "https://example.org/feed" }, credential_ref: null, imported_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-26T01:00:00Z" };
  let authorized = true, checks = 0;
  const inspect = createPersonalAssistantMaterialInspector({ projectId: "assistant-project", boardId: "b", feed: {
    getInboxEntry: (board, id) => { assert.equal(board, "b"); assert.equal(id, "inbox"); return { subject_type: "feed_item", subject_id: "item" }; },
    getFeedItem: (_board, id) => { assert.equal(id, "item"); return { source_id: "s", external_id: "original", source_created_at: "2026-09-25T01:00:00Z", imported_at: "2026-09-26T01:00:00Z", disposition: "inbox" }; },
    getSource: () => source,
  }, inspectSourceAuthorization: async input => { checks++; assert.equal(input.source_id, "s"); return { authorized, connection_id: null, revision: "grant-1" }; } });
  const caller = { ...assistantCaller, permissions: [...assistantCaller.permissions, "feed:read", "inbox:read"] };
  const first = await inspect({ kind: "inbox_entry", id: "inbox" }, caller);
  assert.equal(first!.external_id, "original"); assert.equal(first!.occurred_at, "2026-09-25T01:00:00Z"); assert.equal(first!.authorization_revision, "grant-1");
  source.updated_at = "2026-09-26T02:00:00Z";
  assert.deepEqual(await inspect({ kind: "feed_item", id: "item" }, caller), first, "a later sync does not re-notify identical content");
  authorized = false; await assert.rejects(inspect({ kind: "feed_item", id: "item" }, caller), { code: "assistant.source_unavailable" }); assert.equal(checks, 3);
  await assert.rejects(inspect({ kind: "feed_item", id: "item" }, assistantCaller), { code: "assistant.forbidden" });
  assert.equal(await inspect({ kind: "goal", id: "goal" }, caller), null);
});
