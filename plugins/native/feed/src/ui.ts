import type {
  AttentionEntryRecord,
} from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type {
  FeedItemRecord,
  FeedMaterialRecord,
} from "./contract/feed.js";
import type { SourceRecord } from "./contract/sources.js";
import { FEED_PLUGIN_ID } from "./identity.js";
import { buildFeedReaderUiModel, buildFeedStageUiModel } from "./stage-ui.js";
import type { FeedReaderData, FeedStageData } from "./query-actions.js";
import { t as uiText, type MwButtonOptions, renderAlert, renderButton, renderKept, renderStateRing, renderStatusMark, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import type {
  UiContribution,
  UiContributionDeclaration,
  UiRenderRequest,
  StagePageModel,
} from "@molis-ai/molis-work-contracts/platform/ui";
import {
  FEED_ARCHIVE_OPTION_ID,
  FEED_CAPTURE_DISPOSITION_IDS,
  FEED_PROMOTE_OPTION_ID,
  FEED_SAVE_OPTION_ID,
  INBOX_ADMIT_OPTION_ID,
  visibleFeedDispositionIds,
} from "@molis-ai/molis-work-contracts/modules/functions";

export const FEED_UI_CONTRIBUTION_ID = "io.molis.work.native.feed.ui.v1";

export type FeedUiPreset = "feed";
export type FeedUiProvider = "github" | "gmail" | "rss" | "connector" | "other";

export interface FeedUiMaterial extends FeedMaterialRecord {
  readonly content?: string | null;
}

export interface FeedUiItem extends Omit<FeedItemRecord, "materials"> {
  readonly item_type: FeedUiPreset;
  readonly materials: readonly FeedUiMaterial[];
  readonly suggested_behavior_ids?: readonly string[];
}

export interface FeedUiEntry {
  readonly entry_id: string;
  readonly item_id: string | null;
  readonly inbox_entry: AttentionEntryRecord | null;
  readonly item: FeedUiItem | null;
  readonly preset: FeedUiPreset;
  readonly provider: FeedUiProvider;
  readonly kind_label: string;
  readonly source_label: string;
  readonly disposition: string;
  readonly title: string;
  readonly summary: string;
  readonly updated_at: string;
  readonly read: boolean;
  readonly attention_rank: number;
  /** HTML owned by another contribution and mounted in the Feed detail slot. */
  readonly detail_slot_html?: string;
}

export interface FeedUiSource extends SourceRecord {
  readonly item_count: number;
  readonly ui_kind: "github" | "gmail" | "rss" | "connector" | "other";
  readonly type_label: string;
  readonly status_kind: "active" | "attention" | "syncing" | "paused";
  readonly status_label: string;
  readonly last_fetch_label: string;
  readonly next_fetch_label: string;
  readonly schedule_label: string;
  readonly scope_label: string;
  readonly scope_options: readonly { readonly value: string; readonly label: string }[];
  readonly configured_endpoint: string;
  readonly protocol_status: string | null;
  readonly home_url: string | null;
  readonly editable_endpoint: boolean;
  readonly messages: readonly string[];
  readonly runs: readonly FeedUiSourceRun[];
}

export interface FeedUiSourceRun {
  readonly phase: "running" | "terminal" | "interrupted";
  readonly outcome: string | null;
  readonly error_code: string | null;
  readonly created_count: number;
  readonly deduped_count: number;
  readonly started_at: string;
  readonly completed_at: string | null;
}

export interface FeedUiCatalogSource {
  readonly id: string;
  readonly name: string;
  readonly category_label: string;
}

export interface FeedUiConnectorStatus {
  readonly bound: boolean;
}

export interface FeedUiPrimitives {
  escape(value: unknown): string;
  icon(name: string): string;
  text(value: string, values?: Record<string, string | number>): string;
  formatDate(value: string): string;
  richText(value: string | null): string;
  plainText(value: string | null): string;
  safeExternalHref(value: string | null): string | null;
}

export interface FeedUiOutRule {
  readonly admission?: "suggest" | "inbox";
  readonly rule_id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly contains: string | null;
  readonly source_id: string | null;
  readonly source_kind: string | null;
  readonly judgment: import("@molis-ai/molis-work-contracts/platform/actions").ActionReference | null;
}

export interface FeedUiModel {
  readonly facets?: readonly { source_id: string; label: string; count: number }[];
  readonly page?: { offset: number; next_offset: number | null };
  readonly route_prefix: string;
  readonly preset: FeedUiPreset;
  readonly entries: readonly FeedUiEntry[];
  readonly sources: readonly FeedUiSource[];
  readonly out_rules: readonly FeedUiOutRule[];
  readonly source_catalog: readonly FeedUiCatalogSource[];
  readonly connector_auth: {
    readonly github: FeedUiConnectorStatus;
    readonly gmail: FeedUiConnectorStatus;
  };
  readonly primitives: FeedUiPrimitives;
  readonly active?: boolean;
  readonly error?: string | null;
}

export interface PersistedFeedDetailModel {
  readonly material_offset?: number;
  readonly material_next_offset?: number | null;
  readonly route_prefix: string;
  readonly entry_id: string;
  readonly item: FeedUiItem;
  readonly inbox_entry: AttentionEntryRecord | null;
  readonly inbox_active: boolean;
  /** Whether the promotion can run for this caller now; absent means it can. Without it the reader has no 「升格为 Goal」 button. */
  readonly promote_available?: boolean;
  readonly primitives: FeedUiPrimitives;
}

export type FeedUiSurface =
  | "directory"
  | "workbench"
  | "workbench-fragment"
  | "source-directory"
  | "source-workbench"
  | "overlays"
  | "persisted-detail"
  | "frame-block";

export const feedUiDescriptor: UiContributionDeclaration = {
  contribution_id: FEED_UI_CONTRIBUTION_ID,
  kind: "primary-page",
  navigation_id: "feed",
  label: "Feed",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
    { surface_id: "workbench-fragment", target_slot_id: "workbench.main", format: "declarative-html" },
    { surface_id: "source-directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "source-workbench", target_slot_id: "workbench.main", format: "declarative-html" },
    { surface_id: "overlays", target_slot_id: "workbench.overlay", format: "declarative-html" },
    { surface_id: "persisted-detail", target_slot_id: "workbench.main", format: "declarative-html" },
    { surface_id: "frame-block", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [
    { slot_id: "feed.detail.after-header", accepts: ["declarative-html"] },
    { slot_id: "feed.detail.after-content", accepts: ["declarative-html"] },
  ],
};

export const feedUiContribution: UiContribution<FeedUiModel | PersistedFeedDetailModel | StagePageModel<FeedStageData | FeedReaderData>> = {
  descriptor: feedUiDescriptor,
  render(request: UiRenderRequest<FeedUiModel | PersistedFeedDetailModel | StagePageModel<FeedStageData | FeedReaderData>>): string {
    const model = "entries" in request.model || "item" in request.model ? request.model : request.model.object
      ? buildFeedReaderUiModel(request.model as StagePageModel<FeedReaderData>) : buildFeedStageUiModel(request.model as StagePageModel<FeedStageData>);
    switch (request.surface as FeedUiSurface) {
      case "directory":
        return renderFeedDirectory(model as FeedUiModel);
      case "workbench":
        return renderFeedWorkbench(model as FeedUiModel);
      case "workbench-fragment":
        return renderFeedWorkbenchFragment(model as FeedUiModel);
      case "source-directory":
        return renderSourceDirectory(model as FeedUiModel);
      case "source-workbench":
        return renderSourceWorkbench(model as FeedUiModel);
      case "overlays":
        return renderFeedOverlays(model as FeedUiModel);
      case "persisted-detail":
        return renderPersistedFeedItemDetail(model as PersistedFeedDetailModel);
      case "frame-block":
        return renderFeedFrameBlock(model as PersistedFeedDetailModel);
      default:
        throw new Error(`Feed UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

function entrySourceId(entry: FeedUiEntry): string {
  return entry.item?.source_id || "";
}

export function renderFeedDirectory(_model: FeedUiModel): string {
  return "";
}

export function renderFeedWorkbench(model: FeedUiModel): string {
  const p = model.primitives;
  const assetInput = (offset: number) => p.escape(JSON.stringify({ offset: String(offset), filter: JSON.stringify({ status: "all" }) }));
  const assets = model.page ? ` data-frame-assets-input="${assetInput(0)}"${model.page.next_offset == null ? "" : ` data-frame-assets-next-input="${assetInput(model.page.next_offset)}"`}` : "";
  return `<section${assets} class="desktop-work-surface feed-workbench plugin-stage-shell" data-work-surface="feed" data-work-surface-label="Feed" data-feed-workbench data-feed-directory data-feed-preset="feed" data-feed-stage-shell data-feed-stage-directory="true" data-expanded="false" data-loaded="true" data-loaded-preset="feed"${model.active ? "" : " hidden"}>
    ${model.error ? `<div class="feed-error-state" role="alert"><strong>${uiText("feed.ui.feed-could-not-be-loaded")}</strong><p translate="no">${p.escape(model.error)}</p><button class="mw-btn mw-btn--secondary" type="button" data-retry-feed-detail>${uiText("feed.ui.retry")}</button></div>` : ""}
    ${renderFeedStageDirectory(model)}
    ${renderFeedSetupPanel(model)}
  </section>`;
}

export function renderFeedWorkbenchFragment(model: FeedUiModel): string {
  if (model.error) {
    return `<div class="feed-error-state" role="alert"><strong>${uiText("feed.ui.feed-could-not-be-loaded")}</strong><p translate="no">${model.primitives.escape(model.error)}</p><button class="mw-btn mw-btn--secondary" type="button" data-retry-feed-detail>${uiText("feed.ui.retry")}</button></div>`;
  }
  return renderFeedStageDirectory(model) + `<section data-feed-task-configs>${renderTaskConfigPanels(model)}</section>`;
}

function renderFeedSourceRail(model: FeedUiModel): string {
  const p = model.primitives;
  const groups = groupedFeedStageEntries(model);
  return `<aside class="feed-source-rail" data-feed-source-rail aria-label="${uiText("feed.ui.feed-sources")}">
    <header><span>${uiText("feed.ui.source")}</span><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-feed-add-toggle>${p.icon("plus")}${uiText("feed.ui.add-source")}</button></header>
    <button class="feed-source-nav is-selected" type="button" data-feed-task="all" data-feed-task-toggle="all" aria-current="page"><span class="feed-source-nav-icon">${p.icon("rss")}</span><span><strong>${uiText("feed.ui.all-messages")}</strong><small>${uiText("feed.ui.latest-updates-all-sources")}</small></span><em>${model.facets?.reduce((sum, row) => sum + row.count, 0) ?? model.entries.length}</em></button>
    ${groups.length ? `<div class="feed-rail-label">${uiText("feed.ui.my-sources")}</div>` : ""}
    <nav>${groups.map(group => { const source = model.sources.find(s => s.source_id === group.sourceId); const mark = feedTaskStatusMark(group.statusKind); return `<button class="feed-source-nav" type="button" data-feed-task="${p.escape(group.sourceId)}" data-feed-task-toggle="${p.escape(group.sourceId)}" data-feed-source-name="${p.escape(group.label)}" data-feed-source-summary="${p.escape(source ? [source.account_label, source.status_label, source.last_fetch_label].filter(Boolean).join(" · ") : '')}" data-feed-source-state="${p.escape(group.statusKind)}" data-feed-source-can-sync="${Boolean(source && source.enabled && source.status !== "disconnected")}"><span class="feed-source-nav-icon">${p.icon(sourceIconName(group.provider))}</span><span><strong>${p.escape(group.label)}</strong><small class="is-${mark.tone}">${renderStateRing({ state: source?.status === "disconnected" ? "disconnected" : mark.state })}${p.escape(source?.status_label || uiText.text("feed.ui.saved-messages"))}${source ? ` · ${p.escape(source.account_label || source.schedule_label)}` : ''}</small></span><em>${model.facets?.filter(row => group.sourceId === "other" ? !model.sources.some(source => source.source_id === row.source_id) : row.source_id === group.sourceId).reduce((sum, row) => sum + row.count, 0) ?? group.entries.length}</em></button>`; }).join('')}</nav>
  </aside>`;
}

/** Soft Workbench Feed: the column reads like the prototype's article directory; sources sit in one menu above it. */
function renderFeedColumnHead(model: FeedUiModel): string {
  const p = model.primitives;
  return `<header class="feed-column-head" data-feed-source-header>
    <div class="feed-column-title"><h1>Feed</h1><div class="feed-column-actions"><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-feed-current-sync hidden aria-label="${uiText("feed.ui.pull-now")}" title="${uiText("feed.ui.pull-now")}">${p.icon("refresh")}</button><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-feed-add-toggle aria-label="${uiText("feed.ui.add-source")}" title="${uiText("feed.ui.add-source")}">${p.icon("plus")}</button></div></div>
    <details class="feed-source-menu" data-feed-source-menu>
      <summary class="feed-scope" data-feed-rail-toggle aria-expanded="false" aria-label="${uiText("feed.ui.choose-source")}"><span class="feed-scope-icon" aria-hidden="true">${p.icon("rss")}</span><span class="feed-scope-copy"><strong data-feed-task-title>${uiText("feed.ui.all-messages")}</strong><small data-feed-task-summary>${uiText("feed.ui.latest-updates-all-sources")}</small></span><span class="feed-scope-caret" aria-hidden="true">${p.icon("chevron-down")}</span></summary>
      ${renderFeedSourceRail(model)}
    </details>
    <nav class="feed-source-tabs" aria-label="${uiText("feed.ui.source-workspace")}"><button type="button" data-feed-view="messages" aria-current="page">${uiText("feed.ui.messages")}</button><button type="button" data-feed-view="settings" hidden>${uiText("feed.ui.source-settings")}</button><button type="button" data-feed-view="rules" hidden>${uiText("feed.ui.capture-rules")}</button></nav>
  </header>`;
}

function renderFeedStageDirectory(model: FeedUiModel): string {
  const p = model.primitives;
  const entries = sortedFeedEntries(model);
  const total = entries.length;
  const rows = entries.map((entry) => renderFeedStageItem(entry, model)).join("");
  const details = entries.map((entry) => renderFeedStageDetailPane(entry, model)).join("");
  return `<div class="feed-column" data-feed-column>
    ${renderFeedColumnHead(model)}${renderFeedStageToolbar(model, total)}
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-feed-list><div class="feed-stage-rows" role="list" aria-label="${uiText("feed.ui.messages")}" data-feed-rows>${rows}</div><div class="feed-list-empty mw-empty" data-feed-empty${total ? " hidden" : ""}><span class="mw-empty__mark">${p.icon("rss")}</span><strong data-feed-empty-title>${uiText(model.sources.length ? "feed.ui.messages-will-appear-here-after-first-pull" : "feed.ui.no-sources-yet")}</strong><button class="mw-btn mw-btn--secondary" type="button" data-feed-clear-filters hidden>${uiText("feed.ui.show-all")}</button><button class="mw-btn mw-btn--secondary" type="button" data-feed-add-toggle>${p.icon("plus")}${uiText("feed.ui.add-source")}</button></div></div>
    <footer class="feed-column-foot">${model.page ? `<button class="mw-btn mw-btn--secondary" type="button" data-feed-page="${Math.max(0, model.page.offset - 200)}"${model.page.offset ? "" : " disabled"}>${uiText("feed.ui.previous-page")}</button><button class="mw-btn mw-btn--secondary" type="button" data-feed-page="${model.page.next_offset ?? 0}"${model.page.next_offset === null ? " disabled" : ""}>${uiText("feed.ui.next-page")}</button>` : ""}${p.icon("check")}<span data-feed-result-count>${uiText("feed.ui.count-count", { count: total })}</span></footer>
  </div>
  <div class="feed-reader-idle mw-empty" data-feed-reader-idle><span class="mw-empty__mark">${p.icon("rss")}</span><h2>${uiText("feed.ui.pick-message-read")}</h2><p>${uiText("feed.ui.opening-marks-read-keep-what-matters-save-material")}</p></div>
  <div class="plugin-stage-workspace feed-stage-workspace" data-feed-stage-workspace hidden>${details}<div class="feed-detail-empty mw-empty" data-feed-detail-empty hidden>${p.icon("rss")}<h1 data-feed-detail-empty-title>${uiText("feed.ui.loading-item")}</h1><p data-feed-detail-empty-copy hidden></p><button class="mw-btn mw-btn--secondary" type="button" data-retry-feed-detail hidden>${uiText("feed.ui.retry")}</button></div></div>`;
}

interface FeedStageGroup {
  readonly sourceId: string;
  readonly label: string;
  readonly provider: FeedUiProvider;
  readonly statusKind: FeedUiSource["status_kind"];
  readonly entries: readonly FeedUiEntry[];
}

function groupedFeedStageEntries(model: FeedUiModel): FeedStageGroup[] {
  const entries = sortedFeedEntries(model);
  const bySource = new Map<string, FeedUiEntry[]>();
  for (const entry of entries) {
    const sourceId = entrySourceId(entry);
    const list = bySource.get(sourceId);
    if (list) list.push(entry);
    else bySource.set(sourceId, [entry]);
  }
  const groups: FeedStageGroup[] = [];
  for (const source of model.sources) {
    groups.push({
      sourceId: source.source_id,
      label: source.name,
      provider: source.ui_kind,
      statusKind: source.status_kind,
      entries: bySource.get(source.source_id) ?? [],
    });
    bySource.delete(source.source_id);
  }
  const leftovers = [...bySource.values()].flat();
  if (leftovers.length || model.facets?.some(row => !model.sources.some(source => source.source_id === row.source_id))) {
    groups.push({
      sourceId: "other",
      label: uiText.text("feed.ui.other-sources"),
      provider: leftovers[0]?.provider || "other",
      statusKind: "active",
      entries: leftovers,
    });
  }
  return groups;
}

function feedTaskStatusMark(kind: FeedUiSource["status_kind"]): { state: StateRingState; tone: "ready" | "attention" } {
  return { state: kind === "active" ? "connected" : kind === "syncing" ? "syncing" : kind === "paused" ? "paused" : "verify", tone: kind === "active" ? "ready" : "attention" };
}

function renderFeedStageToolbar(model: FeedUiModel, count: number): string {
  const p = model.primitives;
  const sourceLabels = [...new Set((model.facets?.map(row => row.label) ?? model.entries.map((entry) => entry.source_label)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  const sourceOptions: readonly (readonly [string, string])[] = [["all", uiText.text("feed.ui.all-sources")], ...sourceLabels.map((label) => [label, label] as const)];
  const typeOptions = [["all", uiText.text("feed.ui.all-types")], ["github", "GitHub"], ["gmail", "Gmail"], ["rss", "RSS / Atom"], ["other", uiText.text("feed.ui.other-types")]] as const;
  const timeOptions = [["all", uiText.text("feed.ui.any-time")], ["day", uiText.text("feed.ui.last-24-hours")], ["week", uiText.text("feed.ui.last-7-days")], ["month", uiText.text("feed.ui.last-30-days")]] as const;
  const statusOptions = [["active", uiText.text("feed.ui.not-ignored")], ["all", uiText.text("feed.ui.all-states")], ["feed", uiText.text("feed.ui.feed-only")], ["saved", uiText.text("feed.ui.saved")], ["promoted", uiText.text("feed.ui.promoted")], ["archived", uiText.text("feed.ui.ignored")]] as const;
  const sortOptions = [["newest", uiText.text("feed.ui.newest-first")], ["oldest", uiText.text("feed.ui.oldest-first")], ["source", uiText.text("feed.ui.source-2")], ["title", uiText.text("feed.ui.title")]] as const;
  const filterOptions = (kind: string, options: readonly (readonly [string, string])[], selected: string) =>
    options.map(([value, label]) => `<button class="feed-filter-option" type="button" role="radio" aria-checked="${value === selected}" data-feed-filter-option="${kind}" data-feed-filter-value="${p.escape(value)}"><span>${p.escape(label)}</span>${p.icon("check")}</button>`).join("");
  const selectOptions = (options: readonly (readonly [string, string])[]) => options.map(([value, label]) => `<option value="${p.escape(value)}">${p.escape(label)}</option>`).join("");
  const quick = [["all", uiText.text("feed.ui.all")], ["unread", uiText.text("feed.ui.unread")], ["saved", uiText.text("feed.ui.saved")]] as const;
  void count;
  return `<header class="plugin-stage-chrome feed-stage-toolbar" data-feed-stage-chrome>
    <div class="feed-search-row"><label class="feed-stage-search">${p.icon("search")}<input data-feed-search type="search" placeholder="${uiText("feed.ui.search-titles-sources")}" aria-label="${uiText("feed.ui.search-messages")}"></label>
    <div class="feed-directory-tools"><div class="feed-directory-toolbar"><div class="feed-filter-control"><button class="feed-filter-trigger" type="button" data-feed-filter-trigger aria-expanded="false" aria-haspopup="true" aria-controls="feed-filter-panel" aria-label="${uiText("feed.ui.filter-sort")}">${p.icon("filter")}<span data-feed-filter-badge hidden>0</span></button><section class="feed-filter-panel" id="feed-filter-panel" data-feed-filter-panel hidden aria-label="${uiText("feed.ui.filter-sort")}"><header><strong>${uiText("feed.ui.filter-sort")}</strong><button class="mw-btn mw-btn--link" type="button" data-feed-filter-reset>${uiText("feed.ui.clear-filters")}</button></header><div class="feed-filter-section"><span>${uiText("feed.ui.source")}</span><div class="feed-filter-options">${filterOptions("source", sourceOptions, "all")}</div></div><div class="feed-filter-section"><span>${uiText("feed.ui.kind")}</span><div class="feed-filter-options">${filterOptions("type", typeOptions, "all")}</div></div><div class="feed-filter-section"><span>${uiText("feed.ui.time")}</span><div class="feed-filter-options">${filterOptions("time", timeOptions, "all")}</div></div><div class="feed-filter-section"><span>${uiText("feed.ui.status")}</span><div class="feed-filter-options">${filterOptions("status", statusOptions, "active")}</div></div><div class="feed-filter-section"><span>${uiText("feed.ui.sort")}</span><div class="feed-filter-options">${filterOptions("sort", sortOptions, "newest")}</div></div></section></div></div><select data-feed-source-filter hidden tabindex="-1" aria-hidden="true">${selectOptions(sourceOptions)}</select><select data-feed-type-filter hidden tabindex="-1" aria-hidden="true">${selectOptions(typeOptions)}</select><select data-feed-time-filter hidden tabindex="-1" aria-hidden="true">${selectOptions(timeOptions)}</select><select data-feed-status-filter hidden tabindex="-1" aria-hidden="true">${selectOptions(statusOptions)}</select><select data-feed-sort hidden tabindex="-1" aria-hidden="true">${selectOptions(sortOptions)}</select></div>
    </div>
    <div class="mw-toggle-group feed-quick-filter" data-slot="toggle-group" role="group" aria-label="${uiText("feed.ui.message-filter")}" data-feed-quick-filter>${quick.map(([value, label], index) => `<button class="mw-toggle${index === 0 ? " is-current" : ""}" type="button" data-feed-quick="${value}" aria-pressed="${index === 0}">${p.escape(label)}</button>`).join("")}</div>
  </header>`;
}

function renderFeedStageItem(entry: FeedUiEntry, model: FeedUiModel): string {
  const p = model.primitives;
  const sourceId = entrySourceId(entry);
  const visible = entry.preset === model.preset;
  return `<article class="feed-stage-item" role="listitem" data-feed-item-wrap="${p.escape(entry.entry_id)}"${visible ? "" : " hidden"}>
    <div class="feed-stage-item-line">
      <button class="feed-stage-entry directory-list-row" type="button" aria-expanded="false" aria-controls="feed-reading-${p.escape(entry.entry_id)}" tabindex="-1" data-frame-asset="feed" data-frame-subject-kind="feed_item" data-frame-asset-id="${p.escape(entry.entry_id)}" data-frame-asset-title="${p.escape(entry.title)}" data-frame-asset-caption="${p.escape(entry.summary)}" data-feed-entry-id="${p.escape(entry.entry_id)}"${entry.item_id ? ` data-feed-item-id="${p.escape(entry.item_id)}"` : ""}${entry.inbox_entry ? ` data-inbox-entry-id="${p.escape(entry.inbox_entry.entry_id)}" data-inbox-entry-revision="${entry.inbox_entry.revision}" data-inbox-subject-type="${entry.inbox_entry.subject_type}" data-inbox-reason="${entry.inbox_entry.reason}"` : ""} data-feed-entry-type="${entry.preset}" data-feed-entry-provider="${entry.provider}" data-feed-entry-attention-rank="${entry.attention_rank}" data-feed-entry-persisted="${entry.item ? "true" : "false"}" data-feed-entry-read="${entry.read ? "read" : "unread"}" data-feed-entry-source="${p.escape(entry.source_label)}" data-feed-entry-source-id="${p.escape(sourceId)}" data-feed-entry-task="${p.escape(model.sources.some((source) => source.source_id === sourceId) ? sourceId : "other")}" data-feed-entry-status="${p.escape(entry.disposition)}" data-feed-entry-time="${p.escape(entry.updated_at)}" data-feed-entry-title="${p.escape(entry.title)}" data-feed-entry-search="${p.escape(`${entry.title} ${entry.summary} ${entry.source_label}`.toLocaleLowerCase())}"><span class="feed-entry-meta"><span data-frame-drag-slot aria-hidden="true" style="display:inline-block;width:24px;height:24px;flex:0 0 24px;vertical-align:middle"></span><span class="feed-entry-provider" aria-hidden="true">${p.icon(sourceIconName(entry.provider))}</span><span class="feed-entry-source">${p.escape(entry.source_label)}</span><time datetime="${p.escape(entry.updated_at)}">${p.formatDate(entry.updated_at)}</time></span><span class="feed-stage-leading"><span class="feed-entry-copy"><strong title="${p.escape(entry.title)}">${p.escape(entry.title)}</strong><span class="feed-entry-preview">${p.escape(p.plainText(entry.summary))}</span></span></span><span class="feed-entry-foot">${renderFeedEntryStatus(entry, p)}</span></button>
    </div>
  </article>`;
}

function renderFeedStageDetailPane(entry: FeedUiEntry, model: FeedUiModel): string {
  const p = model.primitives;
  const detail = entry.detail_slot_html || "";
  return `<article class="feed-stage-detail" data-feed-entry-detail="${p.escape(entry.entry_id)}" hidden>
    <header class="plugin-stage-detail-bar feed-reader-bar" data-stage-back-only><button class="plugin-stage-back" type="button" data-feed-collapse aria-label="${uiText("feed.ui.back-feed-list")}" title="${uiText("feed.ui.back-feed-list")}"><span class="feed-back-narrow">${p.icon("chevron-right")}</span><span class="feed-back-wide">${p.icon("x")}</span></button><span class="feed-reader-source">${p.icon(sourceIconName(entry.provider))}${p.escape(entry.source_label)}</span></header>
    <div class="feed-stage-item-detail" id="feed-reading-${p.escape(entry.entry_id)}" data-feed-item-slot>${detail}</div>
  </article>`;
}

function sortedFeedEntries(model: FeedUiModel): FeedUiEntry[] {
  if (model.page) return model.entries.filter(entry => entry.preset === model.preset);
  return [...model.entries]
    .filter((entry) => entry.preset === model.preset)
    .sort((left, right) => right.attention_rank - left.attention_rank || right.updated_at.localeCompare(left.updated_at));
}

export function renderFeedFrameBlock(model: PersistedFeedDetailModel): string {
  const { item, primitives: p } = model;
  const body = p.richText(item.body || item.summary) || `<p>${uiText("feed.ui.message-has-no-displayable-body")}</p>`;
  const itemUrl = p.safeExternalHref(item.url);
  const meta = [item.source_label || item.source_kind, item.source_updated_at ? p.formatDate(item.source_updated_at) : ""]
    .filter(Boolean)
    .map((part) => p.escape(part))
    .join(" · ");
  return `<article class="frame-reading" data-frame-reading="feed" data-feed-detail="${p.escape(model.entry_id)}">
    ${meta ? `<p class="frame-reading-meta">${meta}</p>` : ""}
    <div class="feed-rich-content">${body}</div>
    ${itemUrl ? `<p class="frame-reading-link"><a href="${p.escape(itemUrl)}" target="_blank" rel="noopener noreferrer">${uiText("feed.ui.open-original")}</a></p>` : ""}
  </article>`;
}

export function renderPersistedFeedItemDetail(model: PersistedFeedDetailModel, selected = true): string {
  const { item, primitives: p } = model;
  const itemUrl = p.safeExternalHref(item.url);
  const body = p.richText(item.body || item.summary) || `<p>${uiText("feed.ui.message-has-no-displayable-body")}</p>`;
  const effectiveDisposition = item.disposition === "inbox" ? "feed" : item.disposition;
  const actions = renderItemActions(item, model.inbox_active, model.promote_available !== false, p);
  const destination = destinationCopy(model.inbox_active ? "inbox" : effectiveDisposition, p);
  const materials = item.materials.length ? item.materials.map((material) => {
    const href = p.safeExternalHref(material.canonical_url);
    return `<li><span>${p.icon("link")}</span><div><strong>${p.escape(material.title || material.source_name)}</strong><small>${p.escape([material.source_name, material.published_at ? p.formatDate(material.published_at) : ""].filter(Boolean).join(" · "))}</small>${material.preview ? `<p>${p.escape(material.preview)}</p>` : ""}${material.content ? `<details class="feed-material-content"><summary>${uiText("feed.ui.view-retained-full-content")}</summary><div>${p.escape(material.content)}</div></details>` : material.content_ref && !material.content_available ? `<small class="feed-material-unavailable">${uiText("feed.ui.full-content-currently-unavailable")}</small>` : ""}</div>${href ? `<a href="${p.escape(href)}" target="_blank" rel="noopener noreferrer" aria-label="${uiText("feed.ui.open-source-material")}">${p.icon("arrow")}</a>` : ""}</li>`;
  }).join("") : `<li class="feed-material-empty">${p.icon("archive")}<p>${uiText("feed.ui.item-has-no-attached-materials-its-body-source")}</p></li>`;
  return `<article class="feed-detail" data-feed-detail="${p.escape(model.entry_id)}" data-feed-detail-item-type="feed" data-feed-detail-read="${item.read_at ? "read" : "unread"}"${selected ? "" : " hidden"}>
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span class="mw-status mw-status--progress">Feed</span><span class="mw-status mw-status--quiet">${p.escape(item.source_label || item.source_kind)}</span><span class="mw-status mw-status--${item.read_at ? "quiet" : "attention"}" data-mw-state="${item.read_at ? "read" : "unread"}" data-feed-read-state>${item.read_at ? uiText("feed.ui.read") : uiText("feed.ui.unread")}</span><span class="mw-status mw-status--${model.inbox_active ? "attention" : "quiet"}"${model.inbox_active || ["saved", "archived"].includes(effectiveDisposition) ? ` data-mw-state="${model.inbox_active ? "answer" : effectiveDisposition === "saved" ? "material" : "archived"}"` : ""}>${p.escape(dispositionLabel(model.inbox_active ? "inbox" : effectiveDisposition, p))}</span></div><h1>${p.escape(item.title || uiText.text("feed.ui.untitled-message"))}</h1>${item.summary ? `<p>${p.escape(p.plainText(item.summary))}</p>` : ""}<div class="feed-detail-meta">${item.author ? `<span>${p.icon("user")}${p.escape(item.author)}</span>` : ""}<time datetime="${p.escape(item.source_updated_at)}">${p.formatDate(item.source_updated_at)}</time>${item.source_id ? `<button class="mw-btn mw-btn--link" type="button" data-open-source-record="${p.escape(item.source_id)}">${p.icon("settings")}${uiText("feed.ui.view-source")}</button>` : ""}${itemUrl ? `<a href="${p.escape(itemUrl)}" target="_blank" rel="noopener noreferrer">${uiText("feed.ui.open-original")}${p.icon("arrow")}</a>` : ""}</div></header>
    <section class="feed-detail-body"><h2>${uiText("feed.ui.content")}</h2><div class="feed-rich-content">${body}</div></section>
    ${item.tags.length ? `<section class="feed-detail-tags" aria-label="${uiText("feed.ui.tags")}">${item.tags.map((tag) => `<span>${p.escape(tag)}</span>`).join("")}</section>` : ""}
    ${item.materials.length || model.material_offset ? `<details class="feed-materials"${model.material_offset ? " open" : ""}><summary>${p.icon("link")}<span>${uiText("feed.ui.attachments")}</span><small>${uiText("feed.ui.count-count-2", { count: item.materials.length })}</small>${p.icon("chevron-down")}</summary><ul>${materials}</ul>${model.material_offset !== undefined ? `<button type="button" class="mw-btn mw-btn--secondary" data-feed-material-page="${Math.max(0, model.material_offset - 200)}"${model.material_offset ? "" : " disabled"}>${uiText("feed.ui.previous-page")}</button><button type="button" class="mw-btn mw-btn--secondary" data-feed-material-page="${model.material_next_offset ?? 0}"${model.material_next_offset == null ? " disabled" : ""}>${uiText("feed.ui.next-page")}</button>` : ""}</details>` : ""}
    <footer class="feed-reader-footer"><section class="feed-destination-strip" data-destination-state="${p.escape(model.inbox_active ? "inbox" : effectiveDisposition)}"><span>${p.icon("rss")}${uiText("feed.ui.current-destination")}</span><strong>${p.escape(destination[0])}</strong><small>${p.escape(destination[1])}</small></section><div class="feed-detail-actions" data-feed-actions>${actions}</div><p class="feed-action-status" data-feed-action-status role="status" hidden></p></footer>
  </article>`;
}

export function renderSourceDirectory(model: FeedUiModel): string {
  const p = model.primitives;
  const rows = model.sources.map((source, index) => `<button class="source-list-item directory-list-row${index === 0 ? " is-selected" : ""}" type="button" role="option" aria-selected="${index === 0}" tabindex="${index === 0 ? "0" : "-1"}" data-source-entry-id="${p.escape(source.source_id)}" data-source-kind="${p.escape(source.ui_kind)}" data-source-status="${p.escape(source.status_kind)}"><span class="source-list-icon">${p.icon(sourceIconName(source.ui_kind))}</span><span class="source-list-copy"><span><em>${p.escape(source.type_label)}</em></span><strong>${p.escape(source.name)}</strong><p>${p.escape(source.account_label || uiText.text("feed.ui.public-source"))}</p><small>${p.escape(`${uiText.text("feed.ui.last")} ${source.last_fetch_label} · ${uiText.text("feed.ui.next")} ${source.next_fetch_label}`)}</small></span><span class="source-list-state directory-row-state" data-source-status="${p.escape(source.status_kind)}" data-mw-state="${source.status === "disconnected" ? "disconnected" : feedTaskStatusMark(source.status_kind).state}">${p.escape(source.status_label)}</span></button>`).join("");
  return `<section class="desktop-directory-panel source-directory" data-directory-panel="sources" data-source-directory hidden><header class="desktop-directory-heading source-directory-heading"><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-directory-back aria-label="${uiText("feed.ui.go-up-one-level")}">${p.icon("back")}</button><span><strong>${uiText("feed.ui.source")}</strong><small>${uiText("feed.ui.accounts-connected-sources-pull-schedules")}</small></span><button class="mw-btn mw-btn--ghost mw-btn--icon-only source-add-trigger" type="button" data-feed-sources-open aria-label="${uiText("feed.ui.add-source")}">${p.icon("plus")}</button></header><div class="source-directory-tools" data-directory-list-actions><details class="source-filter-menu"><summary aria-label="${uiText("feed.ui.source-filters")}" title="${uiText("feed.ui.source-filters")}">${p.icon("filter")}</summary><div class="mw-toggle-group source-filter-row" data-slot="toggle-group" role="group" aria-label="${uiText("feed.ui.source-filters")}"><button class="mw-toggle is-current is-active" type="button" data-source-filter="all" aria-pressed="true">${uiText("feed.ui.all")}</button><button class="mw-toggle" type="button" data-source-filter="account" aria-pressed="false">${uiText("feed.ui.accounts")}</button><button class="mw-toggle" type="button" data-source-filter="public" aria-pressed="false">${uiText("feed.ui.public-feeds")}</button><button class="mw-toggle" type="button" data-source-filter="attention" aria-pressed="false">${uiText("feed.ui.needs-attention")}</button></div></details><button class="mw-btn mw-btn--ghost mw-btn--icon-only source-mobile-add" type="button" data-feed-sources-open aria-label="${uiText("feed.ui.add-source")}">${p.icon("plus")}</button></div><div class="source-list" data-source-list role="listbox" aria-label="${uiText("feed.ui.source-list")}">${rows}<div class="feed-list-empty source-list-empty" data-source-empty hidden>${p.icon("search")}<strong>${uiText("feed.ui.no-sources-match-these-filters")}</strong><button class="mw-btn mw-btn--link" type="button" data-source-filter-reset>${uiText("feed.ui.clear-filters")}</button></div></div><footer class="feed-directory-footer"><span data-source-result-count>${uiText("feed.ui.count-count-3", { count: model.sources.length })}</span></footer></section>`;
}

export function renderSourceWorkbench(model: FeedUiModel): string {
  const p = model.primitives;
  const panels = model.sources.map((source, index) => renderSourceDetail(source, index === 0, model)).join("");
  return `<section class="desktop-work-surface source-workbench" data-work-surface="sources" data-work-surface-label="${uiText("feed.ui.source")}" data-source-workbench hidden>${panels}<div class="feed-detail-empty" data-source-detail-empty${panels ? " hidden" : ""}>${p.icon("settings")}<h1>${panels ? uiText("feed.ui.select-source") : uiText("feed.ui.no-manageable-sources-yet")}</h1>${panels ? "" : `<button class="mw-btn mw-btn--primary" type="button" data-feed-sources-open>${p.icon("plus")}${uiText("feed.ui.add-source")}</button>`}</div></section>`;
}

function renderSourceRuns(source: FeedUiSource, p: FeedUiModel["primitives"]): string {
  return source.runs.length ? `<ol class="source-run-ledger">${source.runs.map((run) => {
    const state = run.phase === "running" ? "running" : run.phase === "interrupted" || run.error_code ? "error" : "complete";
    const ringState = run.phase === "running" ? "syncing" : run.phase === "interrupted" ? "interrupted" : run.error_code ? "failed" : "done";
    const title = run.phase === "running" ? uiText.text("feed.ui.pulling") : run.phase === "interrupted" ? uiText.text("feed.ui.pull-interrupted") : run.error_code ? uiText.text("feed.ui.pull-failed") : uiText.text("feed.ui.pull-completed");
    const summary = run.phase === "running" ? uiText.text("feed.ui.started-waiting-source-answer") : run.error_code ? uiText.text("feed.ui.error-code-safe-retry", { code: run.error_code }) : uiText.text("feed.ui.created-new-deduped-deduplicated", { created: run.created_count, deduped: run.deduped_count });
    return `<li data-run-state="${state}"><span>${renderStateRing({ state: ringState })}</span><div><strong>${title}</strong><p>${p.escape(summary)}</p></div><time>${p.formatDate(run.completed_at || run.started_at)}</time></li>`;
  }).join("")}</ol>` : `<div class="source-panel-empty">${p.icon("waiting")}<strong>${uiText("feed.ui.no-run-history-yet")}</strong></div>`;
}

function connectorSettingsHref(model: FeedUiModel, connectorId: string): string {
  const params = new URLSearchParams({ connector: connectorId });
  const project = /^\/projects\/([^/]+)$/u.exec(model.route_prefix)?.[1];
  if (project) params.set("project", decodeURIComponent(project));
  return `/settings/connectors?${params.toString()}`;
}

function renderSourceConnection(model: FeedUiModel, source: FeedUiSource): string {
  if (!["gmail", "github", "connector"].includes(source.ui_kind)) return "";
  const p = model.primitives;
  const service = source.ui_kind === "connector" ? source.kind : source.ui_kind;
  // The account is the person's binding on the platform: the source is the record of the service's `per_record` slot (T-121). The page
  // names the plugin, the slot and the record; the Host finds the installation, and the account list is the person's own.
  const slot = JSON.stringify({ plugin_id: FEED_PLUGIN_ID, slot_id: service, service_id: service, record_key: source.source_id });
  return `<div data-feed-connection-service="${p.escape(service)}" data-plugin-record-slot="${p.escape(slot)}"${source.status === "disconnected" ? " data-feed-source-disconnected" : ""}><label><span>${uiText("feed.ui.account-connection")}</span><select data-plugin-record-slot-account disabled><option value="" selected>${p.escape(source.account_label || uiText.text("feed.ui.loading-account-connections"))}</option></select></label><p data-feed-connection-status role="status">${uiText("feed.ui.connectors-manages-authorization-choose-connection-use-here")}</p><a class="mw-btn mw-btn--link" href="${p.escape(connectorSettingsHref(model, service))}">${uiText("feed.ui.manage-account-connectors")}</a></div>`;
}

function renderTaskConfigPanels(model: FeedUiModel): string {
  const p = model.primitives;
  return model.sources.map((source) => {
    const id = p.escape(source.source_id);
    const interval = source.schedule.mode === "interval" ? source.schedule.interval_minutes : 60;
    const scope = typeof source.config.scope === "string" ? source.config.scope : source.scope_label;
    return `<section data-feed-task-config="${id}" data-source-detail="${id}" hidden>
      <div data-feed-config-section="settings"><div class="feed-task-health"><strong>${p.escape(source.status_label)}</strong><span>${p.escape(source.last_fetch_label)} · ${source.item_count} ${uiText("feed.ui.messages-2")}</span></div>
      <label><span>${uiText("feed.ui.source-name")}</span><input data-source-config-field="name" required maxlength="80" value="${p.escape(source.name)}"></label>
      ${renderSourceConnection(model, source)}
      <label><span>${uiText("feed.ui.source-address-account")}</span><input ${source.editable_endpoint ? 'data-source-config-field="feed_url"' : 'readonly'} value="${p.escape(source.configured_endpoint || source.account_label || source.name)}"></label>
      <details class="feed-task-extra"><summary>${uiText("feed.ui.scope-notes")}</summary><label><span>${uiText("feed.ui.description")}</span><textarea data-source-config-field="description" rows="2">${p.escape(source.description)}</textarea></label><label><span>${uiText("feed.ui.pull-scope")}</span>${source.ui_kind === "gmail" ? `<select data-source-config-field="scope">${source.scope_options.map(option=>`<option value="${p.escape(option.value)}"${option.value===scope?' selected':''}>${p.escape(option.label)}</option>`).join('')}</select>` : `<input readonly value="${p.escape(scope)}">`}</label></details>
      </div><div data-feed-config-section="rules" hidden>${renderOutRulesSection(model, source)}</div><div data-feed-config-section="settings">

      <details class="feed-task-extra" data-feed-plan-region open><summary>${uiText("feed.ui.pull-schedule")}</summary><p>${uiText("feed.ui.save-pull-schedule-separately-changes-apply-next-pull")}</p><label><span>${uiText("feed.ui.how-pull")}</span><select data-source-schedule-mode><option value="manual"${source.schedule.mode==='manual'?' selected':''}>${uiText("feed.ui.pull-manually")}</option><option value="interval"${source.schedule.mode==='interval'?' selected':''}>${uiText("feed.ui.scheduled-pulls")}</option></select></label><label${source.schedule.mode==='manual'?' hidden':''}><span>${uiText("feed.ui.interval-minutes")}</span><input type="number" min="5" max="10080" value="${interval}" data-source-schedule-interval></label><label class="check-row"${source.schedule.mode==='manual'?' hidden':''}><input type="checkbox" data-source-schedule-enabled${source.schedule.mode==='interval'&&source.schedule.enabled?' checked':''}><span>${uiText("feed.ui.pull-schedule-2")}</span></label><div class="feed-plan-actions"><button class="mw-btn mw-btn--secondary" type="button" data-source-schedule-reset>${uiText("feed.ui.discard-changes")}</button><button class="mw-btn mw-btn--primary" type="button" data-source-schedule-save data-source-id="${id}">${uiText("feed.ui.save-pull-schedule")}</button></div></details>
      <div class="feed-task-controls"><button class="mw-btn mw-btn--primary" type="button" data-feed-source-sync="${id}"${!source.enabled||source.status==='disconnected'?' disabled':''}>${uiText("feed.ui.pull-now")}</button><button class="mw-btn mw-btn--secondary" type="button" data-feed-source-toggle="${id}" data-feed-source-enabled="${source.enabled}">${source.enabled?uiText("feed.ui.pause-source"):uiText("feed.ui.resume-source")}</button></div>
      <details class="feed-task-extra"><summary>${uiText("feed.ui.last-pull")}</summary>${renderSourceRuns(source, p)}</details><details class="feed-task-extra"><summary>${uiText("feed.ui.remove-source")}</summary><p>${uiText("feed.ui.pulling-stops-messages-already-collected-their-history-kept")}</p><button class="mw-btn mw-btn--danger-outline" type="button" data-source-delete="retain_history" data-source-id="${id}">${uiText("feed.ui.remove-task-keep-history")}</button></details><p data-source-action-status role="status" hidden></p></div>
    </section>`;
  }).join("");
}

export function renderFeedOverlays(_model: FeedUiModel): string { return ""; }

function renderFeedSetupPanel(model: FeedUiModel): string {
  const p = model.primitives;
  const catalogOptions = model.source_catalog.map((source) => `<option value="${p.escape(source.id)}">${p.escape(`${source.category_label} · ${source.name}`)}</option>`).join("");
  const connectorLabel = (status: FeedUiConnectorStatus, kind: "github" | "gmail") => status.bound
    ? uiText.text(kind === "gmail" ? "feed.ui.credentials-saved" : "feed.ui.connected") : uiText.text("feed.ui.disconnected");
  const choices = [
    ["research_library", "book", "feed.add-source.research-library", "feed.add-source.published-research"],
    ["custom_rss", "rss", "feed.add-source.rss-atom", "feed.add-source.paste-url"],
    ...(model.source_catalog.length ? [["rss", "list", "feed.add-source.feed-directory", "feed.add-source.existing-feed"] as const] : []),
    ["web_query", "search", "feed.add-source.web-search", "feed.add-source.keywords"],
    ["youtube_channel", "play", "feed.add-source.youtube", "feed.add-source.channel-id"],
    ["github", "tree", "feed.add-source.github", "feed.add-source.unread-notifications"],
    ["gmail", "message", "feed.add-source.gmail", "feed.add-source.mail-scope"],
  ];
  const sourceChoiceRows = choices.map(([kind, icon, title, hint]) => `<button type="button" class="feed-source-choice" data-feed-choose-kind="${kind}"><span class="feed-source-choice__mark" aria-hidden="true">${p.icon(icon)}</span><strong>${uiText(title)}</strong><small>${uiText(hint)}</small></button>`).join("");
  const taskPanels = renderTaskConfigPanels(model);
  return `<section class="feed-setup-panel" data-feed-sources-dialog aria-labelledby="feed-source-dialog-title" hidden><div class="feed-task-dialog-shell mw-form">
    <header class="mw-form__header"><div><h2 id="feed-source-dialog-title">${uiText("feed.ui.add-source")}</h2><p data-feed-setup-description>${uiText("feed.ui.choose-source-2")}</p></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-feed-sources-close aria-label="${uiText("feed.ui.close")}">${p.icon("x")}</button></header>
    <div class="feed-task-dialog-body mw-form__body">
      <section data-feed-source-choices>${sourceChoiceRows}</section>
      <section data-feed-source-setup hidden><button class="mw-btn mw-btn--link feed-setup-back" type="button" data-feed-setup-back>${p.icon("back")}${uiText("feed.ui.choose-another-source")}</button>
        <form id="feed-add-task-form" data-feed-add-form hidden><label><span>${uiText("feed.ui.source-name")} <small>${uiText("feed.ui.optional")}</small></span><input data-feed-add-name maxlength="80" placeholder="${uiText("feed.ui.example-product-notes")}"></label>
          <div data-feed-setup-kind="research_library" hidden><label><span>${uiText("feed.ui.git-hub-repository")}</span><input data-feed-source-value="research_library" value="molis-ai/research-library" required></label><label><span>${uiText("feed.ui.research-source-id")}</span><input data-feed-research-source value="twitter-ai-observation" required></label><small>${uiText("feed.ui.read-published-research-original-links-versions-usage-limits")}</small></div>
          <label data-feed-setup-kind="custom_rss" hidden><span>${uiText("feed.ui.feed-address")}</span><input data-feed-source-value="custom_rss" type="url" placeholder="https://example.com/feed.xml" required><small>${uiText("feed.ui.enter-rss-atom-address-site-provides")}</small></label>
          <label data-feed-setup-kind="rss" hidden><span>${uiText("feed.ui.choose-feed")}</span><select data-feed-rss-definition>${catalogOptions}</select></label>
          <label data-feed-setup-kind="web_query" hidden><span>${uiText("feed.ui.what-do-want-follow")}</span><input data-feed-source-value="web_query" placeholder="${uiText("feed.ui.example-ai-product-design")}" required></label>
          <label data-feed-setup-kind="youtube_channel" hidden><span>${uiText("feed.ui.tube-channel-id")}</span><input data-feed-source-value="youtube_channel" placeholder="UC…" required><small>${uiText("feed.ui.copy-channel-id-tube-channel-s-advanced-settings")}</small></label>
          <label><span>${uiText("feed.ui.pull-frequency")}</span><select data-feed-create-frequency><option value="0">${uiText("feed.ui.pull-manually")}</option><option value="60">${uiText("feed.ui.hourly")}</option><option value="360">${uiText("feed.ui.every-6-hours")}</option><option value="1440">${uiText("feed.ui.every-day")}</option></select><small>${uiText("feed.ui.scheduled-pulls-need-molis-work-local-service-stay")}</small></label>

          <p class="form-error" data-feed-add-error role="alert" hidden></p>
        </form>
        <article class="feed-connector-card" data-feed-setup-kind="github" hidden><div><strong>GitHub</strong><em>${connectorLabel(model.connector_auth.github, "github")}</em></div><p>${uiText("feed.ui.git-hub-accounts-managed-settings-connectors-feed-uses")}</p><form class="feed-account-source" data-feed-add-account="github"><label><span>${uiText("feed.ui.source-name")}</span><input data-feed-account-name required maxlength="80" value="GitHub"></label><button class="mw-btn mw-btn--primary" type="submit">${uiText("feed.ui.create-source")}</button></form><a class="mw-btn mw-btn--link" href="${p.escape(connectorSettingsHref(model, "github"))}">${uiText("feed.ui.open-connectors")}</a></article><article class="feed-connector-card" data-feed-setup-kind="gmail" hidden><div><strong>Gmail</strong><em>${connectorLabel(model.connector_auth.gmail, "gmail")}</em></div><p>${uiText("feed.ui.authorize-gmail-connectors-create-source-then-choose-its")}</p><form class="feed-account-source" data-feed-add-account="gmail"><label><span>${uiText("feed.ui.source-name")}</span><input data-feed-account-name required maxlength="80" value="Gmail"></label><button class="mw-btn mw-btn--primary" type="submit">${uiText("feed.ui.create-source")}</button></form><a class="mw-btn mw-btn--link" href="${p.escape(connectorSettingsHref(model, "gmail"))}">${uiText("feed.ui.open-connectors")}</a></article>
      </section>
      <section data-feed-task-configs hidden>${taskPanels}</section>
      <p class="form-error" data-feed-source-error role="alert" hidden></p><p class="feed-source-progress" data-feed-source-progress role="status" hidden></p>
    </div><footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-feed-sources-close>${uiText("feed.ui.cancel")}</button><button class="mw-btn mw-btn--primary" type="button" data-feed-config-submit data-source-config-save hidden>${uiText("feed.ui.save-source-details")}</button><button class="mw-btn mw-btn--primary" type="button" form="feed-add-task-form" data-feed-source-register="custom_rss" hidden>${uiText("feed.ui.add-source")}</button><a class="mw-btn mw-btn--primary" href="${p.escape(connectorSettingsHref(model, "github"))}" data-feed-footer-kind="github" hidden>${uiText("feed.ui.open-connectors")}</a><a class="mw-btn mw-btn--primary" href="${p.escape(connectorSettingsHref(model, "gmail"))}" data-feed-footer-kind="gmail" hidden>${uiText("feed.ui.open-connectors")}</a></footer>
  </div></section>`;
}

function renderOutRulesSection(model: FeedUiModel, source: FeedUiSource): string {
  const p = model.primitives;
  const id = p.escape(source.source_id);
  const rules = model.out_rules.filter((rule) => rule.source_id === source.source_id);
  const rows = rules.length
    ? rules.map((rule) => {
      const judgmentName = rule.judgment ? uiText.text("feed.ui.judgment-bound") : null;
      const filter = [
        rule.contains ? uiText.text("feed.ui.contains-contains", { contains: rule.contains }) : uiText.text("feed.ui.all-new-messages-source"),
        judgmentName ?? "",
        uiText.text(rule.admission === "inbox" ? "feed.ui.automatically-add-matches-inbox-review-cases-labeled" : "feed.ui.suggest-only"),
        rule.source_kind ? uiText.text("feed.ui.source-type-kind", { kind: rule.source_kind }) : "",
      ].filter(Boolean).join(" · ");
      return `<article class="feed-capture-rule" data-feed-out-rule-row="${p.escape(rule.rule_id)}"><div class="feed-capture-rule-copy"><strong>${p.escape(rule.name)}</strong><p>${p.escape(filter)}</p><small data-feed-rule-binding-status>${rule.enabled ? uiText(rule.judgment ? "feed.ui.enabled-checking-judgment-capability" : "feed.ui.enabled") : uiText("feed.ui.disabled")}</small></div><div class="feed-capture-rule-actions"><button class="mw-btn mw-btn--ghost" type="button" data-feed-out-rule-toggle="${p.escape(rule.rule_id)}" data-enabled="${rule.enabled ? "true" : "false"}">${rule.enabled ? uiText("feed.ui.disable") : uiText("feed.ui.active")}</button><button class="mw-btn mw-btn--danger-outline" type="button" data-feed-out-rule-delete="${p.escape(rule.rule_id)}">${uiText("feed.ui.delete")}</button></div></article>`;
    }).join("")
    : `<p class="feed-source-empty">${uiText("feed.ui.no-capture-rules-yet-add-one-below-right")}</p>`;
  const form = `<section class="feed-rule-composer" data-feed-rule-composer>
    <h3>${uiText("feed.ui.new-capture-rule")}</h3><p>${uiText("feed.ui.describe-what-matters-then-preview-which-messages-match")}</p>
    <div class="feed-rule-modes" role="group" aria-label="${uiText("feed.ui.match")}"><button type="button" data-feed-rule-mode="keyword" aria-pressed="true">${uiText("feed.ui.keyword")}</button><button type="button" data-feed-rule-mode="natural" aria-pressed="false">${uiText("feed.ui.describe-words")}</button><button type="button" data-feed-rule-mode="existing" aria-pressed="false">${uiText("feed.ui.reuse-rule")}</button></div>
    <label><span>${uiText("feed.ui.rule-name")}</span><input data-feed-out-rule-name maxlength="80" placeholder="${uiText("feed.ui.e-g-product-feedback-follow-up")}"></label>
    <label data-feed-rule-field="keyword"><span>${uiText("feed.ui.message-contains")}</span><input data-feed-out-rule-contains maxlength="200" placeholder="${uiText("feed.ui.e-g-bug")}"><small>${uiText("feed.ui.match-phrase-title-summary-tags-body")}</small></label>
    <label data-feed-rule-field="natural" hidden><span>${uiText("feed.ui.which-messages-deserve-attention")}</span><textarea data-feed-rule-instructions rows="4" maxlength="4000" placeholder="${uiText("feed.ui.e-g-reports-login-problems-failed-payments-lost")}"></textarea><small>${uiText("feed.ui.ai-judges-messages-description-trial-runs-use-model")} <a href="/capabilities/connections?connector=typesafe">${uiText("feed.ui.manage-ai-connection")}</a></small></label>
    <div data-feed-rule-field="existing" hidden>${renderCaptureJudgmentSelect(model, "data-feed-out-rule-function-key")}<p>${uiText("feed.ui.reuse-published-rule-preview-its-results-here")}</p></div>
    ${renderAdmissionSelect(model, "data-feed-out-rule-admission")}
    <div class="feed-rule-preview" data-feed-rule-preview hidden aria-live="polite"></div>
    <div class="feed-rule-actions"><button class="mw-btn mw-btn--secondary" type="button" data-feed-rule-preview-run>${p.icon("play")}${uiText("feed.ui.preview-recent-messages")}</button><button class="mw-btn mw-btn--primary" type="button" data-feed-out-rule-create>${uiText("feed.ui.save-enable")}</button></div>
    <div class="feed-rule-band" data-feed-rule-band role="status"></div>${renderRuleKeep(p)}
    <p class="feed-rule-note">${uiText("feed.ui.preview-leaves-inbox-unchanged-enabled-rules-apply-new")}</p><p data-feed-rule-status role="status" hidden></p>
  </section>`;
  return `<section class="feed-rules-panel" data-feed-out-rules="${id}"><div class="feed-section-heading"><h3>${uiText("feed.ui.capture-rules-2")}</h3><span>${uiText("feed.ui.count-count-4", { count: rules.length })}</span></div><p>${uiText("feed.ui.matching-messages-saved-exact-versions-choose-whether-add")}</p><div class="feed-source-list">${rows}</div>${form}${rules.length ? `<details class="feed-task-extra"><summary>${uiText("feed.ui.apply-existing-messages")}</summary><p>${uiText("feed.ui.apply-enabled-rules-latest-20-messages-may-add")}</p><button class="mw-btn mw-btn--secondary" type="button" data-feed-out-rules-evaluate="${id}">${uiText("feed.ui.run-current-rules-latest-20-messages")}</button></details>` : ''}</section>`;
}

function renderAdmissionSelect(_model: FeedUiModel, attr: string): string {
  return `<label><span>${uiText("feed.ui.treatment")}</span><select ${attr}><option value="suggest">${uiText("feed.ui.suggest-manual-review")}</option><option value="inbox">${uiText("feed.ui.automatically-add-matches-inbox")}</option></select></label>`;
}

function renderCaptureJudgmentSelect(_model: FeedUiModel, attr: string): string {
  return `<label><span>${uiText("feed.ui.judgment")}</span><select ${attr}><option value="">${uiText("feed.ui.choose-judgment")}</option></select></label>`;
}

function renderSourceDetail(source: FeedUiSource, selected: boolean, model: FeedUiModel): string {
  const p = model.primitives;
  const sourceId = p.escape(source.source_id);
  const scheduleMode = source.schedule.mode;
  const scheduleEnabled = scheduleMode === "interval" && source.schedule.enabled;
  const intervalMinutes = scheduleMode === "interval" ? source.schedule.interval_minutes : 60;
  const canSync = source.enabled && source.status !== "paused" && source.status !== "disconnected";
  const connector = source.sync_kind === "github" || source.sync_kind === "gmail" || source.sync_kind === "connector";
  const scope = typeof source.config.scope === "string" ? source.config.scope : source.scope_label;
  const scopeField = source.ui_kind === "gmail"
    ? `<label><span>${uiText("feed.ui.pull-scope")}</span><select data-source-config-field="scope">${source.scope_options.map((option) => `<option value="${p.escape(option.value)}"${scope === option.value ? " selected" : ""}>${p.escape(option.label)} · ${p.escape(option.value)}</option>`).join("")}</select><small class="source-config-help">${uiText("feed.ui.initial-incremental-syncs-use-same-range-full-mailbox")}</small></label>`
    : `<label><span>${uiText("feed.ui.pull-scope")}</span><textarea rows="3" readonly>${p.escape(scope)}</textarea></label>`;
  const runs = renderSourceRuns(source, p);
  const messages = source.messages.length ? `<ul>${source.messages.map((message) => `<li>${p.icon("rss")}<span><strong>${p.escape(message)}</strong><small>${p.escape(source.name)}</small></span></li>`).join("")}</ul>` : `<div class="source-panel-empty">${p.icon("archive")}<strong>${uiText("feed.ui.no-source-messages-yet")}</strong></div>`;
  return `<article class="source-detail" data-source-detail="${sourceId}" data-real-source-id="${sourceId}"${selected ? "" : " hidden"}><header class="source-detail-header"><div class="source-detail-identity"><span class="source-detail-mark">${p.icon(sourceIconName(source.ui_kind))}</span><div><div class="source-detail-labels"><span>${p.escape(source.type_label)}</span><em>${uiText("feed.ui.real-local-source")}</em></div><h1>${p.escape(source.name)}</h1><p>${p.escape(source.description)}</p></div></div><div class="source-detail-health" data-source-status="${p.escape(source.status_kind)}"><strong data-source-health-label data-mw-state="${source.status === "disconnected" ? "disconnected" : feedTaskStatusMark(source.status_kind).state}">${p.escape(source.status_label)}</strong><small>${uiText("feed.ui.database-run-history")}</small></div></header><nav class="mw-tabs source-detail-tabs" data-overflow-fade role="tablist" aria-label="${uiText("feed.ui.source-details")}"><button class="is-active" type="button" role="tab" aria-selected="true" data-source-detail-tab="overview">${uiText("feed.ui.overview")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="config">${uiText("feed.ui.config")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="schedule">${uiText("feed.ui.pull-schedule")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="messages">${uiText("feed.ui.source-messages")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="runs">${uiText("feed.ui.run-status")}</button></nav><div class="source-detail-panels"><section class="source-detail-panel source-detail-panel--overview" data-source-detail-panel="overview"><section class="source-now"><div><h2>${source.status_kind === "attention" ? uiText("feed.ui.needs-attention-2") : source.status_kind === "syncing" ? uiText("feed.ui.pulling-new-messages") : source.status_kind === "paused" ? uiText("feed.ui.source-paused") : uiText("feed.ui.source-running-normally")}</h2><p>${uiText("feed.ui.manual-pulls-background-schedules-share-same-idempotent-run")}</p></div><button class="mw-btn mw-btn--primary" type="button" data-source-runtime-action="sync" data-source-id="${sourceId}"${canSync ? "" : " disabled"}>${p.icon("refresh")}${uiText("feed.ui.pull-now")}</button><p data-source-action-status role="status" hidden></p></section><section class="source-overview-section"><header class="source-panel-heading"><h2>${uiText("feed.ui.overview")}</h2><p>${uiText("feed.ui.accounts-connected-sources-pull-schedules")}</p></header><dl class="source-overview-ledger"><div><dt>${uiText("feed.ui.account-source")}</dt><dd>${p.escape(source.account_label || uiText.text("feed.ui.public-source"))}</dd></div><div><dt>${uiText("feed.ui.connection-status")}</dt><dd>${p.escape(source.status_label)}</dd></div><div><dt>${uiText("feed.ui.last-pull-2")}</dt><dd>${p.escape(source.last_fetch_label)}</dd></div><div><dt>${uiText("feed.ui.next-pull")}</dt><dd>${p.escape(source.next_fetch_label)}</dd></div><div><dt>${uiText("feed.ui.pulled-messages")}</dt><dd>${source.item_count}</dd></div><div><dt>${uiText("feed.ui.scope")}</dt><dd>${p.escape(source.scope_label)}</dd></div>${source.protocol_status ? `<div><dt>${uiText("feed.ui.conditional-request")}</dt><dd>${p.escape(source.protocol_status)}</dd></div>` : ""}</dl></section><div class="source-runtime-actions"><button class="mw-btn mw-btn--secondary" type="button" data-source-runtime-action="${source.enabled ? "pause" : "resume"}" data-source-id="${sourceId}">${source.enabled ? uiText("feed.ui.pause-source") : uiText("feed.ui.resume-source")}</button>${connector ? `<a class="mw-btn mw-btn--secondary" href="${p.escape(connectorSettingsHref(model, source.kind))}">${uiText("feed.ui.manage-account-connection")}</a><button class="mw-btn mw-btn--secondary" type="button" data-source-runtime-action="disconnect" data-source-id="${sourceId}">${uiText("feed.ui.disconnect-account")}</button>` : ""}<details><summary>${uiText("feed.ui.delete-source")}</summary><p>${uiText("feed.ui.choose-what-do-local-history-either-option-stops")}</p><div><button class="mw-btn mw-btn--secondary" type="button" data-source-delete="retain_history" data-source-id="${sourceId}">${uiText("feed.ui.delete-source-keep-history")}</button><button class="mw-btn mw-btn--danger" type="button" data-source-delete="delete_local_history" data-source-id="${sourceId}">${uiText("feed.ui.delete-local-history-too")}</button></div></details></div></section><section class="source-detail-panel" data-source-detail-panel="config" hidden><header class="source-panel-heading"><h2>${uiText("feed.ui.config")}</h2><p>${uiText("feed.ui.provider-manages-addresses-account-identity-only-non-secret")}</p></header><div class="source-config-sheet"><label><span>${uiText("feed.ui.source-name")}</span><input value="${p.escape(source.name)}" data-source-config-field="name"></label><label><span>${uiText("feed.ui.account-address")}</span><input value="${p.escape(source.configured_endpoint)}"${source.editable_endpoint ? ` data-source-config-field="feed_url"` : ` readonly aria-readonly="true"`}></label><label><span>${uiText("feed.ui.description")}</span><textarea rows="2" data-source-config-field="description">${p.escape(source.description)}</textarea></label>${scopeField}<div class="source-config-actions"><button class="mw-btn mw-btn--primary" type="button" data-source-config-save data-source-id="${sourceId}">${uiText("feed.ui.save-configuration")}</button><small>${uiText("feed.ui.pull-messages-after-saving-verify-source")}</small></div><p data-source-action-status role="status" hidden></p></div></section><section class="source-detail-panel" data-source-detail-panel="schedule" hidden><div class="source-schedule-sheet"><div class="source-schedule-heading"><div><h2>${uiText("feed.ui.scheduled-pulls")}</h2><p>${uiText("feed.ui.local-service-runs-schedule-after-restart-sleep-catches")}</p></div><label class="source-schedule-toggle"><input type="checkbox" ${scheduleEnabled ? "checked " : ""}data-source-schedule-enabled><span>${scheduleEnabled ? uiText("feed.ui.label") : uiText("feed.ui.paused")}</span></label></div><label><span>${uiText("feed.ui.mode")}</span><select data-source-schedule-mode><option value="manual"${scheduleMode === "manual" ? " selected" : ""}>${uiText("feed.ui.manual-pulls-only")}</option><option value="interval"${scheduleMode === "interval" ? " selected" : ""}>${uiText("feed.ui.fixed-interval")}</option></select></label><label><span>${uiText("feed.ui.frequency")}</span><select data-source-schedule-interval>${[15, 30, 60, 360, 720, 1440].map((minutes) => `<option value="${minutes}"${intervalMinutes === minutes ? " selected" : ""}>${minutes} min</option>`).join("")}</select></label><div class="source-schedule-actions"><button class="mw-btn mw-btn--primary" type="button" data-source-schedule-save data-source-id="${sourceId}">${uiText("feed.ui.save-pull-schedule")}</button><small>${p.escape(source.next_fetch_label)}</small></div><p data-source-action-status role="status" hidden></p></div></section><section class="source-detail-panel" data-source-detail-panel="messages" hidden><div class="source-message-list"><header><div><h2>${uiText("feed.ui.latest-source")}</h2><p>${uiText("feed.ui.full-messages-remain-feed-view-only-checking-source")}</p></div><button class="mw-btn mw-btn--link" type="button" data-work-surface-open="feed" data-feed-preset="feed" data-feed-source="${p.escape(source.name)}">${uiText("feed.ui.view-feed")}${p.icon("chevron-right")}</button></header>${messages}</div></section><section class="source-detail-panel" data-source-detail-panel="runs" hidden><header class="source-panel-heading"><h2>${uiText("feed.ui.run-status")}</h2><p>${uiText("feed.ui.manual-pull-first-scheduled-run-will-leave-diagnostic")}</p></header>${runs}</section></div></article>`;
}

function renderItemActions(item: FeedUiItem, inboxActive: boolean, promoteAvailable: boolean, p: FeedUiPrimitives): string {
  if (item.disposition === "archived") {
    return `<button class="mw-btn mw-btn--secondary" type="button" data-feed-action="restore" data-feed-restore-target="feed" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}">${uiText("feed.ui.restore-feed")}</button>`;
  }
  const shown = (inboxActive
    ? [...FEED_CAPTURE_DISPOSITION_IDS]
    : visibleFeedDispositionIds(item.suggested_behavior_ids, true)).filter((id) => promoteAvailable || id !== FEED_PROMOTE_OPTION_ID);
  const manualAdmission = !inboxActive && !shown.includes(INBOX_ADMIT_OPTION_ID)
    ? `<button class="mw-btn mw-btn--secondary" type="button" data-feed-action="inbox" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}">${uiText("feed.ui.add-inbox-manually")}</button>` : "";
  return shown.map((id, index) => dispositionButton(item, id, index === 0, inboxActive, p)).join("") + manualAdmission;
}

function dispositionButton(
  item: FeedUiItem,
  optionId: string,
  primary: boolean,
  inboxActive: boolean,
  p: FeedUiPrimitives,
): string {
  const itemId = p.escape(item.item_id);
  const revision = item.revision;
  if (optionId === INBOX_ADMIT_OPTION_ID) {
    const cls = primary ? "mw-btn mw-btn--primary" : "mw-btn mw-btn--secondary";
    return `<button class="${cls}" type="button" data-feed-action="inbox" data-feed-item-id="${itemId}" data-feed-revision="${revision}"${inboxActive ? " disabled" : ""}>${p.icon("inbox")}${inboxActive ? uiText("feed.ui.added-inbox") : uiText("feed.ui.add-inbox")}</button>`;
  }
  if (optionId === FEED_SAVE_OPTION_ID) {
    const saved = item.disposition === "saved";
    const cls = primary ? "mw-btn mw-btn--primary" : "mw-btn mw-btn--secondary";
    return `<button class="${cls}" type="button" data-feed-action="save" data-feed-item-id="${itemId}" data-feed-revision="${revision}"${saved ? " disabled" : ""}>${saved ? uiText("feed.ui.saved-material") : uiText("feed.ui.save-material")}</button>`;
  }
  if (optionId === FEED_PROMOTE_OPTION_ID) {
    const cls = primary ? "mw-btn mw-btn--primary" : "mw-btn mw-btn--secondary";
    return `<button class="${cls}" type="button" data-feed-action="promote" data-feed-item-id="${itemId}" data-feed-revision="${revision}">${p.icon("target")}${item.linked_goal_id ? uiText("feed.ui.view-goal") : uiText("feed.ui.promote-goal")}</button>`;
  }
  if (optionId !== FEED_ARCHIVE_OPTION_ID) return "";
  const cls = primary ? "mw-btn mw-btn--primary" : "mw-btn mw-btn--ghost feed-action-subtle";
  return `<button class="${cls}" type="button" data-feed-action="archive" data-feed-item-id="${itemId}" data-feed-revision="${revision}">${uiText("feed.ui.ignore")}</button>`;
}

function dispositionLabel(value: string, _p: FeedUiPrimitives): string {
  const labels: Record<string, string> = {
    feed: uiText.text("feed.ui.feed-only"),
    inbox: uiText.text("feed.ui.added-inbox"),
    saved: uiText.text("feed.ui.saved-material"),
    promoted: uiText.text("feed.ui.promoted-goal"),
    archived: uiText.text("feed.ui.ignored"),
  };
  return labels[value] ?? value;
}

function renderFeedEntryStatus(entry: FeedUiEntry, p: FeedUiPrimitives): string {
  if (entry.disposition !== "feed") {
    const marks = {
      inbox: { tone: "attention", icon: "inbox" },
      saved: { tone: "done", icon: "archive" },
      promoted: { tone: "progress", icon: "target" },
      archived: { tone: "quiet", icon: "archive" },
    } as const;
    const mark = marks[entry.disposition as keyof typeof marks] ?? { tone: "idle" as const, icon: "dot" as const };
    return renderStatusMark({
      label: dispositionLabel(entry.disposition, p),
      tone: mark.tone,
      icon: mark.icon, state: entry.disposition === "inbox" ? "answer" : entry.disposition === "saved" ? "material" : entry.disposition === "archived" ? "archived" : undefined,
      plain: true,
      className: "feed-entry-status",
    });
  }
  return renderStatusMark({
    label: uiText.text(entry.read ? "feed.ui.read" : "feed.ui.unread"),
    tone: entry.read ? "quiet" : "attention",
    state: entry.read ? "read" : "unread",
    plain: true,
    className: "feed-entry-status",
    labelAttrs: { "data-feed-read-state": true },
  });
}

function destinationCopy(value: string, _p: FeedUiPrimitives): readonly [string, string] {
  const copy: Record<string, readonly [string, string]> = {
    feed: [uiText.text("feed.ui.kept-feed-only"), uiText.text("feed.ui.does-not-occupy-inbox-original-message-source-remain")],
    inbox: [uiText.text("feed.ui.added-inbox"), uiText.text("feed.ui.inbox-stores-only-attention-reference-original-message-remains")],
    saved: [uiText.text("feed.ui.saved-material"), uiText.text("feed.ui.full-message-source-existing-materials-remain-linked")],
    promoted: [uiText.text("feed.ui.promoted-goal"), uiText.text("feed.ui.goal-uses-message-traceable-input")],
    archived: [uiText.text("feed.ui.ignored"), uiText.text("feed.ui.hidden-default-list-restore-status-filter")],
  };
  return copy[value] ?? [value, uiText.text("feed.ui.original-message-retained")];
}

function sourceIconName(kind: FeedUiSource["ui_kind"]) {
  return kind === "github" ? "tree" : kind === "gmail" ? "mail" : kind === "rss" ? "rss" : kind === "connector" ? "link" : "link";
}

const keepAct = (name: string, label: string, primary = false): MwButtonOptions => ({ label, variant: primary ? "primary" : undefined, attrs: { "data-feed-keep-act": name } });
const keepBand = (phase: string, alert: Parameters<typeof renderAlert>[0]): string =>
  `<template data-feed-keep="${phase}">${renderAlert({ role: null, rise: true, attrs: { tabindex: "-1" }, ...alert })}</template>`;

/**
 * What the rule composer shows when its draft changed elsewhere (docs/design/rule-stale-reload, plan A): one alert per state for the
 * slot under the buttons, and the kept row, drawn by the SDK's parts and cloned by the page. The draft is only a carrier here, so a
 * deleted one is rebuilt by the next preview, and starting fresh needs no other place to go.
 */
function renderRuleKeep(_p: FeedUiModel["primitives"]): string {
  const reload = keepAct("reload", uiText.text("feed.ui.load-latest"), true), fresh = (primary: boolean) => keepAct("fresh", uiText.text("feed.ui.start-fresh-what-i-wrote"), primary);
  return [
    keepBand("conflict", { tone: "warning", title: uiText.text("feed.ui.rule-changed-elsewhere"), body: uiText.text("feed.ui.what-wrote-still-here-not-saved-yet"), actions: [reload] }),
    keepBand("offline", { tone: "warning", title: uiText.text("feed.ui.couldn-t-load-latest-version"), body: uiText.text("feed.ui.connection-seems-down-what-wrote-still-here-try"), actions: [keepAct("reload", uiText.text("feed.ui.try-again"), true)] }),
    keepBand("second", { tone: "warning", title: uiText.text("feed.ui.rule-changed-again"), body: uiText.text("feed.ui.someone-may-still-be-working-what-wrote-still"), actions: [fresh(false), reload] }),
    keepBand("deleted", { tone: "warning", title: uiText.text("feed.ui.rule-s-draft-was-deleted"), body: uiText.text("feed.ui.what-wrote-still-here-preview-again-draft-rebuilt"), actions: [keepAct("preview", uiText.text("feed.ui.preview-again"), true)] }),
    keepBand("published", { tone: "warning", title: uiText.text("feed.ui.rule-was-published-elsewhere-version", { version: "{version}" }), body: uiText.text("feed.ui.published-rule-can-t-change-what-wrote-still"), actions: [fresh(true)] }),
    keepBand("clean", { title: uiText.text("feed.ui.rule-just-changed-elsewhere-so-re-latest-now"), body: uiText.text("feed.ui.preview-once-more-see-whether-results-changed") }),
    keepBand("loaded", { tone: "success", state: "done", title: uiText.text("feed.ui.latest-version-loaded"), body: " ", actions: [keepAct("dismiss", uiText.text("feed.rule.dismiss"))] }),
    keepBand("saved-new", { tone: "success", state: "done", title: uiText.text("feed.ui.started-fresh-what-wrote"), body: uiText.text("feed.ui.preview-again-before-enabling"), actions: [keepAct("dismiss", uiText.text("feed.rule.dismiss"))] }),
    `<template data-feed-keep="busy">${renderButton({ label: "", loading: true })}</template>`,
    `<template data-feed-keep="kept">${renderKept({ who: uiText.text("feed.ui.wrote"), text: "", rise: true, action: { label: uiText.text("feed.ui.put-back"), attrs: { "data-feed-kept-swap": "" } }, more: { label: uiText.text("feed.ui.show-all-2"), attrs: { hidden: true, "data-feed-kept-more": "" } } })}</template>`,
  ].join("");
}
