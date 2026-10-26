import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalProjectDatabase, createLocalFeedApplication, createLocalFeedSourceService, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { FeedPluginRouteTable, createFeedRouteHandlers, feedItemActions, type FeedRouteHandlerPorts } from "@molis-ai/molis-work-plugin-feed";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { inboxActions } from "@molis-ai/molis-work-plugin-inbox";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/dist/content-action-providers.js";
import { HOME_ACTION_PERMISSIONS } from "../apps/local-host/dist/home-actions.js";
import { homeOfferActions, type HomeActionOffers } from "../apps/local-host/dist/home-offer-actions.js";

const PROJECT = "project-feed-items";

test("Feed item commands are directory actions: Home prepares and runs them, stale revisions are refused, and the old route forwards", { timeout: 120_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "feed-item-actions-"));
  const dbPath = join(home, "project.db");
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  seedDemoBoard(dbPath, PROJECT);
  const seed = new LocalProjectDatabase(dbPath);
  const source = createLocalFeedSourceService(seed.db, PROJECT).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
  const feedApp = createLocalFeedApplication(seed.db);
  const ingest = (externalId: string, title: string) => feedApp.ingestItem({ source, externalId, title, summary: title, body: title + " 的正文", occurredAt: new Date().toISOString(), attention: false }).item;
  const first = ingest("one", "客户反馈导出失败"), second = ingest("two", "周报已生成"), third = ingest("three", "需要跟进的合同");
  seed.close();
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, projectId: PROJECT });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: PROJECT, audience: "user", permissions: [...HOME_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS, "context-ledger:write"] };
  const client = host.actionClient(reference);
  const actions = bindActionClient(client, () => caller);
  const prepare = async (itemId: string, context = caller) => await client.invoke(context, homeOfferActions.offers, { subject: { kind: "feed_item", id: itemId }, request_id: "req-" + itemId }) as HomeActionOffers;
  const run = (itemId: string, offer: HomeActionOffers["offers"][number]) => {
    const { availability: _availability, ...selected } = offer;
    return actions.invoke(homeOfferActions.execute, { subject: { kind: "feed_item", id: itemId }, request_id: "req-" + itemId, offer: selected });
  };
  try {
    // Goals confirms the promoted input through the ledger; a caller missing that permission cannot start a partial promotion.
    const withoutLedger = { ...caller, permissions: caller.permissions.filter(permission => permission !== "context-ledger:write") };
    assert.ok(!(await prepare(third.item_id, withoutLedger)).offers.some(offer => offer.title === "升格为 Goal"));
    const promotion = (await client.discover(withoutLedger)).find(view => view.capability_id === feedItemActions.promote.capability_id)!;
    assert.equal(promotion.availability.available, false);
    assert.equal(promotion.availability.code, "actions.forbidden");
    const promotionState = () => host.withProject(reference, runtime => ({
      goals: runtime.store.db.prepare("SELECT count(*) AS n FROM goals").get(),
      events: runtime.store.db.prepare("SELECT count(*) AS n FROM events WHERE object_type LIKE 'io.molis.work.goals:%'").get(),
      receipts: runtime.store.db.prepare("SELECT count(*) AS n FROM idempotency_records WHERE operation LIKE 'io.molis.work.goals:%'").get(),
      item: createLocalFeedApplication(runtime.store.db).getFeedItem(PROJECT, third.item_id),
    }));
    const beforeRefusal = await promotionState();
    await assert.rejects(client.invoke(withoutLedger, feedItemActions.promote, { item_id: third.item_id, expected_revision: third.revision }), { code: "actions.forbidden" });
    assert.deepEqual(await promotionState(), beforeRefusal);

    // The offers come from Feed's own declaration, named for what they do, each with the exact revision it read.
    const offered = await prepare(first.item_id);
    assert.deepEqual(offered.offers.map(offer => offer.title), ["加入 Inbox", "保存为资料", "升格为 Goal", "忽略"]);
    assert.ok(offered.offers.every(offer => offer.availability.available && offer.recommendation_key), JSON.stringify(offered));
    assert.ok(offered.offers.every(offer => (offer.input as { expected_revision: number }).expected_revision === first.revision));

    const saved = await run(first.item_id, offered.offers.find(offer => offer.title === "保存为资料")!) as { title: string; result: { item: { disposition: string } } };
    assert.equal(saved.title, "保存为资料");
    assert.equal(saved.result.item.disposition, "saved");
    const after = await prepare(first.item_id);
    assert.deepEqual(after.offers.map(offer => offer.title), ["加入 Inbox", "升格为 Goal", "忽略"]);

    // An offer prepared before the change is not replayed against the newer item.
    await assert.rejects(run(first.item_id, offered.offers.find(offer => offer.title === "忽略")!), { code: "actions.offer_changed" });
    await assert.rejects(actions.invoke(feedItemActions.disposition, { item_id: first.item_id, disposition: "archived", expected_revision: first.revision }), { code: "feed.revision_conflict" });

    await run(first.item_id, after.offers.find(offer => offer.title === "加入 Inbox")!);
    const { entries } = await actions.invoke(inboxActions.list, {});
    assert.ok(entries.some(entry => entry.subject_type === "feed_item" && entry.subject_id === first.item_id && entry.status === "open"));
    assert.ok(!(await prepare(first.item_id)).offers.some(offer => offer.title === "加入 Inbox"));

    const promoted = await run(second.item_id, (await prepare(second.item_id)).offers.find(offer => offer.title === "升格为 Goal")!) as { result: { goal_id: string; created: boolean; item: { linked_goal_id: string | null } } };
    assert.equal(promoted.result.created, true);
    assert.equal(promoted.result.item.linked_goal_id, promoted.result.goal_id);
    assert.ok(!(await prepare(second.item_id)).offers.some(offer => offer.title === "升格为 Goal"));

    // Without Feed write permission the same offers are listed but cannot run.
    const reader = { ...caller, permissions: caller.permissions.filter(permission => permission !== "feed:write") };
    assert.ok((await prepare(third.item_id, reader)).offers.every(offer => !offer.availability.available));

    // The Workbench route translates its URL into the same action and keeps its answers.
    let changes = 0;
    const table = new FeedPluginRouteTable(createFeedRouteHandlers({ actions, projectId: PROJECT, routePrefix: "/projects/p", changed: () => { changes++; } } as unknown as FeedRouteHandlerPorts));
    const archived = await table.handle({ method: "POST", pathname: `/api/feed/items/${third.item_id}/archive`, query: new URLSearchParams(), body: { expected_revision: third.revision } });
    assert.equal(archived?.status, 200);
    assert.equal((archived?.body as { item: { disposition: string } }).item.disposition, "archived");
    assert.equal(changes, 1);
    assert.deepEqual((await prepare(third.item_id)).offers.map(offer => offer.title), ["恢复到 Feed"]);
    const stale = await table.handle({ method: "POST", pathname: `/api/feed/items/${third.item_id}/save`, query: new URLSearchParams(), body: { expected_revision: third.revision } }).catch(actionErrorResponse);
    assert.deepEqual([stale?.status, (stale?.body as { code: string }).code], [409, "feed.revision_conflict"]);
    const missing = await table.handle({ method: "POST", pathname: `/api/feed/items/nope/save`, query: new URLSearchParams(), body: { expected_revision: 1 } }).catch(actionErrorResponse);
    assert.deepEqual([missing?.status, (missing?.body as { code: string }).code], [404, "feed.item_not_found"]);
    const goal = await table.handle({ method: "POST", pathname: `/api/feed/items/${first.item_id}/promote`, query: new URLSearchParams(),
      body: { expected_revision: (await prepare(first.item_id)).offers.map(offer => offer.input as { expected_revision: number })[0]!.expected_revision } });
    const body = goal?.body as { goal_id: string; goal_path: string; created: boolean };
    assert.equal(body.goal_path, `/projects/p/goals/${encodeURIComponent(body.goal_id)}`);
    assert.equal(body.created, true);
  } finally {
    await host.close();
    rmSync(home, { recursive: true, force: true });
  }
});
