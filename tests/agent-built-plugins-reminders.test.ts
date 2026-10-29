import assert from "node:assert/strict";
import test from "node:test";
import { scheduleServiceFor } from "@molis-ai/molis-work-app-local-host";
import { getScheduleReminder, reminderActions, scheduleActions, SCHEDULE_ACTION_PERMISSIONS, scheduledOperationActions, getScheduledOperation } from "@molis-ai/molis-work-plugin-schedule";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { runningProjectPlatform } from "../apps/local-host/dist/project-plugins.js";
import { PluginNotificationQueue } from "@molis-ai/molis-work-plugin-runtime";
import { FEED_PLUGIN_ID } from "@molis-ai/molis-work-plugin-feed";
import { scheduleRuntimeFixture } from "./fixtures/schedule-runtime.js";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";

const next = () => new Date(Date.now() + 1000).toISOString();

test("a plugin reminder reaches the Inbox under its plugin's name; uninstall removes the remaining reminders and operations", { timeout: 60_000 }, async t => {
  const f = await scheduleRuntimeFixture(t), at = next();
  const first = await f.sdk.invoke(reminderActions.add, { at, text: "复习第一章" });
  const retained = await f.sdk.invoke(reminderActions.add, { at: new Date(Date.now() + 86400000).toISOString(), text: "明天复习", repeat: "daily" });
  const operation = await f.sdk.invoke(scheduledOperationActions.add, { at: new Date(Date.now() + 86400000).toISOString(), operation: "summarize", input: { text: "later" } });
  await f.tick(at);
  const items = await f.inbox(); assert.equal(items.length, 1); assert.equal(items[0]!.title, "定时笔记：复习第一章");
  const store = await f.store();
  assert.ok(createLocalFeedApplication(store.db).snapshot(f.project.project_id).inbox_entries.some(row => row.subject_id === items[0]!.item_id && row.status === "open"));
  assert.deepEqual(await f.sdk.invoke(reminderActions.cancel, first), { cancelled: false });
  const platform = await runningProjectPlatform(store, f.project.project_id); assert.ok(platform);
  await platform.runtime.uninstall((await f.record()).install_id, { retain_private_data: true });
  await f.tick(new Date(Date.now() + 2 * 86400000).toISOString());
  assert.equal(f.calls(), 0); assert.equal((await f.inbox()).length, 1, "removed creators cannot deliver while cleanup is pending");
  // The normal kept reconciliation job owns cleanup while the uninstall record is current.
  const end = Date.now() + 7000;
  while (getScheduleReminder((await f.store()).db, retained.reminderId) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50));
  const reopened = await f.store();
  assert.equal(getScheduleReminder(reopened.db, retained.reminderId), null);
  assert.equal(getScheduledOperation(reopened.db, f.project.project_id, operation.scheduleId), null);
  assert.equal((await f.inbox()).length, 1); assert.equal(f.calls(), 0);
  await f.reopen(); assert.equal(getScheduleReminder((await f.store()).db, retained.reminderId), null);
});

test("Host reminders need no Studio page, survive restart once, and stay isolated from another Home", { timeout: 60_000 }, async t => {
  const f = await scheduleRuntimeFixture(t), other = await scheduleRuntimeFixture(t), at = next();
  const reminder = await f.sdk.invoke(reminderActions.add, { at, text: "只在原 Home" });
  assert.deepEqual(await other.sdk.invoke(reminderActions.cancel, reminder), { cancelled: false });
  await f.reopen(); await f.tick(at); await f.tick(at); await other.tick(at);
  assert.deepEqual((await f.inbox()).map(item => item.summary), ["只在原 Home"]); assert.equal((await other.inbox()).length, 0);
  assert.equal(getScheduleReminder((await f.store()).db, reminder.reminderId), null);
});

