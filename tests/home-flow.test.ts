import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHomeDays,
  buildHomeEvents,
  civilKey,
  eventsOnDay,
  sourceNeedsAuth,
  summarizeDay,
  type HomeFlowFeedItem,
  type HomeFlowInbox,
  type HomeFlowInput,
  type HomeFlowSession,
  type HomeFlowSource,
} from "../apps/workbench/src/home-flow.ts";

const NOW = new Date(2026, 8, 19, 13, 20);
const TODAY = "2026-09-19";
const LABELS = {
  todayEmpty: "今天还没有事件走进来",
  empty: "这一天没有事件",
  todaySum: "今天接到 {n} 件事",
  daySum: "这一天有 {n} 件事",
  authLead: "有来源需要重新授权。",
  emptyLead: "接到的 Inbox、Session 和需要授权的来源会出现在这里。",
};

function at(monthDay: number, hour: number, minute = 0): string {
  return new Date(2026, 8, monthDay, hour, minute).toISOString();
}

function inbox(partial: Partial<HomeFlowInbox> & Pick<HomeFlowInbox, "entry_id" | "subject_id">): HomeFlowInbox {
  return {
    subject_type: "feed_item",
    reason: "source_rule",
    status: "open",
    revision: 1,
    created_at: at(16, 14, 18),
    updated_at: at(16, 14, 18),
    ...partial,
  };
}

function item(partial: Partial<HomeFlowFeedItem> & Pick<HomeFlowFeedItem, "item_id" | "title">): HomeFlowFeedItem {
  return {
    summary: "摘要",
    body: "正文",
    source_id: "demo-github",
    source_kind: "github",
    source_label: "GitHub",
    imported_at: at(16, 14, 18),
    source_created_at: at(16, 14, 18),
    author: "octocat",
    url: "https://github.com/example",
    linked_goal_id: null,
    ...partial,
  };
}

function source(partial: Partial<HomeFlowSource> & Pick<HomeFlowSource, "source_id" | "name">): HomeFlowSource {
  return {
    kind: "github",
    status: "disconnected",
    last_sync_at: at(16, 14, 18),
    last_error_code: null,
    last_outcome: "completed",
    ...partial,
  };
}

function session(partial: Partial<HomeFlowSession> & Pick<HomeFlowSession, "session_id" | "title">): HomeFlowSession {
  return {
    status: "idle",
    created_at: at(19, 10, 5),
    updated_at: at(19, 10, 5),
    current_goal_id: "CORE",
    ...partial,
  };
}

function collect(partial: Partial<HomeFlowInput> = {}) {
  return buildHomeEvents({
    now: NOW,
    locale: "zh-CN",
    inbox: [],
    feedItems: [],
    sources: [],
    sessions: [],
    goals: [{ goal_id: "CORE", title: "生命周期" }],
    ...partial,
  });
}

test("week is seven civil days centered on today", () => {
  const days = buildHomeDays(NOW, "zh-CN");
  assert.deepEqual(days.map((day) => day.id), [
    "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22",
  ]);
  assert.equal(days[3]?.today, true);
  assert.equal(days[3]?.n, 19);
  assert.match(days[3]?.week || "", /星期六|Saturday|Sat/);
});

test("inbox feed item lands on arrival day and is not duplicated as a raw feed row", () => {
  const events = collect({
    inbox: [inbox({ entry_id: "att-1", subject_id: "pr-418" })],
    feedItems: [
      item({ item_id: "pr-418", title: "PR #418 请确认完成依据" }),
      item({ item_id: "ci-1", title: "CI 已通过", source_created_at: at(16, 11, 10), imported_at: at(16, 11, 10) }),
    ],
  });
  const day = eventsOnDay(events, "2026-09-16");
  assert.equal(day.filter((event) => event.title === "PR #418 请确认完成依据").length, 1);
  assert.equal(day.find((event) => event.title === "PR #418 请确认完成依据")?.plugin, "inbox");
  assert.equal(day.find((event) => event.title === "CI 已通过")?.plugin, "feed");
  assert.equal(day.find((event) => event.title.includes("PR"))?.kind, "org");
  assert.equal(day.find((event) => event.title.includes("PR"))?.open?.plugin, "feed");
  assert.equal(day.find((event) => event.title.includes("PR"))?.inbox?.entry_id, "att-1");
});

