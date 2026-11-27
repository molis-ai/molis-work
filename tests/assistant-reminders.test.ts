import { noticeText } from "./fixtures/assistant-saved-text.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantNotice } from "@molis-ai/molis-work-contracts/services/assistant";
import { DatabaseSync } from "node:sqlite";
import { AssistantStore, AssistantService, onPartitionReminder, tellPartitionReminder, type PartitionReminder } from "@molis-ai/molis-work-app-local-host";
import { createDesktopWebCore } from "@molis-ai/molis-work-app-desktop";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { addProjectPlugin, LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";
import { imagesManifest } from "@molis-ai/molis-work-plugin-images";
import { installIdentity } from "@molis-ai/molis-work-plugin-runtime";

const reminder = (over: Partial<PartitionReminder>): PartitionReminder => ({ partition_id: "project-a", plugin_id: "io.molis.work.todo", install_id: "todo-install",
  entry_key: "task:t1", due_at: "2026-09-29T09:03:00Z", late: false, source_title: "待办", title: "给王总回电话", open: { surface: "todo", id: "t1" }, ...over });

// Batch 108: the Host no longer asks the plugins for reminders each minute. A reminder time in a partition's overview table (or an entry
// the plugin registered) falls due in the due registry, only that plugin in that partition is woken, and its reminder reaches the Assistant.
test("a reminder that fell due in a partition is told once, where to open it, under the person's rules; one reached late says so", async () => {
  const clock = new Date("2026-09-29T09:04:00Z");
  const store = new AssistantStore(new DatabaseSync(":memory:"), () => clock);
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => { throw new Error("no rounds here"); }, authority: async () => { throw new Error("no rounds here"); },
    timeZone: "Asia/Shanghai" }, "web-user", () => clock);
  assert.equal(service.followUps.tellReminder(reminder({})), true);
  let notices = service.notices.notices("pages");
  assert.deepEqual(notices.map(notice => [notice.kind, notice.work_id, noticeText(notice), notice.open]), [["reminder", "", "提醒（待办 · 17:03）：给王总回电话", { surface: "todo", id: "t1", title: "给王总回电话", project_id: "project-a" }]]);
  // Told once, however often the same occurrence is handed over (a wake retried after a failure, say).
  assert.equal(service.followUps.tellReminder(reminder({})), false);
  assert.equal(service.notices.notices("pages").length, 1);

  // The person's quiet rule holds it on that page unless reminders are an exception.
  service.followUps.saveRule({ kind: "quiet", surfaces: ["pages"], except: [], label: "写文档时不要提醒" });
  assert.equal(service.notices.notices("pages")[0]!.held?.reason, "写文档时不要提醒");
  assert.equal(service.notices.notices("goals")[0]!.held, undefined);
  service.followUps.saveRule({ kind: "quiet", surfaces: ["goals"], except: ["reminder"], label: "看目标时不要提醒，我设的提醒除外" });
  assert.equal(service.notices.notices("goals")[0]!.held, undefined);

  // Settling a reminder settles only it: it belongs to no work.
  assert.equal(service.notices.settleNotices({ work_id: "" }, "seen"), 0);
  assert.equal(service.notices.settleNotices({ notice_id: notices[0]!.notice_id }, "seen"), 1);

  // The same item at a new time is a new reminder; one reached while the Host was off says it was missed and opens in the personal space.
  assert.equal(service.followUps.tellReminder(reminder({ partition_id: "personal", entry_key: "task:t2", due_at: "2026-09-29T09:30:00Z", late: true, title: "交报销单", open: { surface: "todo", id: "t2" } })), true);
  notices = service.notices.notices("goals");
  assert.deepEqual(notices.map(notice => [noticeText(notice), notice.open?.project_id]), [["错过的提醒（待办 · 17:30）：交报销单", "personal"]]);

  // B2R-05 / UPP-32. The same saved interruption still has the original subject when the reader changes language.
  for (const late of [false, true]) {
    const entry = reminder({ plugin_id: imagesManifest.plugin_id, install_id: installIdentity(imagesManifest), entry_key: `job:${late}`, late,
      interrupted: true, source_title: imagesManifest.name, title: "🌃 海报", open: { surface: "images", id: "poster" } });
    assert.equal(service.followUps.tellReminder(entry), true);
    assert.equal(service.followUps.tellReminder(entry), false);
    const saved = service.notices.notices("goals").find(n => n.open?.id === "poster");
    assert.ok(saved);
    assert.deepEqual(saved.reminder_source, { plugin_id: entry.plugin_id, install_id: entry.install_id });
    assert.equal(saved.open?.title, "🌃 海报");
    assert.match(noticeText(saved, "zh"), late ? /错过.*任务已中断.*🌃 海报/u : /任务已中断.*🌃 海报/u);
    assert.match(noticeText(saved, "en"), late ? /Missed reminder.*task interrupted.*🌃 海报/u : /Task interrupted.*🌃 海报/u);
    assert.match(noticeText(saved, "ja"), late ? /未確認.*中断しました.*🌃 海报/u : /中断しました.*🌃 海报/u);
    assert.equal(service.notices.settleNotices({ notice_id: saved.notice_id }, "seen"), 1);
  }
});