test("rejected reminder registration/cancellation and a real notification persistence failure roll back the entire public transaction", { timeout: 60_000 }, async t => {
  const f = await scheduleRuntimeFixture(t), store = await f.store(), clock = scheduleServiceFor(store.db), at = next();
  // Feed keeps its own job on the platform's clock (FI-6), set a moment after the project opens; only Schedule's jobs are counted here.
  const scheduled = () => clock.list().filter(job => job.plugin_id !== FEED_PLUGIN_ID);
  // Project SQL refuses trigger bytecode before execution; this happens after the scheduler write, so it must still roll back that write.
  store.db.exec("CREATE TRIGGER refuse_reminder BEFORE INSERT ON schedule_plugin_reminders BEGIN SELECT RAISE(ABORT, 'disk-write-failed'); END");
  await assert.rejects(f.sdk.invoke(reminderActions.add, { at, text: "fail" }), { code: "plugin.project_database.statement_refused" });
  assert.equal(scheduled().length, 0); store.db.exec("DROP TRIGGER refuse_reminder");
  const reminder = await f.sdk.invoke(reminderActions.add, { at, text: "real reminder" }), record = getScheduleReminder(store.db, reminder.reminderId)!;
  store.db.exec("CREATE TRIGGER refuse_cancel BEFORE DELETE ON schedule_plugin_reminders BEGIN SELECT RAISE(ABORT, 'cancel-disk-failed'); END");
  await assert.rejects(f.sdk.invoke(reminderActions.cancel, reminder), { code: "plugin.project_database.statement_refused" });
  assert.ok(clock.get(record.jobId)); assert.ok(getScheduleReminder(store.db, reminder.reminderId)); store.db.exec("DROP TRIGGER refuse_cancel");
  // The notification is the platform's queue row now (D6-2): its write is the part of the delivery that shares the reminder's transaction.
  store.db.exec("CREATE TRIGGER refuse_delivery BEFORE INSERT ON plugin_notifications BEGIN SELECT RAISE(ABORT, 'delivery-disk-failed'); END");
  assert.equal((await f.tick(at)).failed, 1); assert.ok(getScheduleReminder(store.db, reminder.reminderId)); assert.equal((await f.inbox()).length, 0);
  assert.equal(new PluginNotificationQueue(store.db).pending(f.project.project_id).length, 0, "the refused queue row rolled back with the reminder");
  assert.equal(createLocalFeedApplication(store.db).snapshot(f.project.project_id).sources.filter(source => source.source_id.startsWith("plugin-notifications:")).length, 0);
  store.db.exec("DROP TRIGGER refuse_delivery");
  await f.client.invoke({ actor_id: "web-user", project_id: f.project.project_id, audience: "user", permissions: SCHEDULE_ACTION_PERMISSIONS }, scheduleActions.setJobEnabled, { job_id: record.jobId, enabled: true });
  assert.equal((await f.tick(at)).failed, 0); assert.equal((await f.inbox()).length, 1); assert.equal(getScheduleReminder(store.db, reminder.reminderId), null);
  await f.tick(at); assert.equal((await f.inbox()).length, 1);
});