test("open inbox created last month is pinned to today, done inbox outside the week is dropped", () => {
  const events = collect({
    inbox: [
      inbox({
        entry_id: "old-open",
        subject_id: "old-item",
        created_at: new Date(2026, 7, 1, 9, 0).toISOString(),
        status: "open",
      }),
      inbox({
        entry_id: "old-done",
        subject_id: "done-item",
        created_at: new Date(2026, 7, 1, 9, 0).toISOString(),
        status: "done",
      }),
    ],
    feedItems: [
      item({ item_id: "old-item", title: "还没处理的旧件", source_created_at: new Date(2026, 7, 1, 9, 0).toISOString() }),
      item({ item_id: "done-item", title: "早就做完了", source_created_at: new Date(2026, 7, 1, 9, 0).toISOString() }),
    ],
  });
  assert.equal(eventsOnDay(events, TODAY).some((event) => event.title === "还没处理的旧件"), true);
  assert.equal(events.some((event) => event.title === "早就做完了"), false);
  const sameWeekDone = collect({
    inbox: [inbox({
      entry_id: "week-done",
      subject_id: "week-item",
      created_at: at(16, 9, 0),
      status: "done",
    })],
    feedItems: [item({ item_id: "week-item", title: "这周做完的", source_created_at: at(16, 9, 0) })],
  });
  assert.equal(sameWeekDone.some((event) => event.title === "这周做完的"), false);
});

test("disconnected source is pinned to today and not duplicated when a source_fault inbox exists", () => {
  assert.equal(sourceNeedsAuth(source({ source_id: "demo-github", name: "GitHub" })), true);
  const withoutFault = collect({
    sources: [source({ source_id: "demo-github", name: "GitHub · molis-work" })],
  });
  const today = eventsOnDay(withoutFault, TODAY);
  assert.equal(today.length, 1);
  assert.equal(today[0]?.act, "reauth");
  assert.equal(today[0]?.open?.sourceId, "demo-github");

  const withFault = collect({
    sources: [source({ source_id: "demo-github", name: "GitHub · molis-work" })],
    inbox: [inbox({
      entry_id: "fault-1",
      subject_id: "demo-github",
      subject_type: "source_fault",
      reason: "source_fault",
      created_at: at(16, 9, 12),
    })],
  });
  assert.equal(withFault.filter((event) => event.act === "reauth").length, 1);
  assert.equal(withFault.find((event) => event.act === "reauth")?.inbox?.entry_id, "fault-1");
});

test("sessions land on the updated civil day as personal events", () => {
  const events = collect({
    sessions: [session({ session_id: "s1", title: "接通完成依据" })],
  });
  const row = eventsOnDay(events, TODAY)[0];
  assert.equal(row?.plugin, "sessions");
  assert.equal(row?.kind, "me");
  assert.equal(row?.open?.itemId, "s1");
  assert.equal(row?.facts.find((fact) => fact[0] === "挂在")?.[1], "生命周期");
});

test("day summary counts kinds and mentions reauth without inventing copy from the implementation", () => {
  const days = buildHomeDays(NOW, "zh-CN");
  const today = days.find((day) => day.today);
  assert.ok(today);
  const empty = summarizeDay(today, [], LABELS);
  assert.equal(empty.sum, "今天还没有事件走进来");
  const events = collect({
    inbox: [inbox({ entry_id: "att-1", subject_id: "pr-418" })],
    feedItems: [item({ item_id: "pr-418", title: "PR #418" })],
    sources: [source({ source_id: "demo-gmail", name: "Gmail", kind: "gmail", last_error_code: "auth_required", status: "disconnected" })],
  });
  const summary = summarizeDay(today, eventsOnDay(events, TODAY), LABELS);
  assert.equal(summary.sum, "今天接到 1 件事");
  assert.equal(summary.lead, "有来源需要重新授权。");
  assert.equal(summary.org, 1);
  assert.equal(civilKey(NOW), TODAY);
});
