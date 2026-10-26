import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionError, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_NOTIFICATION_DELIVERY_ACTOR, type PluginNotificationDelivery } from "@molis-ai/molis-work-contracts/platform/plugin";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createLocalFeedApplication, createNotificationDelivery, declaredNotificationReceivers } from "@molis-ai/molis-work-app-local-host";
import { feedManifest, feedNotificationActions } from "@molis-ai/molis-work-plugin-feed";
import { PLUGIN_NOTIFICATIONS_SCHEMA_SQL, PluginNotificationQueue, pluginNotificationId } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { SCHEDULE_PLUGIN_ID, scheduleManifest, scheduledOperationActions } from "@molis-ai/molis-work-plugin-schedule";
import { scheduleRuntimeFixture } from "./fixtures/schedule-runtime.js";

/**
 * D6-2 (FI-6 step 4a): a plugin's notification is the platform's queue row; the platform hands it to the receiver a Manifest declares in
 * `notifications.receive`, and keeps it queued while none can take it. Acceptance RAC-1010 to RAC-1013.
 */
const row = (key: string) => ({ project_id: "p", sender_plugin_id: "io.molis.work.example.sender", sender_install_id: "install-1", sender_generation: "g1", key,
  title: "Title " + key, summary: "Summary", body: "Body " + key, open_plugin_id: "io.molis.work.example.sender", created_at: "2026-10-26T00:00:00.000Z" });
const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

test("RAC-1010: a Manifest's notifications.receive names one of its own workflow-only commands, and nothing else", () => {
  const parse = (notifications: unknown) => { try { parsePluginManifest({ ...structuredClone(feedManifest), notifications }); return null; } catch (error) { return (error as ActionError).message; } };
  assert.equal(parse(feedManifest.notifications), null);
  assert.match(parse({ receive: { capability_id: "feed.nothing", version: 1 } })!, /没有在 actions 里声明/);
  assert.match(parse({ receive: { capability_id: "feed.items.admission", version: 1 } })!, /必须是 command/);
  assert.match(parse({ receive: { capability_id: "feed.items.admit", version: 1 } })!, /受众只能是 workflow/);
  assert.match(parse({ receive: { ...feedManifest.notifications!.receive, extra: true } })!, /不认这些字段/);
  assert.match(parse({ receive: feedManifest.notifications!.receive, other: 1 })!, /不认这些字段/);
  assert.match(parse("feed.notifications.receive")!, /必须为对象/);
  assert.deepEqual(declaredNotificationReceivers([feedManifest]).map(item => [item.plugin_id, item.reference.capability_id, item.permissions]),
    [[feedManifest.plugin_id, "feed.notifications.receive", feedNotificationActions.receive.action.permissions]]);
});

test("RAC-1011: the queue keeps a notification until a receiver takes it, once, and drops its body after", async () => {
  const database = new DatabaseSync(":memory:"), queue = new PluginNotificationQueue(database);
  try {
    database.exec(PLUGIN_NOTIFICATIONS_SCHEMA_SQL);
    const received: string[] = [];
    let mode: "unavailable" | "broken" | "ok" = "unavailable";
    const client: ActionClient = { discover: () => [], invoke: async (call, _reference, input) => {
      const delivery = input as PluginNotificationDelivery;
      assert.equal(call.actor_id, PLUGIN_NOTIFICATION_DELIVERY_ACTOR); assert.equal(call.audience, "workflow"); assert.equal(call.project_id, "p");
      assert.deepEqual(call.permissions, ["feed:write"]);
      if (mode === "unavailable") throw new ActionError("actions.plugin_disabled", "此项目未启用该插件");
      if (mode === "broken") throw new ActionError("feed.rule_store_down", "down");
      received.push(delivery.key); return { item_id: "item-" + delivery.key, created: true };
    } };
    const receiver = { plugin_id: "io.molis.work.example.receiver", reference: { capability_id: "receiver.take", version: 1 }, permissions: ["feed:write"] };
    const delivery = createNotificationDelivery({ project_id: "p", queue, client, receivers: () => [receiver], senderName: () => "Sender" });
    const first = queue.enqueue(row("one")), again = queue.enqueue(row("one"));
    assert.equal(first.created, true); assert.equal(again.created, false); assert.equal(first.notification_id, pluginNotificationId("install-1", "g1", "one"));
    assert.equal(queue.enqueue({ ...row("one"), sender_generation: "g2" }).created, true, "another generation of the installation is another sender");
    const rows = () => database.prepare("SELECT notification_id, delivered_at, item_id, attempts, last_error_code, body FROM plugin_notifications ORDER BY created_at, sender_generation").all().map(asRecord);

    await delivery.flush();
    assert.deepEqual(rows().map(item => [item.delivered_at, item.attempts, item.last_error_code]), [[null, 0, null], [null, 0, null]], "no receiver now is waiting, not failing");
    mode = "broken"; await delivery.flush();
    assert.deepEqual(rows().map(item => [item.delivered_at, item.attempts, item.last_error_code]), [[null, 1, "feed.rule_store_down"], [null, 1, "feed.rule_store_down"]]);
    mode = "ok"; await Promise.all([delivery.flush(), delivery.flush()]);
    assert.deepEqual(received, ["one", "one"], "each notification is offered once, even by two flushes at once");
    assert.deepEqual(rows().map(item => [item.item_id, item.body, item.last_error_code]), [["item-one", "", null], ["item-one", "", null]]);
    await delivery.flush(); assert.equal(received.length, 2, "a delivered notification is not offered again");
    assert.equal(queue.enqueue(row("one")).created, false, "its key stays used");
  } finally { database.close(); }
});

