// @ts-nocheck
export type HomeFlowKind = "me" | "org";
export type HomeFlowPlugin = "inbox" | "feed" | "sessions" | "goals";
export type HomeFlowAct = "continue" | "reauth";

export interface HomeFlowInbox {
  entry_id: string;
  subject_type: "feed_item" | "goal_decision" | "source_fault";
  subject_id: string;
  reason: string;
  status: "open" | "in_progress" | "done" | "dismissed";
  revision: number;
  created_at: string;
  updated_at: string;
  detail?: Record<string, unknown>;
}

export interface HomeFlowFeedItem {
  item_id: string;
  title: string;
  summary: string | null;
  body: string | null;
  source_id: string;
  source_kind: string;
  source_label: string;
  imported_at: string;
  source_created_at: string;
  author: string | null;
  url: string | null;
  linked_goal_id: string | null;
}

export interface HomeFlowSource {
  source_id: string;
  name: string;
  kind: string;
  status: string;
  last_sync_at: string | null;
  last_error_code: string | null;
  last_outcome: string | null;
}

export interface HomeFlowSession {
  session_id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  current_goal_id: string | null;
}

export interface HomeFlowGoal {
  goal_id: string;
  title: string;
}

export interface HomeFlowInput {
  now: Date;
  locale?: string;
  inbox: readonly HomeFlowInbox[];
  feedItems: readonly HomeFlowFeedItem[];
  sources: readonly HomeFlowSource[];
  sessions: readonly HomeFlowSession[];
  goals?: readonly HomeFlowGoal[];
}

export interface HomeFlowOpen {
  plugin: HomeFlowPlugin;
  itemId: string;
  title: string;
  sourceId?: string;
}

export interface HomeFlowEvent {
  id: string;
  day: string;
  when: string;
  at: number;
  kind: HomeFlowKind;
  plugin: HomeFlowPlugin;
  icon: "inbox" | "rss" | "terminal" | "target" | "alert";
  title: string;
  lead: string;
  text: string;
  facts: readonly (readonly [string, string])[];
  act: HomeFlowAct;
  open: HomeFlowOpen | null;
  inbox?: { entry_id: string; revision: number; status: HomeFlowInbox["status"] };
}

export interface HomeFlowDay {
  id: string;
  n: number;
  week: string;
  w: string;
  today: boolean;
}

export interface HomeFlowSummary {
  sum: string;
  lead: string;
  me: number;
  org: number;
}

