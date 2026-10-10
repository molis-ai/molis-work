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
  return {
    route_prefix: view.route_prefix,
    preset,
    entries: [...feedEntries(view), ...supplementalEntries],
    sources,
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
      admission: rule.admission,
      rule_id: rule.rule_id,
      name: rule.name,
      enabled: rule.enabled,
      contains: rule.match.contains ?? null,
      source_id: rule.match.source_id ?? null,
      source_kind: rule.match.source_kind ?? null,
      judgment: rule.judgment,
    })),
    primitives: feedUiPrimitives,
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
  options: { entryId?: string; inboxActive?: boolean; promoteAvailable?: boolean; inboxEntry?: InboxEntryRecord | null; surface?: "frame-block" } = {},
): string {
  const model: PersistedFeedDetailModel = {
    route_prefix: routePrefix,
    entry_id: options.entryId ?? item.item_id,
    item: itemModel(item),
    inbox_entry: options.inboxEntry ?? null,
    inbox_active: options.inboxActive ?? false, promote_available: options.promoteAvailable,
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
  ];
}

function itemModel(item: FeedItemRecord): FeedUiItem {
  return {
    project_id: item.project_id,
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
    materials: item.materials,
    suggested_behavior_ids: item.suggested_behavior_ids ?? [],
  };
}

function sourceModel(source: FeedSourceRecord, view: MolisWorkWebView): FeedUiSource {
  const runs = view.feed.runs.filter((run) => run.source_id === source.source_id);
  const uiKind = source.kind === "research_library" ? "other" : source.sync_kind === "github"
    ? "github"
    : source.sync_kind === "gmail"
      ? "gmail"
      : source.sync_kind === "connector"
        ? "connector"
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
      : String(source.config.repository ?? source.config.url ?? source.config.feed_url ?? catalogFeedUrl ?? source.config.query ?? source.account_label ?? source.kind);
  const scope = typeof source.config.scope === "string" && source.config.scope
    ? source.config.scope
    : uiKind === "github" ? L("通知、PR 与 Review 请求") : uiKind === "gmail" ? L("指定标签与未读邮件") : uiKind === "connector" ? L("账号入站更新") : L("公开 Feed 更新");
  return {
    project_id: source.project_id,
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
    item_count: source.item_count,
    ui_kind: uiKind,
    type_label: source.kind === "research_library" ? L("共享研究库") : uiKind === "github" ? "GitHub" : uiKind === "gmail" ? "Gmail" : uiKind === "rss" ? "RSS / Atom" : uiKind === "connector" ? source.name : L("其他来源"),
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
    scope_label: source.kind === "research_library" ? String(source.config.research_source ?? "") : L(scope),
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

function sourceStatusLabel(status: FeedSourceRecord["status"]): string {
  return ({ active: L("已连接"), paused: L("已暂停"), error: L("需处理"), disconnected: L("未连接") } as const)[status];
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
