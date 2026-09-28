import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { feedQueryActions, feedItemActions } from "@molis-ai/molis-work-plugin-feed";
import { inboxActions } from "@molis-ai/molis-work-plugin-inbox";
import { scheduleActions } from "@molis-ai/molis-work-plugin-schedule";
import { MolisWorkLocalHost, molisWorkHostProjectReference, createLocalFeedApplication, createLocalFeedSourceService, seedDemoBoard, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { cachedMolisWorkWebView } from "../apps/local-host/src/web-view.js";
import { informationActions } from "../apps/local-host/src/information-actions.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

test("Feed reads and warm Web projections use each owner's current authority, retain exact content, and recover without altering original records", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "plugin-query-consumers-")), databasePath = join(home, "project.sqlite");
  seedDemoBoard(databasePath);
  const disabled = new Set<string>();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    actionAvailability: (_, action) => disabled.has(action.provider.provider_id) ? { available: false, code: "actions.plugin_disabled", reason: "测试中停用" } : { available: true } });
  const reference = molisWorkHostProjectReference({ databasePath, boardId: DEMO_BOARD_ID });
  const caller: ActionCallContext = { actor_id: "reader", audience: "user", project_id: reference.project_id,
    permissions: ["goals:read", "feed:read", "inbox:read", "schedule:read", "schedule:write", "feed:write", "goals:write"] };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  const server = createMolisWorkWebServer({ databasePath, boardId: DEMO_BOARD_ID, homeDirectory: home, localHost: host });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const runtime = await host.withProject(reference, r => r);
    const feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, DEMO_BOARD_ID).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "query-fixture" }).source;
    const item = feed.ingestItem({ source, externalId: "one", title: "独立材料", summary: "目录摘要", body: "正文只在获得读取权限后提供", occurredAt: new Date().toISOString(), attention: false }).item;
    feed.ensureInboxEntryForFeedItem(DEMO_BOARD_ID, item.item_id, "manual");
    await actions.invoke(scheduleActions.createTask, { title: "原任务", instructions: "查阅原材料", time: "10:00" });
    const cache = new Map(), options = { databasePath, boardId: DEMO_BOARD_ID, homeDirectory: home };
    const view = () => cachedMolisWorkWebView(cache, runtime.store, options, actions);
    const first = await view();
    assert.equal(first.feed.feed_items.find(row => row.item_id === item.item_id)?.body, null);
    assert.equal(first.feed.inbox_entries.length, 1); assert.equal(first.schedule_tasks?.length, 1);
    const read = await actions.invoke(feedQueryActions.item, { item_id: item.item_id });
    assert.deepEqual(read.item, feed.getFeedItem(DEMO_BOARD_ID, item.item_id));
    assert.equal("inbox_entries" in await actions.invoke(feedQueryActions.snapshot, {}), false, "Feed cannot grant Inbox access");
    await assert.rejects(host.actionClient(reference).invoke({ ...caller, permissions: [] }, feedQueryActions.item, { item_id: item.item_id }), { code: "actions.forbidden" });
    await assert.rejects(host.actionClient(reference).invoke({ ...caller, project_id: "foreign" }, feedQueryActions.item, { item_id: item.item_id }), { code: "actions.scope_mismatch" });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/api/feed`)).status, 200);
    assert.match(await (await fetch(`${base}/api/feed/items/${item.item_id}/detail`)).text(), /正文只在获得读取权限后提供/);
    disabled.add("io.molis.work.feed"); disabled.add("io.molis.work.schedule");
    const revoked = await view();
    assert.strictEqual(revoked.goals, first.goals, "the authorized Goals cache is still warm");
    assert.equal(revoked.feed.feed_items.length, 0); assert.equal(revoked.feed.sources.length, 0);
    assert.equal(revoked.feed_connector_auth, undefined); assert.equal(revoked.schedule_tasks?.length, 0);
    assert.equal(revoked.feed.inbox_entries.length, 1, "Inbox retains its own authority");
    for (const route of ["/api/feed", `/api/feed/items/${item.item_id}/detail`]) {
      const response = await fetch(base + route); assert.equal(response.status, 403);
      assert.equal((await response.json() as { code: string }).code, "actions.plugin_disabled");
    }
    disabled.add("io.molis.work.inbox"); assert.equal((await view()).feed.inbox_entries.length, 0);
    disabled.clear();
    const recovered = await view();
    assert.strictEqual(recovered.goals, first.goals);
    assert.equal(recovered.feed.feed_items.length, 1);
    feed.ingestItem({ source, externalId: "two", title: "没有 Goals 事件的新材料", summary: "摘要", occurredAt: new Date().toISOString(), attention: false });
    const restored = await view();
    assert.ok(restored.snapshot.cursor >= first.snapshot.cursor);
    assert.equal(restored.feed.feed_items.length, 2); assert.equal(restored.feed.inbox_entries.length, 1);
    assert.equal(restored.schedule_tasks?.length, 1);
    assert.equal((await fetch(`${base}/api/feed`)).status, 200);
    const promoted = await actions.invoke(feedItemActions.promote, { item_id: item.item_id, expected_revision: item.revision });
    const context = await actions.invoke(feedQueryActions.linkedContext, { goal_id: promoted.goal_id, item_id: item.item_id });
    assert.match(context!.source_context, /正文只在获得读取权限后提供/);
    assert.equal(await actions.invoke(feedQueryActions.linkedContext, { goal_id: promoted.goal_id, item_id: "not-linked" }), null);
    disabled.add("io.molis.work.goals");
    await assert.rejects(actions.invoke(feedQueryActions.linkedContext, { goal_id: promoted.goal_id }), { code: "actions.plugin_disabled" });
    disabled.clear();
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); await rm(home, { recursive: true, force: true });
  }
});

for (const phase of ["dispatch", "response"] as const) {
  test(`information proposals retain dependency authority during model ${phase} waits`, { timeout: 30_000 }, async () => {
    const home = await mkdtemp(join(tmpdir(), "information-authority-")), databasePath = join(home, "project.sqlite");
    seedDemoBoard(databasePath);
    let disabled = false, dispatched = 0, pause = true;
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    const host = new MolisWorkLocalHost({ homeDirectory: home,
      completeText: async (_prompt, options) => {
        if (phase === "dispatch" && pause) { entered.resolve(); await release.promise; }
        await options?.beforeDispatch?.(); dispatched++;
        if (phase === "response" && pause) { entered.resolve(); await release.promise; }
        return JSON.stringify({ message: "先补充可用材料", action: null });
      },
      actionAvailability: (_, view) => disabled && view.capability_id === inboxActions.list.capability_id
        ? { available: false, code: "actions.plugin_disabled", reason: "Inbox 已停用" } : { available: true },
    });
    const reference = molisWorkHostProjectReference({ databasePath, boardId: DEMO_BOARD_ID, projectId: "canonical-information-project" });
    const caller: ActionCallContext = { actor_id: "planner", audience: "user", project_id: reference.project_id, permissions: ["feed:read", "inbox:read", "model:invoke"] };
    const actions = bindActionClient(host.actionClient(reference), () => caller);
    try {
      const pending = actions.invoke(informationActions.plan, { prompt: "整理一下当前材料" });
      const refused = assert.rejects(pending, { code: "actions.plugin_disabled" });
      await Promise.race([entered.promise, pending.then(() => { throw new Error("missed model wait"); })]);
      disabled = true; release.resolve(); await refused;
      assert.equal(dispatched, phase === "dispatch" ? 0 : 1);
      await assert.rejects(actions.invoke(informationActions.plan, { prompt: "整理" }), { code: "actions.plugin_disabled" });
      disabled = false; pause = false;
      const result = await actions.invoke(informationActions.plan, { prompt: "整理" });
      assert.equal(result.action, null); assert.equal(result.context.project_id, reference.project_id);
      assert.equal(dispatched, phase === "dispatch" ? 1 : 2);
      const runtime = await host.withProject(reference, r => r);
      assert.equal(createLocalFeedApplication(runtime.store.db).snapshot(DEMO_BOARD_ID).feed_items.length, 0);
    } finally { release.resolve(); await host.close(); await rm(home, { recursive: true, force: true }); }
  });
}
