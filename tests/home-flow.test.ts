import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeDays, buildHomeWindow, civilKey, eventsOnDay, projectHomeEvents, summarizeDay } from "../apps/workbench/src/home-flow.ts";
import type { HomeEventView } from "@molis-ai/molis-work-contracts/platform/actions";
const now = new Date(2026, 8, 19, 13, 20);
const row = (overrides: Partial<HomeEventView> = {}): HomeEventView => ({
  id: "opaque-id", event_id: "owner-id", source: { capability_id: "unknown.events", version: 1, provider_id: "installed-plugin" },
  origin: { surface: "notes", title: "笔记", icon: "note" }, subject: { kind: "note", id: "n1" }, occurred_at: now.toISOString(), placement: "occurred", category: "personal",
  title: "用户自己的记录", summary: "摘要", content: "正文", facts: [], needs_attention: false, open: null, suggested_behavior_ids: [], ...overrides,
});
test("Home window covers seven civil days and uses an exclusive next-midnight boundary", () => {
  const days = buildHomeDays(now, "zh-CN");
  assert.deepEqual(days.map(day => day.id), ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"]);
  assert.equal(days[3]?.today, true);
  const window = buildHomeWindow(now);
  assert.equal(civilKey(new Date(window.from)), "2026-09-16");
  assert.equal(civilKey(new Date(window.to)), "2026-09-23");
  assert.equal(new Date(window.to).getHours(), 0);
  assert.equal(window.now, now.toISOString());
});
test("Home projects arbitrary providers without inferring their business semantics", () => {
  const old = new Date(2026, 7, 1).toISOString();
  const events = projectHomeEvents({ now, events: [row({ id: "ordinary-old", occurred_at: old }), row({ id: "active-old", occurred_at: old, placement: "active" }),
    row({ id: "today", occurred_at: old, placement: "today", category: "organization", needs_attention: true }), row({ id: "recent", suggested_behavior_ids: ["plugin.choice"] }),
    row({ id: "invalid", occurred_at: "invalid" })] });
  assert.deepEqual(new Set(events.map(event => event.id)), new Set(["active-old", "today", "recent"]));
  assert.equal(eventsOnDay(events, "2026-09-19").length, 3);
  assert.equal(events.find(event => event.id === "recent")?.plugin, "notes");
  assert.deepEqual(events.find(event => event.id === "recent")?.suggested_behavior_ids, ["plugin.choice"]);
  assert.equal(events.find(event => event.id === "today")?.kind, "org");
  assert.equal(events[0]?.text, "正文");
  const labels = { todayEmpty: "今天暂无事项", empty: "暂无事项", todaySum: "今天 {n} 件", daySum: "{n} 件", attentionLead: "有事项需要处理", emptyLead: "插件事项会出现在这里" };
  assert.deepEqual(summarizeDay(buildHomeDays(now)[3]!, events, labels), { sum: "今天 3 件", lead: "有事项需要处理", me: 2, org: 1 });
  assert.equal(summarizeDay(buildHomeDays(now)[3]!, [], labels).sum, "今天暂无事项");
});