test("a reminder reaches the Assistant of its own Home only, and is refused while nobody takes reminders so its due entry is tried again", async () => {
  const told: string[] = [];
  await assert.rejects(() => tellPartitionReminder("/nowhere/home-a", reminder({})), { code: "actions.plugin_unavailable" });
  const stop = onPartitionReminder("/nowhere/home-a", item => { told.push(item.entry_key); });
  try {
    await tellPartitionReminder("/nowhere/home-a", reminder({}));
    await assert.rejects(() => tellPartitionReminder("/nowhere/home-b", reminder({ entry_key: "task:other" })), { code: "actions.plugin_unavailable" });
    assert.deepEqual(told, ["task:t1"]);
  } finally { stop(); }
  await assert.rejects(() => tellPartitionReminder("/nowhere/home-a", reminder({})), { code: "actions.plugin_unavailable" }, "after stopping, nobody takes it");
  let attempts = 0;
  const retry = onPartitionReminder("/nowhere/home-a", async () => {
    await Promise.resolve();
    if (++attempts === 1) throw new Error("notice write interrupted");
  });
  try {
    await assert.rejects(tellPartitionReminder("/nowhere/home-a", reminder({})), /notice write interrupted/);
    await tellPartitionReminder("/nowhere/home-a", reminder({}));
    assert.equal(attempts, 2);
  } finally { retry(); }
});

// W2-18-S8-TODO-01: real Todo in the personal space → its overview row's reminder time → the due registry wakes that Todo → one Assistant notice.
test("W2-18-S8-TODO-01: a real Todo reminder automatically produces one Assistant notice", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "todo-assistant-timer-")), previous = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const token = "todo-reminder-test-token-012345678901234", server = createDesktopWebCore({ ptyClientFilePath: () => "unused" })({ homeDirectory: home, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object"); const origin = `http://127.0.0.1:${address.port}`;
  let requests = 0;
  const request = async (path: string, body?: object) => {
    const response = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin,
      "x-molis-work-control-token": token, "x-molis-work-idempotency-key": "todo-reminder-" + (++requests) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  const noticesOf = async () => (await request("/api/assistant/notices") as { notices: AssistantNotice[] }).notices.filter(notice => noticeText(notice).includes("Read the actual overdue draft"));
  try {
    await addProjectPlugin(new LocalHostHttpClient({ origin, controlToken: token }), PERSONAL_SPACE_PROJECT_ID, "todo");
    const created = await request(`/projects/${PERSONAL_SPACE_PROJECT_ID}/api/plugins/io.molis.work.todo/items`, { title: "Read the actual overdue draft",
      remind_at: new Date(Date.now() + 200).toISOString() }) as { item: { id: string } };
    const deadline = Date.now() + 15_000;
    let notices: AssistantNotice[] = [];
    // Nothing here asks for reminders: the due registry's own timer falls due and wakes Todo in this partition.
    while (!(notices = await noticesOf()).length) {
      assert.ok(Date.now() < deadline, "the due registry did not wake Todo for its reminder");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(notices.length, 1); assert.equal(notices[0]!.kind, "reminder");
    assert.match(JSON.stringify(notices[0]), new RegExp(created.item.id));
    assert.equal(notices[0]!.open?.project_id, PERSONAL_SPACE_PROJECT_ID, "the notice opens the todo where it is");
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.deepEqual((await noticesOf()).map(notice => notice.notice_id), [notices[0]!.notice_id], "a settled entry is not told again");
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous;
    resetSecretStoreCache(); await rm(home, { recursive: true, force: true });
  }
});
