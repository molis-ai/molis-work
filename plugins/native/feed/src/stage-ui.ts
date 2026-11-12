import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { StagePageModel } from "@molis-ai/molis-work-contracts/platform/ui";
import { renderRichText, richPlainText } from "@molis-ai/molis-work-plugin-sdk/rich-text";
import type { FeedItemRecord, FeedItemType, FeedSourceRecord } from "./projection.js";
import type { FeedStageData, FeedReaderData } from "./query-actions.js";
import type { FeedUiEntry, FeedUiItem, FeedUiModel, FeedUiPrimitives, FeedUiSource, PersistedFeedDetailModel } from "./ui.js";
import { feedRunHttpStatus, feedSourceUiKind } from "./source-presentation.js";

type FeedText = { readText: FeedUiPrimitives["text"] };
type FeedStageView = { route_prefix: string; data: FeedStageData };

/** The owner converts its stage read into the same source, message and reader UI models. */
export function buildFeedStageUiModel(model: StagePageModel<FeedStageData>): FeedUiModel {
  if (!model.data) throw new ActionError("actions.plugin_unavailable", "Feed 舞台数据不可用");
  return buildFeedModel({ readText: model.primitives.text }, feedStagePrimitives(model), { route_prefix: model.route_prefix, data: model.data }, "feed");
}
export function buildFeedReaderUiModel(model: StagePageModel<FeedReaderData>): PersistedFeedDetailModel {
  if (!model.data || !model.object) throw new ActionError("actions.plugin_unavailable", "Feed 对象数据不可用");
  return { route_prefix: model.route_prefix, entry_id: model.object.id, item: itemModel(model.data.item), inbox_entry: null,
    material_offset: model.data.material_offset, material_next_offset: model.data.material_next_offset,
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
  const sources = view.data.snapshot.sources.map((source) => sourceModel(source, view, text.readText, ui));
  return {
    route_prefix: view.route_prefix,
    preset,
    facets: view.data.snapshot.facets,
    page: { offset: view.data.snapshot.offset, next_offset: view.data.snapshot.next_offset },
    entries: feedEntries(view, text.readText),
    sources,
    source_catalog: (view.data.source_catalog ?? []).map((source) => ({
      id: source.id,
      name: source.name,
      category_label: source.category_label,
      limited: (source.limitations?.length ?? 0) > 0,
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

function feedEntries(view: FeedStageView, _L: FeedText["readText"]): FeedUiEntry[] {
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
      summary: richPlainText(item.summary || item.body) || uiText.text("feed.stage-ui.no-additional-summary"),
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

function sourceModel(source: FeedSourceRecord, view: FeedStageView, readText: FeedText["readText"], ui: FeedUiPrimitives): FeedUiSource {
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
    : uiKind === "github" ? uiText.text("feed.stage-ui.notifications-prs-review-requests") : uiKind === "gmail" ? uiText.text("feed.stage-ui.selected-labels-unread-mail") : uiKind === "connector" ? uiText.text("feed.stage-ui.account-inbound-updates") : uiText.text("feed.stage-ui.public-feed-updates");
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
    type_label: source.kind === "research_library" ? uiText.text("feed.stage-ui.research-library") : uiKind === "github" ? "GitHub" : uiKind === "gmail" ? "Gmail" : uiKind === "rss" ? "RSS / Atom" : uiKind === "connector" ? source.name : uiText.text("feed.stage-ui.other-source"),
    status_kind: statusKind,
    status_label: running ? uiText.text("feed.stage-ui.pulling") : sourceStatusLabel(source.status, readText),
    last_fetch_label: source.last_sync_at ? ui.formatDate(source.last_sync_at) : uiText.text("feed.stage-ui.not-pulled-yet"),
    next_fetch_label: !source.enabled || source.status === "paused"
      ? uiText.text("feed.stage-ui.paused")
      : typeof retryAfterAt === "string" && Number.isFinite(Date.parse(retryAfterAt))
        ? uiText.text("feed.stage-ui.retry-after-rate-limit-time", { time: ui.formatDate(retryAfterAt) })
        : source.schedule.mode === "interval" && source.schedule.enabled && source.schedule.next_pull_at
          ? ui.formatDate(source.schedule.next_pull_at)
          : uiText.text("feed.stage-ui.waiting-manual-pull"),
    schedule_label: source.schedule.mode === "manual"
      ? uiText.text("feed.stage-ui.manual-pulls-only")
      : source.schedule.enabled ? uiText.text("feed.stage-ui.every-count-count", { count: source.schedule.interval_minutes }) : uiText.text("feed.stage-ui.scheduled-pulls-off"),
    scope_label: source.kind === "research_library" ? String(source.config.research_source ?? "") : scope,
    scope_options: (presentation?.scope_options ?? []).map((preset) => ({ value: preset.value, label: preset.label })),
    configured_endpoint: configuredEndpoint,
    protocol_status: presentation?.conditional_request
      ? readText(({ etag: "feed.stage-ui.etag-conditional-requests-enabled", "last-modified": "feed.stage-ui.last-modified-conditional-requests-enabled", unvalidated: "feed.stage-ui.the-source-does-not-support-conditional-validation", "not-fetched": "feed.stage-ui.validate-the-feed-and-record-conditional-requests" } as const)[presentation.conditional_request])
      : null,
    home_url: presentation?.home_url ?? null,
    editable_endpoint: source.kind === "custom_rss",
    messages: view.data.snapshot.feed_items.filter((item) => item.source_id === source.source_id).slice(0, 3).map((item) => item.title),
    runs: runs.slice(0, 8).map((run) => ({
      phase: run.phase,
      outcome: run.outcome,
      error_code: run.error_code,
      http_status: feedRunHttpStatus(run.receipt),
      created_count: run.created_count,
      deduped_count: run.deduped_count,
      started_at: run.started_at,
      completed_at: run.completed_at,
    })),
  };
}

function sourceStatusLabel(status: FeedSourceRecord["status"], _L: FeedText["readText"]): string {
  return ({ active: uiText.text("feed.stage-ui.connected"), paused: uiText.text("feed.stage-ui.paused"), error: uiText.text("feed.stage-ui.needs-attention"), disconnected: uiText.text("feed.stage-ui.disconnected") } as const)[status];
}

function provider(item: FeedItemRecord): FeedUiEntry["provider"] {
  const value = `${item.source_kind} ${item.kind} ${item.source_label}`.toLowerCase();
  if (value.includes("github")) return "github";
  if (value.includes("gmail") || value.includes("mail")) return "gmail";
  if (value.includes("rss") || value.includes("atom") || value.includes("feed")) return "rss";
  return "other";
}
