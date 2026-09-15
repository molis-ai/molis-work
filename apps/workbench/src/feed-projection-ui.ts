import type {
  AttentionEntryRecord,
} from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type {
  FeedUiEntry,
  FeedUiItem,
  FeedUiModel,
  FeedUiPrimitives,
  FeedUiSource,
  PersistedFeedDetailModel,
} from "@molis-ai/molis-work-plugin-feed";
import { renderFeedContribution } from "./ui-composition.js";
import { GMAIL_SCOPE_PRESETS } from "@molis-ai/molis-work-integration-gmail/scope";

import type {
  FeedItemRecord,
  FeedItemType,
  FeedSourceRecord,
  InboxEntryRecord,
} from "@molis-ai/molis-work-plugin-feed";
import { readRssHttpState } from "@molis-ai/molis-work-integration-rss";
import { feedPlainText, renderFeedRichText } from "@molis-ai/molis-work-plugin-feed";
import { icon } from "@molis-ai/molis-work-design-system";
import type { MolisWorkWebView } from "./page-view.js";

export type FeedSupplementalEntry = FeedUiEntry;

export function createWorkbenchFeedProjectionRenderer(primitives: {
  L(text: string, values?: Record<string, string | number>): string;
  dateTimeLocale(): string;
}) {
  const { L, dateTimeLocale } = primitives;
function buildFeedNativePluginModel(
  view: MolisWorkWebView,
  preset: FeedItemType,
  supplementalEntries: readonly FeedSupplementalEntry[] = [],
  active = false,
): FeedUiModel {
  const sources = view.feed.sources.map((source) => sourceModel(source, view));
  if (view.demo) {
    const presentKinds = new Set(sources.map((source) => source.ui_kind));
    sources.push(...demoSourceModels(view.snapshot.board.board_id).filter((source) => !presentKinds.has(source.ui_kind)));
  }
  return {
    route_prefix: view.route_prefix,
    preset,
    entries: [...feedEntries(view), ...supplementalEntries],
    sources,
    relay_import: {
      available: view.relay_import.available,
      source_count: view.relay_import.source_count,
      item_count: view.relay_import.item_count,
      material_count: view.relay_import.material_count,
    },
    source_catalog: (view.feed_source_catalog ?? []).map((source) => ({
      id: source.id,
      name: source.name,
      category_label: L(source.category_label),
    })),
    connector_auth: {
      github: view.feed_connector_auth?.github ?? { bound: false },
      gmail: view.feed_connector_auth?.gmail ?? { bound: false },
    },
    out_rules: (view.feed.out_rules ?? []).map((rule) => ({
      rule_id: rule.rule_id,
      name: rule.name,
      enabled: rule.enabled,
      contains: rule.match.contains ?? null,
      source_id: rule.match.source_id ?? null,
      source_kind: rule.match.source_kind ?? null,
    })),
    primitives: feedUiPrimitives,
    demo: view.demo,
    active,
  };
}

function renderFeedNativePluginSurface(
  view: MolisWorkWebView,
  surface: "directory" | "workbench" | "workbench-fragment" | "source-directory" | "source-workbench" | "overlays",
  preset: FeedItemType,
  supplementalEntries: readonly FeedSupplementalEntry[] = [],
  active = false,
): string {
  return renderFeedContribution(
    surface,
    buildFeedNativePluginModel(view, preset, supplementalEntries, active),
  );
}

function renderFeedNativePluginPersistedDetail(
  item: FeedItemRecord,
  routePrefix = "",
  options: { entryId?: string; inboxActive?: boolean; inboxEntry?: InboxEntryRecord | null; surface?: "frame-block" } = {},
): string {
  const model: PersistedFeedDetailModel = {
    route_prefix: routePrefix,
    entry_id: options.entryId ?? item.item_id,
    item: itemModel(item),
    inbox_entry: options.inboxEntry ? attentionModel(options.inboxEntry) : null,
    inbox_active: options.inboxActive ?? false,
    primitives: feedUiPrimitives,
  };
  return renderFeedContribution(options.surface === "frame-block" ? "frame-block" : "persisted-detail", model);
}

function feedEntries(view: MolisWorkWebView): FeedUiEntry[] {
  return [
    ...view.feed.feed_items.map((item): FeedUiEntry => ({
      entry_id: item.item_id,
      item_id: item.item_id,
      inbox_entry: null,
      item: itemModel({ ...item, item_type: "feed" }),
      preset: "feed",
      provider: provider(item),
      kind_label: "Feed",
      source_label: item.source_label || item.source_kind,
      disposition: item.disposition === "inbox" ? "feed" : item.disposition,
      title: item.title,
      summary: feedPlainText(item.summary || item.body) || L("没有附加摘要"),
      updated_at: item.source_updated_at || item.updated_at,
      read: Boolean(item.read_at),
      attention_rank: 0,
    })),
    ...(view.demo ? demoFeedEntries(view) : []),
  ];
}

function demoFeedEntries(view: MolisWorkWebView): FeedUiEntry[] {
  const boardId = view.snapshot.board.board_id;
  const createItem = (
    id: string,
    itemType: FeedItemType,
    kind: string,
    sourceId: string,
    sourceLabel: string,
    title: string,
    summary: string,
    body: string,
    updatedAt: string,
    tags: string[],
  ): FeedItemRecord => ({
    board_id: boardId,
    item_id: id,
    source_id: sourceId,
    item_type: itemType,
    kind,
    title,
    summary,
    body,
    source_kind: sourceId.includes("github") ? "github" : sourceId.includes("gmail") ? "gmail" : sourceId.includes("rss") ? "rss" : "molis-work",
    source_label: sourceLabel,
    external_id: id,
    url: null,
    origin_status: "prototype",
    priority: "normal",
    tags,
    author: sourceId.includes("gmail") ? "Mina · Product Partner" : sourceId.includes("github") ? "adeptify/molis-work" : "Latent Space",
    disposition: "inbox",
    linked_goal_id: null,
    read_at: null,
    revision: 1,
    source_created_at: updatedAt,
    source_updated_at: updatedAt,
    imported_at: updatedAt,
    updated_at: updatedAt,
    materials: [],
  });
  const examples = [
    {
      item: createItem("prototype-feed-github", "feed", "github_notification", "prototype-source-github", "GitHub · adeptify", "PR #418 请求你确认 FeedItem 与 InboxEntry 的边界", "新的 review request，涉及来源消息如何进入待处理引用。", "PR 更新了信息流对象关系：来源负责接入与拉取，Feed 保存完整消息，Inbox 只保留需要人工介入的引用。请重点检查重复入箱与处理完成后的追溯行为。", "2026-08-30T14:18:00+08:00", ["GitHub", "Review request", "演示数据"]),
      reason: "这是一条来源消息，默认只属于 Feed；只有你明确加入后才进入 Inbox。",
      nextAction: "阅读后决定加入 Inbox、保存为资料、升格 Goal 或忽略。",
      relation: "来源 GitHub · adeptify → Feed Item",
    },
    {
      item: createItem("prototype-feed-gmail", "feed", "gmail_message", "prototype-source-gmail", "Gmail · product@adeptify.ai", "设计伙伴反馈：Inbox 不应成为第二个 Feed", "邮件建议先解释进入原因，再给出下一步，不要重复完整正文。", "Mina 走完当前版本后认为 Feed 和 Inbox 的视觉很像。她建议 Inbox 只展示需要决定、回复或修复的事项，并保留回到原消息的路径。", "2026-08-30T13:42:00+08:00", ["Gmail", "用户反馈", "演示数据"]),
      reason: "这封邮件只是新消息，目前还没有明确要求你介入。",
      nextAction: "先阅读；若需要跟进，再加入 Inbox。",
      relation: "来源 Gmail · product@adeptify.ai → Feed Item",
    },
    {
      item: createItem("prototype-feed-rss", "feed", "rss_entry", "prototype-source-rss", "RSS · Latent Space", "Designing calm inboxes for agentic products", "一篇讨论 agent 产品如何区分事件流与注意力队列的文章。", "文章提出：事件流应该完整、可追溯，注意力队列则必须有进入理由、负责人和退出条件。这个模式与 Molis Work 当前的信息流重构高度相关。", "2026-08-30T12:25:00+08:00", ["RSS", "产品设计", "演示数据"]),
      reason: "公开来源内容进入完整事实流，不自动占用你的注意力。",
      nextAction: "保存为资料，或在确认要行动时升格为 Goal。",
      relation: "来源 RSS · Latent Space → Feed Item",
    },
  ];
  return examples.map(({ item, reason, nextAction, relation }) => ({
    entry_id: item.item_id,
    item_id: item.item_id,
    inbox_entry: null,
    item: itemModel(item),
    preset: "feed",
    provider: provider(item),
    kind_label: L("Feed Item · 演示"),
    source_label: item.source_label,
    disposition: item.disposition === "inbox" ? "feed" : item.disposition,
    title: item.title,
    summary: item.summary,
    updated_at: item.source_updated_at,
    read: false,
    attention_rank: 0,
    prototype: { reason, next_action: nextAction, relation },
  }));
}

function itemModel(item: FeedItemRecord): FeedUiItem {
  return {
    project_id: item.board_id,
    item_id: item.item_id,
    source_id: item.source_id,
    signal_id: null,
    signal_revision: null,
    item_type: "feed",
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    body: item.body,
    source_kind: item.source_kind,
    source_label: item.source_label,
    external_id: item.external_id,
    url: item.url,
    origin_status: item.origin_status,
    priority: item.priority,
    tags: item.tags,
    author: item.author,
    disposition: item.disposition,
    linked_goal_id: item.linked_goal_id,
    read_at: item.read_at,
    revision: item.revision,
    source_created_at: item.source_created_at,
    source_updated_at: item.source_updated_at,
    imported_at: item.imported_at,
    updated_at: item.updated_at,
    materials: item.materials.map((material) => ({
      ...material,
      project_id: material.board_id,
    })),
  };
}

function attentionModel(entry: InboxEntryRecord): AttentionEntryRecord {
  return { ...entry, project_id: entry.board_id };
}

function sourceModel(source: FeedSourceRecord, view: MolisWorkWebView): FeedUiSource {
  const runs = view.feed.runs.filter((run) => run.source_id === source.source_id);
  const uiKind = source.sync_kind === "github"
    ? "github"
    : source.sync_kind === "gmail"
      ? "gmail"
      : ["rss", "custom_rss"].includes(source.kind) || source.sync_kind === "public_source"
        ? "rss"
        : "other";
  const rssHttp = uiKind === "rss" ? readRssHttpState(source.cursor) : null;
  const running = runs.some((run) => run.phase === "running");
  const attention = source.status === "error" || source.status === "disconnected";
  const statusKind = running ? "syncing" : attention ? "attention" : source.status === "paused" ? "paused" : "active";
  const retryAfterAt = runs.find((run) => run.error_code === "connector_rate_limited")?.receipt?.retry_after_at;
  const catalogFeedUrl = source.kind === "rss"
    ? view.feed_source_catalog?.find((entry) => entry.id === source.definition_id)?.feed_url
    : undefined;
  const configuredEndpoint = uiKind === "gmail"
    ? "gmail.googleapis.com · gmail.readonly"
    : uiKind === "github"
      ? "api.github.com · notifications"
      : String(source.config.url ?? source.config.feed_url ?? catalogFeedUrl ?? source.config.query ?? source.account_label ?? source.kind);
  const scope = typeof source.config.scope === "string" && source.config.scope
    ? source.config.scope
    : uiKind === "github" ? L("通知、PR 与 Review 请求") : uiKind === "gmail" ? L("指定标签与未读邮件") : L("公开 Feed 更新");
  return {
    project_id: source.board_id,
    source_id: source.source_id,
    kind: source.kind,
    definition_id: source.definition_id,
    sync_kind: source.sync_kind,
    name: source.name,
    description: source.description,
    status: source.status,
    enabled: source.enabled,
    origin: source.origin,
    config: source.config,
    schedule: source.schedule,
    connection_ref: source.credential_ref,
    account_label: source.account_label,
    last_sync_at: source.last_sync_at,
    last_outcome: source.last_outcome,
    last_error_code: source.last_error_code,
    imported_at: source.imported_at,
    updated_at: source.updated_at,
    prototype: false,
    item_count: source.item_count,
    ui_kind: uiKind,
    type_label: uiKind === "github" ? "GitHub" : uiKind === "gmail" ? "Gmail" : uiKind === "rss" ? "RSS / Atom" : L("其他来源"),
    status_kind: statusKind,
    status_label: running ? L("正在拉取") : sourceStatusLabel(source.status),
    last_fetch_label: source.last_sync_at ? feedUiPrimitives.formatDate(source.last_sync_at) : L("尚未拉取"),
    next_fetch_label: !source.enabled || source.status === "paused"
      ? L("已暂停")
      : typeof retryAfterAt === "string" && Number.isFinite(Date.parse(retryAfterAt))
        ? L("限流后 {time} 可重试", { time: feedUiPrimitives.formatDate(retryAfterAt) })
        : source.schedule.mode === "interval" && source.schedule.enabled && source.schedule.next_pull_at
          ? feedUiPrimitives.formatDate(source.schedule.next_pull_at)
          : L("等待手动拉取"),
    schedule_label: source.schedule.mode === "manual"
      ? L("仅手动拉取")
      : source.schedule.enabled ? L("每 {count} 分钟", { count: source.schedule.interval_minutes }) : L("定时拉取已关闭"),
    scope_label: L(scope),
    scope_options: uiKind === "gmail" ? GMAIL_SCOPE_PRESETS.map((preset) => ({ value: preset.value, label: L(preset.label) })) : [],
    configured_endpoint: configuredEndpoint,
    protocol_status: rssHttp
      ? rssHttp.etag ? L("ETag 条件请求已启用") : rssHttp.last_modified ? L("Last-Modified 条件请求已启用") : rssHttp.last_success_at ? L("源站未提供条件校验；使用 Item 身份去重") : L("首次拉取后验证 Feed 并记录条件请求")
      : null,
    home_url: rssHttp?.home_url ?? null,
    editable_endpoint: source.kind === "custom_rss",
    messages: view.feed.feed_items.filter((item) => item.source_id === source.source_id).slice(0, 3).map((item) => item.title),
    runs: runs.slice(0, 8).map((run) => ({
      phase: run.phase,
      outcome: run.outcome,
      error_code: run.error_code,
      created_count: run.created_count,
      deduped_count: run.deduped_count,
      started_at: run.started_at,
      completed_at: run.completed_at,
    })),
  };
}

function demoSourceModels(projectId: string): FeedUiSource[] {
  const now = new Date().toISOString();
  const create = (
    id: string,
    kind: FeedUiSource["ui_kind"],
    name: string,
    description: string,
    accountLabel: string,
    statusKind: FeedUiSource["status_kind"],
    messages: readonly string[],
    intervalMinutes: number,
  ): FeedUiSource => ({
    project_id: projectId,
    source_id: id,
    kind: kind === "rss" ? "rss" : kind,
    definition_id: null,
    sync_kind: "manual",
    name,
    description,
    status: statusKind === "paused" ? "paused" : statusKind === "attention" ? "error" : "active",
    enabled: true,
    origin: "goalboard",
    config: { scope: kind === "gmail" ? "label:product OR label:partner" : L("新消息与更新") },
    schedule: { mode: "interval", enabled: true, interval_minutes: intervalMinutes, next_pull_at: null },
    connection_ref: null,
    account_label: accountLabel,
    last_sync_at: null,
    last_outcome: null,
    last_error_code: statusKind === "attention" ? "fixture_not_live" : null,
    imported_at: now,
    updated_at: now,
    prototype: true,
    item_count: messages.length,
    ui_kind: kind,
    type_label: kind === "github" ? "GitHub" : kind === "gmail" ? "Gmail" : "RSS / Atom",
    status_kind: statusKind,
    status_label: statusKind === "attention" ? L("需重新授权") : statusKind === "syncing" ? L("正在拉取") : L("运行正常"),
    last_fetch_label: L("演示记录"),
    next_fetch_label: L("演示计划"),
    schedule_label: L("每 {count} 分钟", { count: intervalMinutes }),
    scope_label: kind === "gmail" ? "label:product OR label:partner" : L("新消息与更新"),
    scope_options: kind === "gmail" ? GMAIL_SCOPE_PRESETS.map((preset) => ({ value: preset.value, label: L(preset.label) })) : [],
    configured_endpoint: kind === "github" ? "github.com/adeptify/*" : kind === "gmail" ? "gmail.googleapis.com · 只读" : "latent.space/feed",
    protocol_status: kind === "rss" ? L("ETag 条件请求已启用") : null,
    home_url: kind === "rss" ? "https://www.latent.space/" : null,
    editable_endpoint: false,
    messages,
    runs: [],
  });
  return [
    create("prototype-source-github", "github", "GitHub · adeptify", L("读取分配给你的 PR、Issue 与 Review 请求。"), "yijunwang · adeptify", "active", ["PR #418 请求确认 FeedItem 与 InboxEntry 的边界"], 30),
    create("prototype-source-gmail", "gmail", "Gmail · product@adeptify.ai", L("只读取需要关注的产品反馈与合作邮件。"), "product@adeptify.ai", "attention", ["设计伙伴反馈：Inbox 不应成为第二个 Feed"], 60),
    create("prototype-source-rss", "rss", "RSS · Latent Space", L("跟踪 agent 产品、模型与工具设计的新文章。"), L("公开来源"), "syncing", ["Designing calm inboxes for agentic products"], 360),
  ];
}

function sourceStatusLabel(status: FeedSourceRecord["status"]): string {
  return ({ active: L("已连接"), paused: L("已暂停"), error: L("需处理"), disconnected: L("未连接"), imported: L("仅历史数据") } as const)[status];
}

function provider(item: FeedItemRecord): FeedUiEntry["provider"] {
  const value = `${item.source_kind} ${item.kind} ${item.source_label}`.toLowerCase();
  if (value.includes("github")) return "github";
  if (value.includes("gmail") || value.includes("mail")) return "gmail";
  if (value.includes("rss") || value.includes("atom") || value.includes("feed")) return "rss";
  return "other";
}

const feedUiPrimitives: FeedUiPrimitives = {
  escape: escapeHtml,
  icon,
  text: L,
  formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(dateTimeLocale(), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  },
  richText: renderFeedRichText,
  plainText: feedPlainText,
  safeExternalHref(value) {
    if (!value) return null;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
    } catch {
      return null;
    }
  },
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

  return { buildFeedNativePluginModel, renderFeedNativePluginSurface, renderFeedNativePluginPersistedDetail };
}