test("a reused installation id cannot cancel or deliver a previous generation's reminder", { timeout: 60_000 }, async t => {
  const f = await scheduleRuntimeFixture(t), at = next(), original = await f.record(), store = await f.store();
  const old = await f.sdk.invoke(reminderActions.add, { at, text: "original owner" });
  // Simulate an interrupted reinstall retaining an old domain row; this is the production repository's current generation.
  new SqlitePluginRuntimeRepository(store.db).save({ ...original, installation_generation: "confirmed-reinstall" });
  assert.deepEqual(await f.sdk.invoke(reminderActions.cancel, old), { cancelled: false });
  assert.equal((await f.tick(at)).failed, 1); assert.equal((await f.inbox()).length, 0);
  assert.equal(getScheduleReminder(store.db, old.reminderId)?.installationGeneration, original.installation_generation);
  const fresh = await f.sdk.invoke(reminderActions.add, { at, text: "current owner" });
  assert.equal((await f.tick(at)).failed, 0); assert.deepEqual((await f.inbox()).map(item => item.summary), ["current owner"]);
  assert.equal(getScheduleReminder(store.db, fresh.reminderId), null);
});
test("RAC-1670 a reminder whose 「plugin name：text」 passes 200 UTF-16 units is delivered: the notification title is cut to 199 units and 「…」, the summary keeps the whole text, the one-shot job finishes", { timeout: 60_000 }, async t => {
  // reminders.add takes up to 200 UTF-16 units of text (plugins/native/schedule/src/reminders.ts:67), delivery titles the notification
  // 「plugin name：text」 (runtime-wakeups.ts), and the notification service refuses a title over 200 units
  // (apps/local-host/src/plugin-notification-service.ts:39-41). 「定时笔记：」 is 5 units: 195 fits as it is, 196 is cut.
  const f = await scheduleRuntimeFixture(t), store = await f.store(), clock = scheduleServiceFor(store.db), at = next();
  const fits = await f.sdk.invoke(reminderActions.add, { at, text: "提".repeat(195) });
  const over = await f.sdk.invoke(reminderActions.add, { at, text: "提".repeat(196) });
  const job = getScheduleReminder(store.db, over.reminderId)!.jobId;
  assert.equal((await f.tick(at)).failed, 0, "neither reminder fails");
  const titles = new Map((await f.inbox()).map(item => [item.summary, item.title]));
  assert.equal(titles.size, 2, "both reminders reach the Inbox");
  assert.equal(titles.get("提".repeat(195)), "定时笔记：" + "提".repeat(195), "a 200-unit title is not cut");
  assert.equal(titles.get("提".repeat(196)), "定时笔记：" + "提".repeat(194) + "…", "a 201-unit title is cut to 199 units and 「…」, the summary keeps the whole text");
  assert.deepEqual([getScheduleReminder(store.db, fits.reminderId), getScheduleReminder(store.db, over.reminderId)], [null, null], "both one-shot reminders are consumed");
  assert.deepEqual([clock.get(job)?.enabled, clock.get(job)?.last_wakeup?.status], [false, "ok"], "its one-shot job has fired once and finished");
  assert.equal(new PluginNotificationQueue(store.db).pending(f.project.project_id).length, 0, "nothing is left queued");
  await f.tick(new Date(Date.parse(at) + 60_000).toISOString());
  assert.equal((await f.inbox()).length, 2, "a later tick delivers nothing more");
});

test("RAC-1671 the title is cut at a whole character, never inside a surrogate pair, and a daily reminder with such a title is delivered and stays", { timeout: 60_000 }, async t => {
  // 「提」 and 99 😀 (U+1F600, two units each) is 199 units of text; with 「定时笔记：」 the title is 204 units. Whole characters within
  // 199 units are 「定时笔记：提」 and 96 😀 (198 units); a cut by units would end on half of the 97th 😀.
  const f = await scheduleRuntimeFixture(t), store = await f.store(), clock = scheduleServiceFor(store.db), at = next();
  const text = "提" + "😀".repeat(99);
  const daily = await f.sdk.invoke(reminderActions.add, { at, text, repeat: "daily" });
  const job = getScheduleReminder(store.db, daily.reminderId)!.jobId;
  assert.equal((await f.tick(at)).failed, 0, "the daily reminder does not fail");
  assert.deepEqual((await f.inbox()).map(item => [item.title, item.summary]), [["定时笔记：提" + "😀".repeat(96) + "…", text]], "the title is cut to whole characters, the summary keeps the whole text");
  assert.equal(getScheduleReminder(store.db, daily.reminderId)?.text, text, "a daily reminder stays after it is delivered");
  assert.deepEqual([clock.get(job)?.enabled, clock.get(job)?.last_wakeup?.status], [true, "ok"], "its daily job stays on");
});