/** Untyped factory so `.toString()` can run in the workbench client IIFE. */
export function createHomeFlow() {
  const ORG_KINDS = new Set(["github", "gmail", "youtube_channel"]);
  const WINDOW_BEFORE = 3;
  const WINDOW_AFTER = 3;

  function civilKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function clockLabel(date) {
    return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
  }

  function buildHomeDays(now, locale) {
    const days = [];
    for (let offset = -WINDOW_BEFORE; offset <= WINDOW_AFTER; offset++) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      days.push({
        id: civilKey(date),
        n: date.getDate(),
        week: new Intl.DateTimeFormat(locale || "zh-CN", { weekday: "long" }).format(date),
        w: new Intl.DateTimeFormat(locale || "zh-CN", { weekday: "narrow" }).format(date),
        today: offset === 0,
      });
    }
    return days;
  }

  function isActiveInbox(status) {
    return status === "open" || status === "in_progress";
  }

  function sourceNeedsAuth(source) {
    return source.status === "disconnected"
      || source.status === "error"
      || source.last_error_code === "auth_required"
      || (source.last_outcome === "failed" && Boolean(source.last_error_code));
  }

  function parseInstant(value, fallback) {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date;
  }

  function orgKind(kind, subjectType) {
    if (subjectType === "source_fault" || ORG_KINDS.has(kind)) return "org";
    return "me";
  }

  function inWindow(day, days) {
    return days.some((item) => item.id === day);
  }

  function pinDay(day, today, days, pinIfOutside) {
    if (inWindow(day, days)) return day;
    return pinIfOutside ? today : day;
  }

  function inboxStatusLabel(status) {
    if (status === "in_progress") return "处理中";
    if (status === "done") return "已完成";
    if (status === "dismissed") return "已忽略";
    return "待处理";
  }

  function buildHomeEvents(input) {
    const now = input.now;
    const days = buildHomeDays(now, input.locale);
    const today = civilKey(now);
    const items = new Map(input.feedItems.map((item) => [item.item_id, item]));
    const sources = new Map(input.sources.map((row) => [row.source_id, row]));
    const goals = new Map((input.goals || []).map((goal) => [goal.goal_id, goal]));
    const inboxedItems = new Set(
      input.inbox.filter((entry) => entry.subject_type === "feed_item").map((entry) => entry.subject_id),
    );
    const faultedSources = new Set(
      input.inbox.filter((entry) => entry.subject_type === "source_fault").map((entry) => entry.subject_id),
    );
    const events = [];

    for (const entry of input.inbox) {
      if (!isActiveInbox(entry.status)) continue;
      const created = parseInstant(entry.created_at, now);
      const day = pinDay(civilKey(created), today, days, true);
      if (!inWindow(day, days)) continue;
      if (entry.subject_type === "feed_item") {
        const item = items.get(entry.subject_id);
        const title = item?.title || "原 Feed Item 已不可用";
        events.push({
          id: "inbox:" + entry.entry_id,
          day,
          when: clockLabel(created),
          at: created.getTime(),
          kind: orgKind(item?.source_kind || "", entry.subject_type),
          plugin: "inbox",
          icon: "inbox",
          title,
          lead: item?.summary || item?.source_label || "Inbox",
          text: item?.body || item?.summary || title,
          facts: [
            ["来自", item?.source_label || item?.source_kind || "Feed"],
            ["状态", inboxStatusLabel(entry.status)],
            ["挂在", item?.linked_goal_id && goals.get(item.linked_goal_id)?.title || "首页"],
          ],
          act: "continue",
          open: item
            ? { plugin: "feed", itemId: item.item_id, title: item.title }
            : { plugin: "inbox", itemId: entry.entry_id, title },
          inbox: { entry_id: entry.entry_id, revision: entry.revision, status: entry.status },
        });
        continue;
      }
      if (entry.subject_type === "source_fault") {
        const source = sources.get(entry.subject_id);
        const title = source ? "来源「" + source.name + "」需要处理" : "原来源已不可用";
        events.push({
          id: "inbox:" + entry.entry_id,
          day,
          when: clockLabel(created),
          at: created.getTime(),
          kind: "org",
          plugin: "feed",
          icon: "alert",
          title,
          lead: source?.name || "来源需要恢复",
          text: typeof entry.detail?.user_action === "string" && entry.detail.user_action.trim()
            ? entry.detail.user_action
            : "检查来源配置、授权或拉取范围后重新同步。",
          act: "reauth",
          facts: [
            ["来自", source?.name || "Feed"],
            ["状态", inboxStatusLabel(entry.status)],
            ["挂在", "来源授权"],
          ],
          open: source
            ? { plugin: "feed", itemId: source.source_id, title: source.name, sourceId: source.source_id }
            : null,
          inbox: { entry_id: entry.entry_id, revision: entry.revision, status: entry.status },
        });
        continue;
      }
      const goal = goals.get(entry.subject_id);
      const title = goal?.title || "原 Goal 已不可用";
      events.push({
        id: "inbox:" + entry.entry_id,
        day,
        when: clockLabel(created),
        at: created.getTime(),
        kind: "me",
        plugin: "goals",
        icon: "target",
        title,
        lead: "等待决定",
        text: "到 Goals 完成判断。Inbox 只保留这条注意力。",
        facts: [
          ["来自", "Goals"],
          ["状态", inboxStatusLabel(entry.status)],
          ["挂在", title],
        ],
        act: "continue",
        open: goal ? { plugin: "goals", itemId: goal.goal_id, title: goal.title } : null,
        inbox: { entry_id: entry.entry_id, revision: entry.revision, status: entry.status },
      });
    }

    for (const source of input.sources) {
      if (!sourceNeedsAuth(source) || faultedSources.has(source.source_id)) continue;
      events.push({
        id: "auth:" + source.source_id,
        day: today,
        when: clockLabel(now),
        at: now.getTime(),
        kind: orgKind(source.kind),
        plugin: "feed",
        icon: "alert",
        title: source.name + " 需要重新授权",
        lead: "未连接时不会再往今天送东西",
        text: "重新授权之前，这个来源不会再往今天送东西。",
        facts: [
          ["来自", source.name],
          ["状态", source.status === "disconnected" ? "未连接" : "需要处理"],
          ["挂在", "Feed 来源"],
        ],
        act: "reauth",
        open: { plugin: "feed", itemId: source.source_id, title: source.name, sourceId: source.source_id },
      });
    }

    for (const item of input.feedItems) {
      if (inboxedItems.has(item.item_id)) continue;
      const arrived = parseInstant(item.source_created_at || item.imported_at, now);
      const day = civilKey(arrived);
      if (!inWindow(day, days)) continue;
      events.push({
        id: "feed:" + item.item_id,
        day,
        when: clockLabel(arrived),
        at: arrived.getTime(),
        kind: orgKind(item.source_kind),
        plugin: "feed",
        icon: "rss",
        title: item.title,
        lead: item.summary || item.source_label,
        text: item.body || item.summary || item.title,
        facts: [
          ["来自", item.source_label || item.source_kind],
          ["状态", "记录"],
          ["挂在", item.linked_goal_id && goals.get(item.linked_goal_id)?.title || "Feed"],
        ],
        act: "continue",
        open: { plugin: "feed", itemId: item.item_id, title: item.title },
      });
    }

    for (const session of input.sessions) {
      const updated = parseInstant(session.updated_at || session.created_at, now);
      const day = civilKey(updated);
      if (!inWindow(day, days)) continue;
      const goal = session.current_goal_id ? goals.get(session.current_goal_id) : undefined;
      events.push({
        id: "session:" + session.session_id,
        day,
        when: clockLabel(updated),
        at: updated.getTime(),
        kind: "me",
        plugin: "sessions",
        icon: "terminal",
        title: session.title || "Session",
        lead: session.status,
        text: "Session 还在。接着做会打开这条会话。",
        facts: [
          ["来自", "Sessions"],
          ["状态", session.status],
          ["挂在", goal?.title || "未挂 Goal"],
        ],
        act: "continue",
        open: { plugin: "sessions", itemId: session.session_id, title: session.title || "Session" },
      });
    }

    events.sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));
    return events;
  }

  function eventsOnDay(events, dayId) {
    return events.filter((event) => event.day === dayId);
  }

  function summarizeDay(day, events, labels) {
    const me = events.filter((event) => event.kind === "me").length;
    const org = events.filter((event) => event.kind === "org").length;
    if (!events.length) {
      return { sum: day.today ? labels.todayEmpty : labels.empty, lead: labels.emptyLead, me, org };
    }
    const auth = events.some((event) => event.act === "reauth");
    return {
      sum: (day.today ? labels.todaySum : labels.daySum).replace("{n}", String(events.length)),
      lead: auth ? labels.authLead : events.map((event) => event.title).slice(0, 2).join("；"),
      me,
      org,
    };
  }

  return {
    civilKey,
    clockLabel,
    buildHomeDays,
    isActiveInbox,
    sourceNeedsAuth,
    buildHomeEvents,
    eventsOnDay,
    summarizeDay,
  };
}

const homeFlow = createHomeFlow();
export const civilKey = homeFlow.civilKey;
export const clockLabel = homeFlow.clockLabel;
export const buildHomeDays = homeFlow.buildHomeDays;
export const isActiveInbox = homeFlow.isActiveInbox;
export const sourceNeedsAuth = homeFlow.sourceNeedsAuth;
export const buildHomeEvents = homeFlow.buildHomeEvents;
export const eventsOnDay = homeFlow.eventsOnDay;
export const summarizeDay = homeFlow.summarizeDay;
