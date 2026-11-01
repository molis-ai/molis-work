import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { StagePageModel } from "@molis-ai/molis-work-contracts/platform/ui";
import { renderRichText, richPlainText } from "@molis-ai/molis-work-plugin-sdk/rich-text";
import type { FeedItemRecord, FeedItemType, FeedSourceRecord } from "./projection.js";
import type { FeedStageData, FeedReaderData } from "./query-actions.js";
import type { FeedUiEntry, FeedUiItem, FeedUiModel, FeedUiPrimitives, FeedUiSource, PersistedFeedDetailModel } from "./ui.js";
import { feedSourceUiKind } from "./source-presentation.js";

type FeedText = { L: FeedUiPrimitives["text"] };
type FeedStageView = { route_prefix: string; data: FeedStageData };

/** The owner converts its stage read into the same source, message and reader UI models. */
export function buildFeedStageUiModel(model: StagePageModel<FeedStageData>): FeedUiModel {
  if (!model.data) throw new ActionError("actions.plugin_unavailable", "Feed 舞台数据不可用");
  return buildFeedModel({ L: model.primitives.text }, feedStagePrimitives(model), { route_prefix: model.route_prefix, data: model.data }, "feed");
}
export function buildFeedReaderUiModel(model: StagePageModel<FeedReaderData>): PersistedFeedDetailModel {
  if (!model.data || !model.object) throw new ActionError("actions.plugin_unavailable", "Feed 对象数据不可用");
  return { route_prefix: model.route_prefix, entry_id: model.object.id, item: itemModel(model.data.item), inbox_entry: null,
    inbox_active: model.data.inbox_active, promote_available: model.data.promote_available, primitives: feedStagePrimitives(model) };
}
function feedStagePrimitives(model: Pick<StagePageModel, "primitives">): FeedUiPrimitives {
  return { ...model.primitives, richText: renderRichText, plainText: richPlainText,
    safeExternalHref(value) {
      if (!value) return null;
      try { return ["http:", "https:"].includes(new URL(value).protocol) ? value : null; } catch { return null; }
    } };
}

function buildFeedModel(
  text: FeedText,
  ui: FeedUiPrimitives,
  view: FeedStageView,
  preset: FeedItemType,
): FeedUiModel {
  const sources = view.data.snapshot.sources.map((source) => sourceModel(source, view, text.L, ui));
  return {
    route_prefix: view.route_prefix,
    preset,
    entries: feedEntries(view, text.L),
    sources,
    source_catalog: (view.data.source_catalog ?? []).map((source) => ({
      id: source.id,
      name: source.name,
      category_label: text.L(source.category_label),
    })),
    connector_auth: {
      github: view.data.connector_auth?.github ?? { bound: false },
      gmail: view.data.connector_auth?.gmail ?? { bound: false },
    },
    out_rules: (view.data.snapshot.out_rules ?? []).map((rule) => ({
      admission: rule.admission,
      rule_id: rule.rule_id,
      name: rule.name,
      enabled: rule.enabled,
      contains: rule.match.contains ?? null,
      source_id: rule.match.source_id ?? null,
      source_kind: rule.match.source_kind ?? null,
      judgment: rule.judgment,
    })),
    primitives: ui,
    active: false,
  };
}

function feedEntries(view: FeedStageView, L: FeedText["L"]): FeedUiEntry[] {
  return [
    ...view.data.snapshot.feed_items.map((item): FeedUiEntry => ({
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
      summary: richPlainText(item.summary || item.body) || L("没有附加摘要"),
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

function sourceModel(source: FeedSourceRecord, view: FeedStageView, L: FeedText["L"], ui: FeedUiPrimitives): FeedUiSource {
  const runs = view.data.snapshot.runs.filter((run) => run.source_id === source.source_id);
  const uiKind = feedSourceUiKind(source);
  const presentation = view.data.source_presentations[source.source_id];
  if ((uiKind === "rss" || uiKind === "gmail") && !presentation) throw new ActionError("actions.plugin_unavailable", "来源展示尚未由原集成提供");
  const running = runs.some((run) => run.phase === "running");
  const attention = source.status === "error" || source.status === "disconnected";
  const statusKind = running ? "syncing" : attention ? "attention" : source.status === "paused" ? "paused" : "active";
  const retryAfterAt = runs.find((run) => run.error_code === "connector.rate_limited")?.receipt?.retry_after_at;
  const catalogFeedUrl = source.kind === "rss"
    ? view.data.source_catalog?.find((entry) => entry.id === source.definition_id)?.feed_url
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
    status_label: running ? L("正在拉取") : sourceStatusLabel(source.status, L),
    last_fetch_label: source.last_sync_at ? ui.formatDate(source.last_sync_at) : L("尚未拉取"),
    next_fetch_label: !source.enabled || source.status === "paused"
      ? L("已暂停")
      : typeof retryAfterAt === "string" && Number.isFinite(Date.parse(retryAfterAt))
        ? L("限流后 {time} 可重试", { time: ui.formatDate(retryAfterAt) })
        : source.schedule.mode === "interval" && source.schedule.enabled && source.schedule.next_pull_at
          ? ui.formatDate(source.schedule.next_pull_at)
          : L("等待手动拉取"),
    schedule_label: source.schedule.mode === "manual"
      ? L("仅手动拉取")
      : source.schedule.enabled ? L("每 {count} 分钟", { count: source.schedule.interval_minutes }) : L("定时拉取已关闭"),
    scope_label: source.kind === "research_library" ? String(source.config.research_source ?? "") : L(scope),
    scope_options: (presentation?.scope_options ?? []).map((preset) => ({ value: preset.value, label: L(preset.label) })),
    configured_endpoint: configuredEndpoint,
    protocol_status: presentation?.conditional_request
      ? L(({ etag: "ETag 条件请求已启用", "last-modified": "Last-Modified 条件请求已启用", unvalidated: "源站未提供条件校验；使用 Item 身份去重", "not-fetched": "首次拉取后验证 Feed 并记录条件请求" } as const)[presentation.conditional_request])
      : null,
    home_url: presentation?.home_url ?? null,
    editable_endpoint: source.kind === "custom_rss",
    messages: view.data.snapshot.feed_items.filter((item) => item.source_id === source.source_id).slice(0, 3).map((item) => item.title),
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

function sourceStatusLabel(status: FeedSourceRecord["status"], L: FeedText["L"]): string {
  return ({ active: L("已连接"), paused: L("已暂停"), error: L("需处理"), disconnected: L("未连接") } as const)[status];
}

function provider(item: FeedItemRecord): FeedUiEntry["provider"] {
  const value = `${item.source_kind} ${item.kind} ${item.source_label}`.toLowerCase();
  if (value.includes("github")) return "github";
  if (value.includes("gmail") || value.includes("mail")) return "gmail";
  if (value.includes("rss") || value.includes("atom") || value.includes("feed")) return "rss";
  return "other";
}