test("RAC-1012: a notification waits without a Feed in the project, and reaches Feed when it is there", async t => {
  const f = await scheduleRuntimeFixture(t, []), store = await f.store(), at = new Date(Date.now() + 1000).toISOString();
  await f.sdk.invoke(scheduledOperationActions.add, { at, operation: "summarize", input: { text: "今天的汇总" }, inbox: true });
  f.execute(async () => ({ text: "今天的汇总" }));
  await f.tick(at);
  const queued = () => new PluginNotificationQueue(store.db).pending(f.project.project_id);
  assert.equal(queued().length, 1, "the notification is the platform's, queued");
  assert.equal(queued()[0]!.sender_plugin_id, SCHEDULE_PLUGIN_ID);
  assert.deepEqual(await f.inbox(), [], "nothing is written into a Feed the project does not have");

  await withMolisWorkProjectCatalog({ homeDirectory: f.home }, catalog => { catalog.addProjectPlugin({ project_id: f.project.project_id, plugin_id: "feed", actor_id: "test" }); });
  await f.reopen();
  const reopened = await f.store();
  for (let attempt = 0; attempt < 100 && new PluginNotificationQueue(reopened.db).pending(f.project.project_id).length; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(new PluginNotificationQueue(reopened.db).pending(f.project.project_id), [], "opening the project offers what waited");
  const snapshot = createLocalFeedApplication(reopened.db).snapshot(f.project.project_id), [item] = snapshot.feed_items.filter(value => value.source_id === "plugin-notifications:" + SCHEDULE_PLUGIN_ID);
  assert.ok(item); assert.match(item.url ?? "", new RegExp(`^/projects/${f.project.project_id}/plugins/`));
  assert.equal(snapshot.sources.find(value => value.source_id === item.source_id)?.name, scheduleManifest.name, "shown under the sender's name");
  assert.ok(snapshot.inbox_entries.some(entry => entry.subject_id === item.item_id));
});

test("RAC-1013: only the platform's notification service can call a receiver", async t => {
  const f = await scheduleRuntimeFixture(t), store = await f.store();
  const delivery: PluginNotificationDelivery = { notification_id: "n", sender_plugin_id: f.id, sender_name: "Forger", sender_install_id: "i", sender_generation: "g", key: "k",
    title: "Forged", summary: "", body: "Not from the platform", open_plugin_id: f.id, created_at: new Date().toISOString() };
  const permissions = [...feedNotificationActions.receive.action.permissions];
  const reference = { capability_id: feedNotificationActions.receive.capability_id, version: feedNotificationActions.receive.version };
  for (const call of [
    { actor_id: "workflow-events", audience: "workflow" as const }, { actor_id: "web-user", audience: "workflow" as const },
    { actor_id: PLUGIN_NOTIFICATION_DELIVERY_ACTOR, audience: "user" as const }, { actor_id: PLUGIN_NOTIFICATION_DELIVERY_ACTOR, audience: "agent" as const },
  ]) {
    await assert.rejects(f.client.invoke({ ...call, project_id: f.project.project_id, permissions }, reference, delivery), (error: unknown) => error instanceof ActionError && error.code.startsWith("actions."));
  }
  assert.deepEqual(createLocalFeedApplication(store.db).snapshot(f.project.project_id).feed_items.filter(item => item.title === "Forged"), []);
});
