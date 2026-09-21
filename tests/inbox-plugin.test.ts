import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const TOKEN = "inbox-plugin-test-token-0123456789012345";

test("Inbox plugin lists Attention entries, completes without deleting the Feed Item", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-inbox-plugin-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const created = await catalog.createProject({ display_name: "Inbox 项目", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  let sequence = 0;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    catalog.close();
    await rm(homeDirectory, { recursive: true, force: true });
  });

  const addFeed = await fetch(`${origin}/api/settings/projects/${project.project_id}/plugins`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-molis-work-control-token": TOKEN,
      "x-molis-work-idempotency-key": "add-feed",
    },
    body: JSON.stringify({ plugin_id: "feed" }),
  });
  assert.equal(addFeed.status, 200);

  insertFeedItem(project, "inbox-plugin-item");
  const prefix = `/projects/${encodeURIComponent(project.project_id)}`;
  const added = await webFetch(`${origin}${prefix}/api/feed/items/inbox-plugin-item/inbox`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expected_revision: 1 }),
  });
  assert.equal(added.status, 200);

  const listed = await webFetch(`${origin}${prefix}/api/inbox`);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json() as { entries: Array<{ entry_id: string; status: string; revision: number; subject_id: string }> };
  assert.equal(listedBody.entries.length, 1);
  assert.equal(listedBody.entries[0]?.subject_id, "inbox-plugin-item");
  assert.equal(listedBody.entries[0]?.status, "open");
  const entryId = listedBody.entries[0]!.entry_id;
  const revision = listedBody.entries[0]!.revision;

  const page = await (await webFetch(`${origin}${prefix}/`)).text();
  const inboxDirectory = page.match(/data-inbox-directory[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(inboxDirectory, /data-inbox-row/);
  assert.match(inboxDirectory, new RegExp(`data-inbox-entry-id="${entryId}"`));
  assert.match(page, /inbox-attention-next/);
  assert.match(inboxDirectory, /你手工加入|Inbox · 手工加入/);
  assert.doesNotMatch(inboxDirectory, /正文里包含需要核对的事实/);
  assert.doesNotMatch(inboxDirectory, /data-feed-directory|data-feed-list|data-feed-entry-id/);
  assert.match(page, /data-inbox-open-feed="inbox-plugin-item"/);
  assert.match(page, /data-feed-entry-id="inbox-plugin-item"/);
  assert.match(inboxDirectory, /data-inbox-judgment/);
  assert.match(inboxDirectory, /system_pick_inbox_next/);
  assert.doesNotMatch(inboxDirectory, /system_admit_inbox/);
  assert.doesNotMatch(page, /data-feed-entry-type="inbox_message"|data-feed-entry-id="inbox:/);

  const missingRevision = await webFetch(`${origin}${prefix}/api/inbox/entries/${entryId}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "done" }),
  });
  assert.equal(missingRevision.status, 400);

  const stale = await webFetch(`${origin}${prefix}/api/inbox/entries/${entryId}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "done", expected_revision: revision + 8 }),
  });
  assert.equal(stale.status, 409);

  const completed = await webFetch(`${origin}${prefix}/api/inbox/entries/${entryId}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "done", expected_revision: revision }),
  });
  assert.equal(completed.status, 200);
  const completedBody = await completed.json() as { entry: { status: string; revision: number } };
  assert.equal(completedBody.entry.status, "done");

  const completedAgain = await webFetch(`${origin}${prefix}/api/inbox/entries/${entryId}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "done", expected_revision: completedBody.entry.revision }),
  });
  assert.equal(completedAgain.status, 200);
  const completedAgainBody = await completedAgain.json() as { entry: { revision: number } };
  assert.equal(completedAgainBody.entry.revision, completedBody.entry.revision);

  const after = await (await webFetch(`${origin}${prefix}/`)).text();
  const afterInbox = after.match(/data-inbox-directory[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(afterInbox, /data-inbox-status="done"/);
  assert.match(afterInbox, /data-inbox-stage-group="history"/);
  assert.match(afterInbox, /现在没有需要你介入的事项/);
  assert.match(after, /data-feed-entry-id="inbox-plugin-item"/);

  insertFeedItem(project, "inbox-plugin-item-2");
  const addedSecond = await webFetch(`${origin}${prefix}/api/feed/items/inbox-plugin-item-2/inbox`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expected_revision: 1 }),
  });
  assert.equal(addedSecond.status, 200);
  const secondListed = await webFetch(`${origin}${prefix}/api/inbox`);
  const secondEntry = ((await secondListed.json()) as { entries: Array<{ entry_id: string; status: string; revision: number; subject_id: string }> })
    .entries.find((entry) => entry.subject_id === "inbox-plugin-item-2");
  assert.ok(secondEntry);
  const dismissed = await webFetch(`${origin}${prefix}/api/inbox/entries/${secondEntry.entry_id}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "dismissed", expected_revision: secondEntry.revision }),
  });
  assert.equal(dismissed.status, 200);
  assert.equal((await dismissed.json() as { entry: { status: string } }).entry.status, "dismissed");
  const afterDismiss = await (await webFetch(`${origin}${prefix}/`)).text();
  const afterDismissInbox = afterDismiss.match(/data-inbox-directory[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(afterDismissInbox, /data-inbox-status="dismissed"/);
  assert.match(afterDismissInbox, /data-inbox-stage-group="history"/);
  assert.match(afterDismiss, /data-feed-entry-id="inbox-plugin-item-2"/);

  const missing = await webFetch(`${origin}${prefix}/api/inbox/entries/missing-entry/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "done", expected_revision: 1 }),
  });
  assert.equal(missing.status, 404);

  const judgment = await webFetch(`${origin}${prefix}/api/inbox/judgment`);
  assert.equal(judgment.status, 200);
  const judgmentBody = await judgment.json() as {
    function_key: string | null;
    functions: Array<{ function_key: string; name: string }>;
  };
  assert.equal(judgmentBody.function_key, null);
  assert.ok(judgmentBody.functions.some((row) => row.function_key === "system_pick_inbox_next"));
  assert.equal(judgmentBody.functions.some((row) => row.function_key === "system_admit_inbox"), false);
  assert.equal(judgmentBody.functions.some((row) => row.function_key === "system_pick_home_dock"), false);

  const mismatched = await webFetch(`${origin}${prefix}/api/inbox/judgment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ function_key: "system_admit_inbox" }),
  });
  assert.equal(mismatched.status, 400);

  const bound = await webFetch(`${origin}${prefix}/api/inbox/judgment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ function_key: "system_pick_inbox_next" }),
  });
  assert.equal(bound.status, 200);
  assert.equal((await bound.json() as { function_key: string }).function_key, "system_pick_inbox_next");

  const rebound = await webFetch(`${origin}${prefix}/api/inbox/judgment`);
  assert.equal((await rebound.json() as { function_key: string }).function_key, "system_pick_inbox_next");

  const afterBind = await (await webFetch(`${origin}${prefix}/`)).text();
  assert.match(afterBind, /value="system_pick_inbox_next" selected/);

  const unpublished = await webFetch(`${origin}${prefix}/api/inbox/judgment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ function_key: "not_a_published_function" }),
  });
  assert.equal(unpublished.status, 400);

  const unbound = await webFetch(`${origin}${prefix}/api/inbox/judgment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ function_key: null }),
  });
  assert.equal(unbound.status, 200);
  assert.equal((await unbound.json() as { function_key: string | null }).function_key, null);

  function webFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "GET") return fetch(input, init);
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    headers.set("x-molis-work-control-token", TOKEN);
    if (!headers.has("x-molis-work-idempotency-key")) {
      sequence += 1;
      headers.set("x-molis-work-idempotency-key", `inbox-plugin-${sequence}`);
    }
    return fetch(input, { ...init, headers });
  }
});

