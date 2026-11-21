import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SourcePullMaterial, SourcePullRequest } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { DEMO_PROJECT_ID, LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { FEED_ACTION_PERMISSIONS, feedContentActions, toFeedPublicError } from "@molis-ai/molis-work-plugin-feed";
import { initializeBoard } from "./fixtures/goals-board.js";
import { createLocalFeedApplication, createLocalFeedSourceService, listTestFeedSourceCatalog } from "./fixtures/feed-library.js";
import { completedSourcePull, createTestSourcePull } from "./fixtures/source-pull.js";

// BL-975: Feed keeps its own unit limits (title 300, stored summary 2 000, hand-in summary 240, synced summary 320 and body 1 600,
// error summary 400) and cuts each at whole characters. A 🟢 (two UTF-16 units) on the boundary is kept whole or dropped whole;
// nothing saved or read back carries half of it (SQLite would store the lone half as U+FFFD).
const GREEN = "🟢";
const whole = (text: string, label: string) => {
  assert.ok(text.isWellFormed(), `${label} has no lone half of a character`);
  assert.ok(!text.includes("�"), `${label} was not stored with a replacement for half a character`);
};

test("BL-975 hand-in capture: a 🟢 across the title or summary limit is dropped whole, one inside is kept, a plain title is unchanged", async t => {
  const home = await mkdtemp(join(tmpdir(), "feed-whole-units-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  await initializeBoard(host, ref, { actor_id: "owner", idempotency_key: "init" });
  const permissions = [...new Set([...Object.values(feedContentActions).flatMap(definition => definition.action.permissions), ...FEED_ACTION_PERMISSIONS])];
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions };
  const person = bindActionClient(host.actionClient(ref), () => caller);
  const stored = (id: string) => host.withProject(ref, runtime => createLocalFeedApplication(runtime.store.db).getFeedItem("a", id));

  const across = await person.invoke(feedContentActions.receive, { request_id: "bl975-across", title: `${"a".repeat(299)}${GREEN}z`, body: `${"b".repeat(239)}${GREEN}tail` });
  const acrossItem = await stored(across.subject.id);
  assert.equal(acrossItem.title, "a".repeat(299), "the 🟢 that would end at unit 301 is dropped whole");
  assert.equal(across.title, acrossItem.title, "the action answers with the title it saved");
  assert.equal(acrossItem.summary, "b".repeat(239), "the 🟢 that would end at unit 241 is dropped whole");
  whole(acrossItem.title, "title"); whole(acrossItem.summary, "summary");

  const inside = await person.invoke(feedContentActions.receive, { request_id: "bl975-inside", title: `${"a".repeat(298)}${GREEN}z`, body: `${"b".repeat(238)}${GREEN}tail` });
  const insideItem = await stored(inside.subject.id);
  assert.equal(insideItem.title, `${"a".repeat(298)}${GREEN}`, "a 🟢 that ends on unit 300 is kept whole");
  assert.equal(insideItem.summary, `${"b".repeat(238)}${GREEN}`, "a 🟢 that ends on unit 240 is kept whole");

  const plain = await person.invoke(feedContentActions.receive, { request_id: "bl975-plain", title: "  普通标题  ", body: "一条  普通的\n消息" });
  const plainItem = await stored(plain.subject.id);
  assert.equal(plainItem.title, "普通标题");
  assert.equal(plainItem.summary, "一条 普通的 消息");
  assert.equal(plainItem.body, "一条  普通的\n消息", "the body is kept as given");
});

test("BL-975 source sync: title, summary and body previews keep whole characters at 300, 320 and 1 600 units after save and read", async () => {
  const directory = mkdtempSync(join(tmpdir(), "feed-whole-units-sync-"));
  try {
    const databasePath = join(directory, "molis-work.sqlite");
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const material = (request: SourcePullRequest, n: number, title: string, preview: string): SourcePullMaterial => ({
        id: `material:bl975-${n}`, candidate_id: `candidate:bl975-${n}`, canonical_url: `https://example.com/bl975-${n}`,
        title, source_name: "Example", preview, content_ref: `molis-work-feed/sha256/${String(n).repeat(64)}`,
        content_hash: `sha256:${String(n).repeat(64)}`, content_type: "text/plain", character_count: preview.length,
        captured_at: `2026-11-21T08:0${n}:00.000Z`, content_available: true,
        provenance: { operationId: request.operation_id, providerId: "rss", providerVersion: "1.0.0", bindingRevision: 1,
          retrievedAt: "2026-11-21T08:00:00.000Z", matchedLaneIds: ["intent:exact"], rankProfile: "feed-v1", transportProfileFingerprint: `sha256:${"b".repeat(64)}` },
      });
      const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, db => {
        const client = createTestSourcePull({ db });
        return { ...client, pull: (request, options) => completedSourcePull(client, request, options, [
          material(request, 1, `${"t".repeat(299)}${GREEN}`, `${"p".repeat(319)}${GREEN}${"q".repeat(1_278)}${GREEN}`),
          material(request, 2, `${"t".repeat(298)}${GREEN}x`, `${"p".repeat(318)}${GREEN}${"q".repeat(1_278)}${GREEN}x`),
          material(request, 3, "普通标题", "普通 的\n预览"),
        ]) } satisfies typeof client;
      });
      const source = service.register({ kind: "rss", definition_id: listTestFeedSourceCatalog()[0]!.id }).source;
      assert.equal((await service.sync(source.source_id, { idempotencyKey: "bl975-sync-0001" })).created, 3);
      const items = createLocalFeedApplication(store.db).snapshot(DEMO_PROJECT_ID).feed_items;
      const read = (url: string) => createLocalFeedApplication(store.db).getFeedItem(DEMO_PROJECT_ID, items.find(item => item.url === url)!.item_id);

      const across = read("https://example.com/bl975-1");
      assert.equal(across.title, "t".repeat(299));
      assert.equal(across.summary, "p".repeat(319));
      assert.equal(across.body, `${"p".repeat(319)}${GREEN}${"q".repeat(1_278)}`, "the 🟢 ending at unit 1 601 is dropped whole");
      for (const [label, text] of [["title", across.title], ["summary", across.summary], ["body", across.body ?? ""]] as const) whole(text, label);

      const inside = read("https://example.com/bl975-2");
      assert.equal(inside.title, `${"t".repeat(298)}${GREEN}`);
      assert.equal(inside.summary, `${"p".repeat(318)}${GREEN}`);
      assert.equal(inside.body, `${"p".repeat(318)}${GREEN}${"q".repeat(1_278)}${GREEN}`);

      const plain = read("https://example.com/bl975-3");
      assert.equal(plain.title, "普通标题");
      assert.equal(plain.summary, "普通 的 预览");
      assert.equal(plain.body, "普通 的\n预览");
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("BL-975 error summary: a thrown message keeps whole characters at 400 units; a short message is unchanged", () => {
  const across = toFeedPublicError({ code: "feed.source_needs_auth", message: `${"m".repeat(399)}${GREEN}rest` }).safe_message;
  assert.equal(across, "m".repeat(399));
  whole(across, "error summary");
  assert.equal(toFeedPublicError({ code: "feed.source_needs_auth", message: `${"m".repeat(398)}${GREEN}rest` }).safe_message, `${"m".repeat(398)}${GREEN}`);
  assert.equal(toFeedPublicError({ code: "feed.source_needs_auth", message: "请重新连接账号" }).safe_message, "请重新连接账号");
});