function insertFeedItem(project: { database_path: string; board_id: string }, itemId: string): void {
  const store = new LocalProjectDatabase(project.database_path);
  const now = "2026-09-14T10:00:00.000Z";
  try {
    store.db.prepare(`
      INSERT OR IGNORE INTO feed_sources (
        board_id, source_id, kind, name, description, status, enabled, item_count,
        origin, last_sync_at, last_outcome, last_error_code, imported_at, updated_at
      ) VALUES (@board_id, 'source-inbox-plugin', 'rss', '测试 RSS', '测试来源', 'active', 1, 1,
        'molis_work', @now, 'completed', NULL, @now, @now)
    `).run({ board_id: project.board_id, now });
    store.db.prepare(`
      INSERT INTO feed_items (
        board_id, item_id, source_id, item_type, kind, title, summary, body,
        source_kind, source_label, external_id, url, origin_status, priority,
        tags_json, author, disposition, linked_goal_id, revision, source_created_at,
        source_updated_at, imported_at, updated_at
      ) VALUES (
        @board_id, @item_id, 'source-inbox-plugin', 'feed', 'article',
        '确认对象边界', '摘要不应被 Inbox 复制', '正文里包含需要核对的事实',
        'rss', '测试 RSS', @external_id, 'https://example.com/item',
        'inbox', 'normal', '[]', '测试作者', 'inbox', NULL, 1, @now, @now, @now, @now
      )
    `).run({ board_id: project.board_id, item_id: itemId, external_id: `external-${itemId}`, now });
  } finally {
    store.close();
  }
}
