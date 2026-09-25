import type {
  AttentionEntryRecord,
} from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type {
  FeedItemRecord,
  FeedMaterialRecord,
} from "@molis-ai/molis-work-contracts/modules/feed";
import type { SourceRecord } from "@molis-ai/molis-work-contracts/modules/sources";
import {
  renderStatusMark,
} from "@molis-ai/molis-work-design-system";
import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import {
  FEED_ARCHIVE_BEHAVIOR_ID,
  FEED_CAPTURE_DISPOSITION_IDS,
  FEED_PROMOTE_BEHAVIOR_ID,
  FEED_SAVE_BEHAVIOR_ID,
  INBOX_ADMIT_BEHAVIOR_ID,
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
  readonly prototype?: {
    readonly reason: string;
    readonly next_action: string;
    readonly relation: string;
  };
  /** HTML owned by another contribution and mounted in the Feed detail slot. */
  readonly detail_slot_html?: string;
}

export interface FeedUiSource extends SourceRecord {
  readonly prototype: boolean;
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
  readonly hint?: string | null;
  readonly problem?: string | null;
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
  readonly function_key: string | null;
}

export interface FeedUiModel {
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
  readonly demo: boolean;
  readonly active?: boolean;
  readonly error?: string | null;
  readonly judgment?: FeedUiJudgment;
}

export interface FeedUiJudgment {
  readonly functions: readonly { readonly function_key: string; readonly name: string }[];
}

export interface PersistedFeedDetailModel {
  readonly route_prefix: string;
  readonly entry_id: string;
  readonly item: FeedUiItem;
  readonly inbox_entry: AttentionEntryRecord | null;
  readonly inbox_active: boolean;
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

export const feedUiDescriptor: UiContributionDescriptor = {
  contribution_id: FEED_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.native.feed",
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
    { slot_id: "feed.detail.after-header", version: 1, accepts: ["declarative-html"] },
    { slot_id: "feed.detail.after-content", version: 1, accepts: ["declarative-html"] },
  ],
};

export const feedUiContribution: UiContribution<FeedUiModel | PersistedFeedDetailModel> = {
  descriptor: feedUiDescriptor,
  render(request: UiRenderRequest<FeedUiModel | PersistedFeedDetailModel>): string {
    switch (request.surface as FeedUiSurface) {
      case "directory":
        return renderFeedDirectory(request.model as FeedUiModel);
      case "workbench":
        return renderFeedWorkbench(request.model as FeedUiModel);
      case "workbench-fragment":
        return renderFeedWorkbenchFragment(request.model as FeedUiModel);
      case "source-directory":
        return renderSourceDirectory(request.model as FeedUiModel);
      case "source-workbench":
        return renderSourceWorkbench(request.model as FeedUiModel);
      case "overlays":
        return renderFeedOverlays(request.model as FeedUiModel);
      case "persisted-detail":
        return renderPersistedFeedItemDetail(request.model as PersistedFeedDetailModel);
      case "frame-block":
        return renderFeedFrameBlock(request.model as PersistedFeedDetailModel);
      default:
        throw new Error(`Feed UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

function entrySourceId(entry: FeedUiEntry, model: FeedUiModel): string {
  const id = entry.item?.source_id || "";
  if (!entry.prototype || model.sources.some((source) => source.source_id === id)) return id;
  return model.sources.find((source) => source.ui_kind === entry.provider)?.source_id || id;
}

export function renderFeedDirectory(_model: FeedUiModel): string {
  return "";
}

export function renderFeedWorkbench(model: FeedUiModel): string {
  const p = model.primitives;
  return `<section class="desktop-work-surface feed-workbench plugin-stage-shell" data-work-surface="feed" data-work-surface-label="Feed" data-feed-workbench data-feed-directory data-feed-preset="feed" data-feed-stage-shell data-feed-stage-directory="true" data-expanded="false" data-loaded="true" data-loaded-preset="feed"${model.active ? "" : " hidden"}>
    ${model.error ? `<div class="feed-error-state" role="alert"><strong>${p.text("Feed 暂时无法载入")}</strong><p>${p.escape(model.error)}</p><button class="mw-btn mw-btn--secondary" type="button" data-retry-feed-detail>${p.text("重试")}</button></div>` : ""}
    ${renderFeedStageDirectory(model)}
    ${renderFeedSetupPanel(model)}
  </section>`;
}

export function renderFeedWorkbenchFragment(model: FeedUiModel): string {
  if (model.error) {
    return `<div class="feed-error-state" role="alert"><strong>${model.primitives.text("Feed 暂时无法载入")}</strong><p>${model.primitives.escape(model.error)}</p><button class="mw-btn mw-btn--secondary" type="button" data-retry-feed-detail>${model.primitives.text("重试")}</button></div>`;
  }
  return renderFeedStageDirectory(model) + `<section data-feed-task-configs>${renderTaskConfigPanels(model)}</section>`;
}

function renderFeedSourceRail(model: FeedUiModel): string {
  const p = model.primitives;
  const groups = groupedFeedStageEntries(model);
  return `<aside class="feed-source-rail" data-feed-source-rail aria-label="${p.text("Feed 来源")}">
    <header><h1>Feed</h1><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-feed-add-toggle aria-label="${p.text("添加来源")}">${p.icon("plus")}</button></header>
    <button class="feed-source-nav is-selected" type="button" data-feed-task="all" data-feed-task-toggle="all" aria-current="page"><span class="feed-source-nav-icon">${p.icon("rss")}</span><span><strong>${p.text("全部消息")}</strong><small>${p.text("所有来源的最新内容")}</small></span><em>${model.entries.length}</em></button>
    <div class="feed-rail-label">${p.text("我的来源")}</div>
    <nav>${groups.map(group => { const source = model.sources.find(s => s.source_id === group.sourceId); return `<button class="feed-source-nav" type="button" data-feed-task="${p.escape(group.sourceId)}" data-feed-task-toggle="${p.escape(group.sourceId)}" data-feed-source-name="${p.escape(group.label)}" data-feed-source-summary="${p.escape(source ? [source.account_label, source.status_label, source.last_fetch_label].filter(Boolean).join(" · ") : '')}" data-feed-source-state="${p.escape(group.statusKind)}" data-feed-source-can-sync="${Boolean(source && !source.prototype && source.enabled && source.status !== "disconnected")}"><span class="feed-source-nav-icon">${p.icon(sourceIconName(group.provider))}</span><span><strong>${p.escape(group.label)}</strong><small>${p.escape(source?.status_label || p.text("保留的消息"))}${source ? ` · ${p.escape(source.account_label || source.schedule_label)}` : ''}</small></span><em>${group.entries.length}</em></button>`; }).join('')}</nav>
    <footer><button class="mw-btn mw-btn--ghost" type="button" data-feed-add-toggle>${p.icon("plus")}${p.text("添加来源")}</button><p>${p.text("关注的内容，在这里汇集。")}</p></footer>
  </aside>`;
}

function renderFeedSourceHeader(model: FeedUiModel): string {
  const p = model.primitives;
  return `<header class="feed-source-header" data-feed-source-header><div class="feed-source-heading"><button class="mw-btn mw-btn--ghost mw-btn--icon-only feed-mobile-sources" type="button" data-feed-rail-toggle aria-label="${p.text("选择来源")}" aria-expanded="false">${p.icon("list")}</button><div><h2 data-feed-task-title>${p.text("全部消息")}</h2><p data-feed-task-summary>${p.text("所有来源的最新内容")}</p></div><button class="mw-btn mw-btn--secondary" type="button" data-feed-current-sync hidden>${p.icon("refresh")}${p.text("立即拉取")}</button></div><nav class="feed-source-tabs" aria-label="${p.text("来源工作区")}"><button type="button" data-feed-view="messages" aria-current="page">${p.text("消息")}</button><button type="button" data-feed-view="settings" hidden>${p.text("来源设置")}</button><button type="button" data-feed-view="rules" hidden>${p.text("捕捉规则")}</button></nav></header>`;
}

function renderFeedStageDirectory(model: FeedUiModel): string {
  const p = model.primitives;
  const groups = groupedFeedStageEntries(model);
  const total = groups.reduce((count, group) => count + group.entries.length, 0);
  const body = groups.map((group) => renderFeedStageGroup(group, model)).join("");
  const details = sortedFeedEntries(model).map((entry) => renderFeedStageDetailPane(entry, model)).join("");
  return `${renderFeedSourceRail(model)}${renderFeedSourceHeader(model)}${renderFeedStageToolbar(model, total)}
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-feed-list>${body}<div class="feed-list-empty mw-empty" data-feed-empty${groups.length ? " hidden" : ""}><strong data-feed-empty-title>${p.text(total ? "这里还没有 Item" : "还没有来源")}</strong><button class="mw-btn mw-btn--ghost" type="button" data-feed-clear-filters hidden>${p.text("清除筛选")}</button>${model.demo ? `<button class="mw-btn mw-btn--ghost" type="button" data-prototype-feed-restore hidden>${p.text("恢复列表")}</button>` : ""}<button class="mw-btn mw-btn--link" type="button" data-feed-add-toggle>${p.text("添加来源")}</button></div></div>
    <div class="plugin-stage-workspace feed-stage-workspace" data-feed-stage-workspace hidden>${details}<div class="feed-detail-empty mw-empty" data-feed-detail-empty hidden>${p.icon("rss")}<h1 data-feed-detail-empty-title>${p.text("正在载入 Item…")}</h1><p data-feed-detail-empty-copy hidden></p><button class="mw-btn mw-btn--secondary" type="button" data-retry-feed-detail hidden>${p.text("重试")}</button></div></div>`;
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
    const sourceId = entrySourceId(entry, model);
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
  if (leftovers.length) {
    groups.push({
      sourceId: "other",
      label: model.primitives.text("其他"),
      provider: leftovers[0]?.provider || "other",
      statusKind: "active",
      entries: leftovers,
    });
  }
  return groups;
}

function feedTaskStatusMark(kind: FeedUiSource["status_kind"]): { icon: "check" | "alert"; tone: "ready" | "attention" } {
  return kind === "active" ? { icon: "check", tone: "ready" } : { icon: "alert", tone: "attention" };
}

function renderFeedStageGroup(group: FeedStageGroup, model: FeedUiModel): string {
  const p = model.primitives;
  const id = p.escape(group.sourceId);
  const name = p.escape(group.label);
  const mark = feedTaskStatusMark(group.statusKind);
  const rows = group.entries.map((entry) => renderFeedStageItem(entry, model)).join("");
  return `<details class="goal-collection-fold" data-feed-stage-group="${id}" data-feed-task-status="${p.escape(group.statusKind)}" open>
    <summary>
      <span class="goal-collection-caret" aria-hidden="true">${p.icon("chevron-down")}</span>
      <span class="goal-collection-mark is-${mark.tone}" aria-hidden="true">${p.icon(mark.icon)}</span>
      <strong>${name}</strong>
      <small data-feed-stage-group-count>${group.entries.length}</small>
    </summary>
    <div class="feed-stage-group-body" role="list" aria-label="${name}">${rows}<p class="goal-collection-empty" data-feed-stage-group-empty${group.entries.length ? " hidden" : ""}>${p.text("这个来源还没有消息")}</p></div>
  </details>`;
}

function renderFeedStageToolbar(model: FeedUiModel, count: number): string {
  const p = model.primitives;
  const sourceLabels = [...new Set(model.entries.map((entry) => entry.source_label).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  const sourceOptions: readonly (readonly [string, string])[] = [["all", p.text("全部来源")], ...sourceLabels.map((label) => [label, label] as const)];
  const typeOptions = [["all", p.text("全部类型")], ["github", "GitHub"], ["gmail", "Gmail"], ["rss", "RSS / Atom"], ["other", p.text("其他类型")]] as const;
  const timeOptions = [["all", p.text("全部时间")], ["day", p.text("最近 24 小时")], ["week", p.text("最近 7 天")], ["month", p.text("最近 30 天")]] as const;
  const statusOptions = [["active", p.text("未忽略")], ["all", p.text("全部状态")], ["feed", p.text("仅 Feed")], ["saved", p.text("已保存")], ["promoted", p.text("已升格")], ["processing", p.text("处理中")], ["archived", p.text("已忽略")]] as const;
  const sortOptions = [["newest", p.text("最新在前")], ["oldest", p.text("最早在前")], ["source", p.text("按来源")], ["title", p.text("按标题")]] as const;
  const filterOptions = (kind: string, options: readonly (readonly [string, string])[], selected: string) =>
    options.map(([value, label]) => `<button class="feed-filter-option" type="button" role="radio" aria-checked="${value === selected}" data-feed-filter-option="${kind}" data-feed-filter-value="${p.escape(value)}"><span>${p.escape(label)}</span>${p.icon("check")}</button>`).join("");
  const selectOptions = (options: readonly (readonly [string, string])[]) => options.map(([value, label]) => `<option value="${p.escape(value)}">${p.escape(label)}</option>`).join("");
  return `<header class="plugin-stage-chrome feed-stage-toolbar" data-feed-stage-chrome>
    <label class="feed-stage-search">${p.icon("search")}<input data-feed-search type="search" placeholder="${p.text("搜索消息")}" aria-label="${p.text("搜索消息")}"></label>
    <div class="feed-directory-tools"><div class="feed-directory-toolbar"><div class="feed-filter-control"><button class="feed-filter-trigger" type="button" data-feed-filter-trigger aria-expanded="false" aria-haspopup="true" aria-controls="feed-filter-panel" aria-label="${p.text("筛选与排序")}">${p.icon("filter")}<span data-feed-filter-badge hidden>0</span></button><section class="feed-filter-panel" id="feed-filter-panel" data-feed-filter-panel hidden aria-label="${p.text("筛选与排序")}"><header><strong>${p.text("筛选与排序")}</strong><button class="mw-btn mw-btn--link" type="button" data-feed-filter-reset>${p.text("清除筛选")}</button></header><div class="feed-filter-section"><span>${p.text("来源")}</span><div class="feed-filter-options">${filterOptions("source", sourceOptions, "all")}</div></div><div class="feed-filter-section"><span>${p.text("类型")}</span><div class="feed-filter-options">${filterOptions("type", typeOptions, "all")}</div></div><div class="feed-filter-section"><span>${p.text("时间")}</span><div class="feed-filter-options">${filterOptions("time", timeOptions, "all")}</div></div><div class="feed-filter-section"><span>${p.text("状态")}</span><div class="feed-filter-options">${filterOptions("status", statusOptions, "active")}</div></div><div class="feed-filter-section"><span>${p.text("排序")}</span><div class="feed-filter-options">${filterOptions("sort", sortOptions, "newest")}</div></div></section></div></div><select data-feed-source-filter hidden tabindex="-1" aria-hidden="true">${selectOptions(sourceOptions)}</select><select data-feed-type-filter hidden tabindex="-1" aria-hidden="true">${selectOptions(typeOptions)}</select><select data-feed-time-filter hidden tabindex="-1" aria-hidden="true">${selectOptions(timeOptions)}</select><select data-feed-status-filter hidden tabindex="-1" aria-hidden="true">${selectOptions(statusOptions)}</select><select data-feed-sort hidden tabindex="-1" aria-hidden="true">${selectOptions(sortOptions)}</select></div>
    <span class="feed-stage-count" data-feed-result-count>${p.text("{count} 条消息", { count })}</span>
  </header>`;
}

function renderFeedStageItem(entry: FeedUiEntry, model: FeedUiModel): string {
  const p = model.primitives;
  const sourceId = entrySourceId(entry, model);
  const visible = entry.preset === model.preset;
  return `<article class="feed-stage-item" role="listitem" data-feed-item-wrap="${p.escape(entry.entry_id)}"${visible ? "" : " hidden"}>
    <div class="feed-stage-item-line">
      <button class="feed-stage-entry directory-list-row" type="button" aria-expanded="false" aria-controls="feed-reading-${p.escape(entry.entry_id)}" tabindex="-1" draggable="true" data-frame-asset="feed" data-frame-asset-id="${p.escape(entry.entry_id)}" data-frame-asset-title="${p.escape(entry.title)}" data-frame-asset-caption="${p.escape(entry.summary)}" data-feed-entry-id="${p.escape(entry.entry_id)}"${entry.item_id ? ` data-feed-item-id="${p.escape(entry.item_id)}"` : ""}${entry.inbox_entry ? ` data-inbox-entry-id="${p.escape(entry.inbox_entry.entry_id)}" data-inbox-entry-revision="${entry.inbox_entry.revision}" data-inbox-subject-type="${entry.inbox_entry.subject_type}" data-inbox-reason="${entry.inbox_entry.reason}"` : ""} data-feed-entry-type="${entry.preset}" data-feed-entry-provider="${entry.provider}" data-feed-entry-attention-rank="${entry.attention_rank}" data-feed-entry-persisted="${entry.item && !entry.prototype ? "true" : "false"}"${entry.prototype ? ` data-feed-entry-prototype="true"` : ""} data-feed-entry-read="${entry.read ? "read" : "unread"}" data-feed-entry-source="${p.escape(entry.source_label)}" data-feed-entry-source-id="${p.escape(sourceId)}" data-feed-entry-status="${p.escape(entry.disposition)}" data-feed-entry-time="${p.escape(entry.updated_at)}" data-feed-entry-title="${p.escape(entry.title)}" data-feed-entry-search="${p.escape(`${entry.title} ${entry.summary} ${entry.source_label}`.toLocaleLowerCase())}"><span class="feed-stage-leading"><span class="feed-entry-provider" aria-hidden="true">${p.icon(sourceIconName(entry.provider))}</span><span class="feed-entry-copy"><strong title="${p.escape(entry.title)}">${p.escape(entry.title)}</strong><span class="feed-entry-preview">${p.escape(p.plainText(entry.summary))}</span></span></span><span class="feed-entry-source">${p.escape(entry.source_label)}</span><time datetime="${p.escape(entry.updated_at)}">${p.formatDate(entry.updated_at)}</time>${renderFeedEntryStatus(entry, p)}</button>
    </div>
  </article>`;
}

function renderFeedStageDetailPane(entry: FeedUiEntry, model: FeedUiModel): string {
  const p = model.primitives;
  const detail = entry.prototype && entry.item
    ? renderPrototypeFeedDetail(entry, true, model)
    : entry.detail_slot_html || "";
  return `<article class="feed-stage-detail" data-feed-entry-detail="${p.escape(entry.entry_id)}" hidden>
    <header class="plugin-stage-detail-bar" data-stage-back-only><button class="plugin-stage-back" type="button" data-feed-collapse aria-label="${p.text("返回 Feed 列表")}" title="${p.text("返回 Feed 列表")}">${p.icon("chevron-right")}</button></header>
    <div class="feed-stage-item-detail" id="feed-reading-${p.escape(entry.entry_id)}" data-feed-item-slot>${detail}</div>
  </article>`;
}

function sortedFeedEntries(model: FeedUiModel): FeedUiEntry[] {
  return [...model.entries]
    .filter((entry) => entry.preset === model.preset)
    .sort((left, right) => right.attention_rank - left.attention_rank || right.updated_at.localeCompare(left.updated_at));
}

function renderPrototypeFeedDetail(entry: FeedUiEntry, selected: boolean, model: FeedUiModel): string {
  const p = model.primitives;
  const item = entry.item!;
  const prototype = entry.prototype!;
  const primaryAction = `<button class="mw-btn mw-btn--primary" type="button" data-prototype-feed-action="inbox" data-prototype-item-id="${p.escape(item.item_id)}">${p.icon("inbox")}${p.text("加入 Inbox")}</button>`;
  const secondaryActions = `<button class="mw-btn mw-btn--secondary" type="button" data-prototype-feed-action="save">${p.text("保存为资料")}</button><button class="mw-btn mw-btn--secondary" type="button" data-prototype-feed-action="promote">${p.icon("target")}${p.text("升格为 Goal")}</button><button class="mw-btn mw-btn--ghost feed-action-subtle" type="button" data-prototype-feed-action="ignore">${p.text("忽略")}</button>`;
  return `<article class="feed-detail feed-detail--prototype" data-feed-detail="${p.escape(entry.entry_id)}" data-feed-detail-item-type="feed" data-prototype-feed-detail${selected ? "" : " hidden"}>
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span class="mw-status mw-status--progress">${p.escape(entry.kind_label)}</span><span class="mw-status mw-status--quiet">${p.escape(entry.source_label)}</span><span class="mw-status mw-status--quiet">${p.text("仅本页演示")}</span></div><h1>${p.escape(item.title)}</h1><p>${p.escape(item.summary)}</p><div class="feed-detail-meta"><span>${p.icon("link")}${p.escape(prototype.relation)}</span><time datetime="${p.escape(item.source_updated_at)}">${p.formatDate(item.source_updated_at)}</time></div></header>
    <section class="feed-detail-body"><h2>${p.text("内容")}</h2><div class="feed-rich-content">${p.richText(item.body)}</div></section>
    <section class="feed-detail-tags" aria-label="${p.text("标签")}">${item.tags.map((tag) => `<span>${p.escape(tag)}</span>`).join("")}</section>
    <footer class="feed-reader-footer"><section class="feed-destination-strip" data-prototype-destination><span>${p.icon("rss")}${p.text("当前去向")}</span><strong>${p.text("仅保留在 Feed")}</strong><small>${p.text("尚未占用你的 Inbox")}</small></section><div class="feed-detail-actions" data-feed-actions>${primaryAction}${secondaryActions}</div><p class="feed-action-status" data-prototype-action-status role="status" hidden></p></footer>
    <p class="prototype-honesty-note">${p.icon("alert")}${p.text("演示动作只改变当前页面状态，不会连接账号、写入数据库或启动后台任务。")}</p>
  </article>`;
}

export function renderFeedFrameBlock(model: PersistedFeedDetailModel): string {
  const { item, primitives: p } = model;
  const body = p.richText(item.body || item.summary) || `<p>${p.text("这条消息没有可显示的正文。")}</p>`;
  const itemUrl = p.safeExternalHref(item.url);
  const meta = [item.source_label || item.source_kind, item.source_updated_at ? p.formatDate(item.source_updated_at) : ""]
    .filter(Boolean)
    .map((part) => p.escape(part))
    .join(" · ");
  return `<article class="frame-reading" data-frame-reading="feed" data-feed-detail="${p.escape(model.entry_id)}">
    ${meta ? `<p class="frame-reading-meta">${meta}</p>` : ""}
    <div class="feed-rich-content">${body}</div>
    ${itemUrl ? `<p class="frame-reading-link"><a href="${p.escape(itemUrl)}" target="_blank" rel="noopener noreferrer">${p.text("打开原文")}</a></p>` : ""}
  </article>`;
}

export function renderPersistedFeedItemDetail(model: PersistedFeedDetailModel, selected = true): string {
  const { item, primitives: p } = model;
  const itemUrl = p.safeExternalHref(item.url);
  const body = p.richText(item.body || item.summary) || `<p>${p.text("这条消息没有可显示的正文。")}</p>`;
  const effectiveDisposition = item.disposition === "inbox" ? "feed" : item.disposition;
  const actions = renderItemActions(item, model.inbox_active, p);
  const destination = destinationCopy(model.inbox_active ? "inbox" : effectiveDisposition, p);
  const materials = item.materials.length ? item.materials.map((material) => {
    const href = p.safeExternalHref(material.canonical_url);
    return `<li><span>${p.icon("link")}</span><div><strong>${p.escape(material.title || material.source_name)}</strong><small>${p.escape([material.source_name, material.published_at ? p.formatDate(material.published_at) : ""].filter(Boolean).join(" · "))}</small>${material.preview ? `<p>${p.escape(material.preview)}</p>` : ""}${material.content ? `<details class="feed-material-content"><summary>${p.text("查看保存的正文")}</summary><div>${p.escape(material.content)}</div></details>` : material.content_ref && !material.content_available ? `<small class="feed-material-unavailable">${p.text("正文暂时不可读取")}</small>` : ""}</div>${href ? `<a href="${p.escape(href)}" target="_blank" rel="noopener noreferrer" aria-label="${p.text("打开原资料")}">${p.icon("arrow")}</a>` : ""}</li>`;
  }).join("") : `<li class="feed-material-empty">${p.icon("archive")}<p>${p.text("这条 Item 没有附带资料；正文和来源信息仍会进入处理上下文。")}</p></li>`;
  return `<article class="feed-detail" data-feed-detail="${p.escape(model.entry_id)}" data-feed-detail-item-type="feed" data-feed-detail-read="${item.read_at ? "read" : "unread"}"${selected ? "" : " hidden"}>
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span class="mw-status mw-status--progress">Feed</span><span class="mw-status mw-status--quiet">${p.escape(item.source_label || item.source_kind)}</span><span class="mw-status mw-status--${item.read_at ? "quiet" : "attention"}" data-feed-read-state>${item.read_at ? p.text("已读") : p.text("未读")}</span><span class="mw-status mw-status--${model.inbox_active ? "attention" : "quiet"}">${p.escape(dispositionLabel(model.inbox_active ? "inbox" : effectiveDisposition, p))}</span></div><h1>${p.escape(item.title || p.text("未命名消息"))}</h1>${item.summary ? `<p>${p.escape(p.plainText(item.summary))}</p>` : ""}<div class="feed-detail-meta">${item.author ? `<span>${p.icon("user")}${p.escape(item.author)}</span>` : ""}<time datetime="${p.escape(item.source_updated_at)}">${p.formatDate(item.source_updated_at)}</time>${item.source_id ? `<button class="mw-btn mw-btn--link" type="button" data-open-source-record="${p.escape(item.source_id)}">${p.icon("settings")}${p.text("查看来源")}</button>` : ""}${itemUrl ? `<a href="${p.escape(itemUrl)}" target="_blank" rel="noopener noreferrer">${p.text("打开原文")}${p.icon("arrow")}</a>` : ""}</div></header>
    <section class="feed-detail-body"><h2>${p.text("内容")}</h2><div class="feed-rich-content">${body}</div></section>
    ${item.tags.length ? `<section class="feed-detail-tags" aria-label="${p.text("标签")}">${item.tags.map((tag) => `<span>${p.escape(tag)}</span>`).join("")}</section>` : ""}
    ${item.materials.length ? `<details class="feed-materials"><summary>${p.icon("link")}<span>${p.text("附带资料")}</span><small>${p.text("{count} 项", { count: item.materials.length })}</small>${p.icon("chevron-down")}</summary><ul>${materials}</ul></details>` : ""}
    <footer class="feed-reader-footer"><section class="feed-destination-strip" data-destination-state="${p.escape(model.inbox_active ? "inbox" : effectiveDisposition)}"><span>${p.icon("rss")}${p.text("当前去向")}</span><strong>${p.escape(destination[0])}</strong><small>${p.escape(destination[1])}</small></section><div class="feed-detail-actions" data-feed-actions>${actions}</div><p class="feed-action-status" data-feed-action-status role="status" hidden></p></footer>
  </article>`;
}

export function renderSourceDirectory(model: FeedUiModel): string {
  const p = model.primitives;
  const rows = model.sources.map((source, index) => `<button class="source-list-item directory-list-row${index === 0 ? " is-selected" : ""}" type="button" role="option" aria-selected="${index === 0}" tabindex="${index === 0 ? "0" : "-1"}" data-source-entry-id="${p.escape(source.source_id)}" data-source-kind="${p.escape(source.ui_kind)}" data-source-status="${p.escape(source.status_kind)}" data-source-search-value="${p.escape(`${source.name} ${source.type_label} ${source.account_label || ""}`.toLocaleLowerCase())}"><span class="source-list-icon">${p.icon(sourceIconName(source.ui_kind))}</span><span class="source-list-copy"><span><em>${p.escape(source.type_label)}</em>${source.prototype ? `<small>${p.text("演示")}</small>` : ""}</span><strong>${p.escape(source.name)}</strong><p>${p.escape(source.account_label || p.text("公开来源"))}</p><small>${p.escape(`${p.text("上次")} ${source.last_fetch_label} · ${p.text("下次")} ${source.next_fetch_label}`)}</small></span><span class="source-list-state directory-row-state" data-source-status="${p.escape(source.status_kind)}">${p.escape(source.status_label)}</span></button>`).join("");
  return `<section class="desktop-directory-panel source-directory" data-directory-panel="sources" data-source-directory hidden><header class="desktop-directory-heading source-directory-heading"><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-directory-back aria-label="${p.text("返回上一级")}">${p.icon("back")}</button><span><strong>${p.text("来源")}</strong><small>${p.text("账号、接入源与拉取计划")}</small></span><button class="mw-btn mw-btn--ghost mw-btn--icon-only source-add-trigger" type="button" data-feed-sources-open aria-label="${p.text("添加来源")}">${p.icon("plus")}</button></header><div class="source-directory-tools" data-directory-list-actions><details class="source-filter-menu"><summary aria-label="${p.text("来源筛选")}" title="${p.text("来源筛选")}">${p.icon("filter")}</summary><div class="mw-toggle-group source-filter-row" data-slot="toggle-group" role="group" aria-label="${p.text("来源筛选")}"><button class="mw-toggle is-current is-active" type="button" data-source-filter="all" aria-pressed="true">${p.text("全部")}</button><button class="mw-toggle" type="button" data-source-filter="account" aria-pressed="false">${p.text("账号")}</button><button class="mw-toggle" type="button" data-source-filter="public" aria-pressed="false">${p.text("公开 Feed")}</button><button class="mw-toggle" type="button" data-source-filter="attention" aria-pressed="false">${p.text("需处理")}</button></div></details><button class="mw-btn mw-btn--ghost mw-btn--icon-only source-mobile-add" type="button" data-feed-sources-open aria-label="${p.text("添加来源")}">${p.icon("plus")}</button></div><div class="source-list" data-source-list role="listbox" aria-label="${p.text("来源列表")}">${rows}<div class="feed-list-empty source-list-empty" data-source-empty hidden>${p.icon("search")}<strong>${p.text("没有符合条件的来源")}</strong><button class="mw-btn mw-btn--link" type="button" data-source-filter-reset>${p.text("清除筛选")}</button></div></div><footer class="feed-directory-footer"><span data-source-result-count>${p.text("{count} 个来源", { count: model.sources.length })}</span></footer></section>`;
}

export function renderSourceWorkbench(model: FeedUiModel): string {
  const p = model.primitives;
  const panels = model.sources.map((source, index) => renderSourceDetail(source, index === 0, model)).join("");
  return `<section class="desktop-work-surface source-workbench" data-work-surface="sources" data-work-surface-label="${p.text("来源")}" data-source-workbench hidden>${panels}<div class="feed-detail-empty" data-source-detail-empty${panels ? " hidden" : ""}>${p.icon("settings")}<h1>${panels ? p.text("选择一个来源") : p.text("还没有可管理的来源")}</h1>${panels ? "" : `<button class="mw-btn mw-btn--primary" type="button" data-feed-sources-open>${p.icon("plus")}${p.text("添加来源")}</button>`}</div></section>`;
}

function renderSourceRuns(source: FeedUiSource, p: FeedUiModel["primitives"]): string {
  return source.runs.length ? `<ol class="source-run-ledger">${source.runs.map((run) => {
    const state = run.phase === "running" ? "running" : run.phase === "interrupted" || run.error_code ? "error" : "complete";
    const title = run.phase === "running" ? p.text("正在拉取") : run.phase === "interrupted" ? p.text("拉取已中断") : run.error_code ? p.text("拉取失败") : p.text("拉取完成");
    const summary = run.phase === "running" ? p.text("已开始，等待来源返回") : run.error_code ? p.text("错误：{code} · 可安全重试", { code: run.error_code }) : p.text("新增 {created} · 去重 {deduped}", { created: run.created_count, deduped: run.deduped_count });
    return `<li data-run-state="${state}"><span>${p.icon(state === "complete" ? "check" : state === "running" ? "refresh" : "alert")}</span><div><strong>${title}</strong><p>${p.escape(summary)}</p></div><time>${p.formatDate(run.completed_at || run.started_at)}</time></li>`;
  }).join("")}</ol>` : `<div class="source-panel-empty">${p.icon("waiting")}<strong>${p.text("还没有运行记录")}</strong></div>`;
}

function connectorSettingsHref(model: FeedUiModel, connectorId: string): string {
  const params = new URLSearchParams({ connector: connectorId });
  const project = /^\/projects\/([^/]+)$/u.exec(model.route_prefix)?.[1];
  if (project) params.set("project", decodeURIComponent(project));
  return `/settings/connectors?${params.toString()}`;
}

function renderSourceConnection(model: FeedUiModel, source: FeedUiSource): string {
  if (source.prototype || !["gmail", "github", "connector"].includes(source.ui_kind)) return "";
  const p = model.primitives;
  const service = source.ui_kind === "connector" ? source.kind : source.ui_kind;
  const current = typeof source.config.connection_id === "string" ? source.config.connection_id : "";
  return `<div data-feed-connection-service="${p.escape(service)}"><label><span>${p.text("使用的账号连接")}</span><select data-source-config-field="connection_id" disabled><option value="${p.escape(current)}" selected>${p.escape(source.account_label || p.text("正在读取账号连接…"))}</option></select></label><p data-feed-connection-status role="status">${p.text("账号授权由 Connectors 统一管理，这里选择要使用的连接。")}</p><a class="mw-btn mw-btn--link" href="${p.escape(connectorSettingsHref(model, service))}">${p.text("在 Connectors 管理账号")}</a></div>`;
}

function renderTaskConfigPanels(model: FeedUiModel): string {
  const p = model.primitives;
  return model.sources.map((source) => {
    const id = p.escape(source.source_id);
    const interval = source.schedule.mode === "interval" ? source.schedule.interval_minutes : 60;
    const scope = typeof source.config.scope === "string" ? source.config.scope : source.scope_label;
    return `<section data-feed-task-config="${id}" data-source-detail="${id}" data-prototype="${source.prototype}" hidden>
      <div data-feed-config-section="settings"><div class="feed-task-health"><strong>${p.escape(source.status_label)}</strong><span>${p.escape(source.last_fetch_label)} · ${source.item_count} ${p.text("条消息")}</span></div>
      <label><span>${p.text("来源名称")}</span><input data-source-config-field="name" required maxlength="80" value="${p.escape(source.name)}"></label>
      ${renderSourceConnection(model, source)}
      <label><span>${p.text("来源地址或账号")}</span><input ${source.editable_endpoint ? 'data-source-config-field="feed_url"' : 'readonly'} value="${p.escape(source.configured_endpoint || source.account_label || source.name)}"></label>
      <details class="feed-task-extra"><summary>${p.text("内容范围与说明")}</summary><label><span>${p.text("说明")}</span><textarea data-source-config-field="description" rows="2">${p.escape(source.description)}</textarea></label><label><span>${p.text("拉取范围")}</span>${source.ui_kind === "gmail" ? `<select data-source-config-field="scope">${source.scope_options.map(option=>`<option value="${p.escape(option.value)}"${option.value===scope?' selected':''}>${p.escape(option.label)}</option>`).join('')}</select>` : `<input readonly value="${p.escape(scope)}">`}</label></details>
      </div><div data-feed-config-section="rules" hidden>${renderOutRulesSection(model, source)}</div><div data-feed-config-section="settings">

      <details class="feed-task-extra" data-feed-plan-region open><summary>${p.text("拉取计划")}</summary><p>${p.text("拉取计划单独保存，修改后从下次拉取起生效。")}</p><label><span>${p.text("拉取方式")}</span><select data-source-schedule-mode><option value="manual"${source.schedule.mode==='manual'?' selected':''}>${p.text("手动拉取")}</option><option value="interval"${source.schedule.mode==='interval'?' selected':''}>${p.text("定时拉取")}</option></select></label><label${source.schedule.mode==='manual'?' hidden':''}><span>${p.text("间隔（分钟）")}</span><input type="number" min="5" max="10080" value="${interval}" data-source-schedule-interval></label><label class="check-row"${source.schedule.mode==='manual'?' hidden':''}><input type="checkbox" data-source-schedule-enabled${source.schedule.mode==='interval'&&source.schedule.enabled?' checked':''}><span>${p.text("启用定时拉取")}</span></label><div class="feed-plan-actions"><button class="mw-btn mw-btn--secondary" type="button" data-source-schedule-reset>${p.text("撤销修改")}</button><button class="mw-btn mw-btn--primary" type="button" data-source-schedule-save data-source-id="${id}"${source.prototype?' disabled':''}>${p.text("保存拉取计划")}</button></div></details>
      <div class="feed-task-controls"><button class="mw-btn mw-btn--primary" type="button" data-feed-source-sync="${id}"${source.prototype||!source.enabled||source.status==='disconnected'?' disabled':''}>${p.text("立即拉取")}</button><button class="mw-btn mw-btn--secondary" type="button" data-feed-source-toggle="${id}" data-feed-source-enabled="${source.enabled}"${source.prototype?' disabled':''}>${source.enabled?p.text("暂停来源"):p.text("恢复来源")}</button></div>
      ${source.prototype?`<p class="feed-setup-hint">${p.text("这是演示任务。添加一个真实来源后即可保存配置和拉取内容。")}</p>`:''}
      <details class="feed-task-extra"><summary>${p.text("最近拉取")}</summary>${renderSourceRuns(source, p)}</details><details class="feed-task-extra"><summary>${p.text("移除来源")}</summary><p>${p.text("停止拉取，已收集的消息与历史仍会保留。")}</p><button class="mw-btn mw-btn--danger-outline" type="button" data-source-delete="retain_history" data-source-id="${id}"${source.prototype?' disabled':''}>${p.text("移除任务并保留历史")}</button></details><p data-source-action-status role="status" hidden></p></div>
    </section>`;
  }).join("");
}

export function renderFeedOverlays(_model: FeedUiModel): string { return ""; }

function renderFeedSetupPanel(model: FeedUiModel): string {
  const p = model.primitives;
  const catalogOptions = model.source_catalog.map((source) => `<option value="${p.escape(source.id)}">${p.escape(`${source.category_label} · ${source.name}`)}</option>`).join("");
  const connectorLabel = (status: FeedUiConnectorStatus, kind: "github" | "gmail") => status.bound
    ? `${p.text(kind === "gmail" ? "凭据已保存" : "已连接")} ${p.escape(status.hint || "")}`
    : status.problem ? p.text("凭据不可读取") : p.text("未连接");
  const choices = [
    ["research_library", "book", "共享研究库", "已发布的研究成果"],
    ["custom_rss", "rss", "RSS / Atom", "粘贴地址"],
    ...(model.source_catalog.length ? [["rss", "list", "目录订阅", "选现成源"] as const] : []),
    ["web_query", "search", "网页搜索", "按关键词"],
    ["youtube_channel", "play", "YouTube", "频道 ID"],
    ["github", "tree", "GitHub", "未读通知"],
    ["gmail", "message", "Gmail", "按范围收信"],
  ];
  const sourceChoiceRows = choices.map(([kind, icon, title, hint]) => `<button type="button" class="feed-source-choice" data-feed-choose-kind="${kind}"><span class="feed-source-choice__mark" aria-hidden="true">${p.icon(icon)}</span><strong>${p.text(title)}</strong><small>${p.text(hint)}</small></button>`).join("");
  const taskPanels = renderTaskConfigPanels(model);
  return `<section class="feed-setup-panel" data-feed-sources-dialog aria-labelledby="feed-source-dialog-title" hidden><div class="feed-task-dialog-shell mw-form">
    <header class="mw-form__header"><div><h2 id="feed-source-dialog-title">${p.text("添加来源")}</h2><p data-feed-setup-description>${p.text("选一种来源。")}</p></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-feed-sources-close aria-label="${p.text("关闭")}">${p.icon("x")}</button></header>
    <div class="feed-task-dialog-body mw-form__body">
      <section data-feed-source-choices>${sourceChoiceRows}</section>
      <section data-feed-source-setup hidden><button class="mw-btn mw-btn--link feed-setup-back" type="button" data-feed-setup-back>${p.icon("back")}${p.text("选择其他来源")}</button>
        <form id="feed-add-task-form" data-feed-add-form hidden><label><span>${p.text("来源名称")} <small>${p.text("可选")}</small></span><input data-feed-add-name maxlength="80" placeholder="${p.text("例如：产品观察")}"></label>
          <div data-feed-setup-kind="research_library" hidden><label><span>${p.text("GitHub 仓库")}</span><input data-feed-source-value="research_library" value="molis-ai/research-library" required></label><label><span>${p.text("研究来源 id")}</span><input data-feed-research-source value="twitter-ai-observation" required></label><small>${p.text("读取已发布研究，保留原始链接、版本和使用限制。私有仓库使用本机 Git 登录。")}</small></div>
          <label data-feed-setup-kind="custom_rss" hidden><span>${p.text("订阅地址")}</span><input data-feed-source-value="custom_rss" type="url" placeholder="https://example.com/feed.xml" required><small>${p.text("填写网站提供的 RSS 或 Atom 地址。")}</small></label>
          <label data-feed-setup-kind="rss" hidden><span>${p.text("选择订阅")}</span><select data-feed-rss-definition>${catalogOptions}</select></label>
          <label data-feed-setup-kind="web_query" hidden><span>${p.text("你想追踪什么？")}</span><input data-feed-source-value="web_query" placeholder="${p.text("例如：AI 产品设计")}" required></label>
          <label data-feed-setup-kind="youtube_channel" hidden><span>${p.text("YouTube 频道 ID")}</span><input data-feed-source-value="youtube_channel" placeholder="UC…" required><small>${p.text("在 YouTube 频道的高级信息中复制频道 ID。")}</small></label>
          <label><span>${p.text("拉取频率")}</span><select data-feed-create-frequency><option value="0">${p.text("手动拉取")}</option><option value="60">${p.text("每小时")}</option><option value="360">${p.text("每 6 小时")}</option><option value="1440">${p.text("每天")}</option></select><small>${p.text("定时拉取需要 Molis Work 本地服务保持运行。")}</small></label>

          <p class="form-error" data-feed-add-error role="alert" hidden></p>
        </form>
        <article class="feed-connector-card" data-feed-setup-kind="github" hidden><div><strong>GitHub</strong><em>${connectorLabel(model.connector_auth.github, "github")}</em></div><p>${p.text("GitHub 账号在全局设置 · Connectors 管理。Feed 用同一份连接拉通知。")}</p><a class="mw-btn mw-btn--primary" href="${p.escape(connectorSettingsHref(model, "github"))}">${p.text("打开 Connectors")}</a></article><article class="feed-connector-card" data-feed-setup-kind="gmail" hidden><div><strong>Gmail</strong><em>${connectorLabel(model.connector_auth.gmail, "gmail")}</em></div><p>${p.text("在 Connectors 授权 Gmail 后，当前项目的 Feed 会按邮箱关联来源。")}</p><a class="mw-btn mw-btn--primary" href="${p.escape(connectorSettingsHref(model, "gmail"))}">${p.text("打开 Connectors")}</a></article>
      </section>
      <section data-feed-task-configs hidden>${taskPanels}</section>
      <p class="form-error" data-feed-source-error role="alert" hidden></p><p class="feed-source-progress" data-feed-source-progress role="status" hidden></p>
    </div><footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-feed-sources-close>${p.text("取消")}</button><button class="mw-btn mw-btn--primary" type="button" data-feed-config-submit data-source-config-save hidden>${p.text("保存来源资料")}</button><button class="mw-btn mw-btn--primary" type="button" form="feed-add-task-form" data-feed-source-register="custom_rss" hidden>${p.text("添加来源")}</button><a class="mw-btn mw-btn--primary" href="${p.escape(connectorSettingsHref(model, "github"))}" data-feed-footer-kind="github" hidden>${p.text("打开 Connectors")}</a><a class="mw-btn mw-btn--primary" href="${p.escape(connectorSettingsHref(model, "gmail"))}" data-feed-footer-kind="gmail" hidden>${p.text("打开 Connectors")}</a></footer>
  </div></section>`;
}

function renderOutRulesSection(model: FeedUiModel, source: FeedUiSource): string {
  const p = model.primitives;
  const id = p.escape(source.source_id);
  const rules = model.out_rules.filter((rule) => rule.source_id === source.source_id);
  const rows = rules.length
    ? rules.map((rule) => {
      const judgmentName = model.judgment?.functions.find((fn) => fn.function_key === rule.function_key)?.name
        ?? rule.function_key;
      const filter = [
        rule.contains ? p.text("包含 “{contains}”", { contains: rule.contains }) : p.text("该来源的全部新消息"),
        rule.function_key ? (judgmentName ?? "") : "",
        p.text(rule.admission === "inbox" ? "筛选后自动入 Inbox，待复核单独标明" : "仅建议"),
        rule.source_kind ? p.text("来源类型 {kind}", { kind: rule.source_kind }) : "",
      ].filter(Boolean).join(" · ");
      return `<article class="feed-capture-rule" data-feed-out-rule-row="${p.escape(rule.rule_id)}"><div class="feed-capture-rule-copy"><strong>${p.escape(rule.name)}</strong><p>${p.escape(filter)}</p><small>${rule.enabled ? p.text("已启用") : p.text("已停用")}</small></div><div class="feed-capture-rule-actions"><button class="mw-btn mw-btn--ghost" type="button" data-feed-out-rule-toggle="${p.escape(rule.rule_id)}" data-enabled="${rule.enabled ? "true" : "false"}"${source.prototype ? " disabled" : ""}>${rule.enabled ? p.text("停用") : p.text("启用")}</button><button class="mw-btn mw-btn--danger-outline" type="button" data-feed-out-rule-delete="${p.escape(rule.rule_id)}"${source.prototype ? " disabled" : ""}>${p.text("删除")}</button></div></article>`;
    }).join("")
    : `<p class="feed-source-empty">${p.text("还没有捕捉规则。在下方直接添加，无需离开 Feed。")}</p>`;
  const form = source.prototype ? `<p>${p.text("添加真实来源后，即可试跑和保存规则。")}</p>` : `<section class="feed-rule-composer" data-feed-rule-composer>
    <h3>${p.text("新增捕捉规则")}</h3><p>${p.text("告诉 Feed 什么值得关注，先看看会捕捉哪些消息。")}</p>
    <div class="feed-rule-modes" role="group" aria-label="${p.text("匹配方式")}"><button type="button" data-feed-rule-mode="keyword" aria-pressed="true">${p.text("关键词")}</button><button type="button" data-feed-rule-mode="natural" aria-pressed="false">${p.text("用自然语言描述")}</button><button type="button" data-feed-rule-mode="existing" aria-pressed="false">${p.text("复用规则")}</button></div>
    <label><span>${p.text("规则名称")}</span><input data-feed-out-rule-name maxlength="80" placeholder="${p.text("例如：需要跟进的产品反馈")}"></label>
    <label data-feed-rule-field="keyword"><span>${p.text("消息包含")}</span><input data-feed-out-rule-contains maxlength="200" placeholder="${p.text("例如：bug")}"><small>${p.text("按完整关键词匹配标题、摘要、标签和正文。")}</small></label>
    <label data-feed-rule-field="natural" hidden><span>${p.text("什么样的消息值得关注？")}</span><textarea data-feed-rule-instructions rows="4" maxlength="4000" placeholder="${p.text("例如：用户反馈无法登录、付款失败或数据丢失；忽略日常通知和推广。")}"></textarea><small>${p.text("AI 会按这段描述判断消息；试跑使用已配置的 Functions 服务。")} <a href="/settings/connectors?connector=typesafe">${p.text("管理 AI 连接")}</a></small></label>
    <div data-feed-rule-field="existing" hidden>${renderCaptureJudgmentSelect(model, "data-feed-out-rule-function-key")}<p>${p.text("使用已发布的判断规则，仍可在这里预览结果。")}</p></div>
    ${renderAdmissionSelect(model, "data-feed-out-rule-admission")}
    <div class="feed-rule-preview" data-feed-rule-preview hidden aria-live="polite"></div>
    <div class="feed-rule-actions"><button class="mw-btn mw-btn--secondary" type="button" data-feed-rule-preview-run>${p.icon("play")}${p.text("预览最近消息")}</button><button class="mw-btn mw-btn--primary" type="button" data-feed-out-rule-create>${p.text("保存并启用")}</button></div>
    <p class="feed-rule-note">${p.text("预览不会入箱；启用后只处理新消息和更新。")}</p><p data-feed-rule-status role="status" hidden></p>
  </section>`;
  return `<section class="feed-rules-panel" data-feed-out-rules="${id}"><div class="feed-section-heading"><h3>${p.text("已有捕捉规则")}</h3><span>${p.text("{count} 条规则", { count: rules.length })}</span></div><p>${p.text("符合条件的消息会保存精确版本，你可以决定是否自动加入 Inbox。")}</p><div class="feed-source-list">${rows}</div>${form}${rules.length ? `<details class="feed-task-extra"><summary>${p.text("处理已有消息")}</summary><p>${p.text("将当前已启用规则应用到最近 20 条消息，可能写入 Inbox。")}</p><button class="mw-btn mw-btn--secondary" type="button" data-feed-out-rules-evaluate="${id}">${p.text("对最近 20 条消息运行当前规则")}</button></details>` : ''}</section>`;
}

function renderAdmissionSelect(model: FeedUiModel, attr: string): string {
  const p = model.primitives;
  return `<label><span>${p.text("处理方式")}</span><select ${attr}><option value="suggest">${p.text("仅建议，手动处理")}</option><option value="inbox">${p.text("筛选后自动入 Inbox")}</option></select></label>`;
}

function renderCaptureJudgmentSelect(model: FeedUiModel, attr: string, selected: string | null = null): string {
  const judgment = model.judgment;
  if (!judgment) return "";
  const p = model.primitives;
  const current = selected ?? "";
  const emptySelected = current === "" ? " selected" : "";
  const options = [
    `<option value=""${emptySelected}>${p.text("不用判断")}</option>`,
    ...judgment.functions.map((fn) => {
      const on = fn.function_key === current ? " selected" : "";
      return `<option value="${p.escape(fn.function_key)}"${on}>${p.escape(fn.name)}</option>`;
    }),
  ].join("");
  return `<label><span>${p.text("判断")} <small>${p.text("可选")}</small></span><select ${attr}>${options}</select></label>`;
}

function renderSourceDetail(source: FeedUiSource, selected: boolean, model: FeedUiModel): string {
  const p = model.primitives;
  if (source.prototype) return renderPrototypeSourceDetail(source, selected, model);
  const sourceId = p.escape(source.source_id);
  const scheduleMode = source.schedule.mode;
  const scheduleEnabled = scheduleMode === "interval" && source.schedule.enabled;
  const intervalMinutes = scheduleMode === "interval" ? source.schedule.interval_minutes : 60;
  const canSync = source.enabled && source.status !== "paused" && source.status !== "disconnected";
  const connector = source.sync_kind === "github" || source.sync_kind === "gmail" || source.sync_kind === "connector";
  const scope = typeof source.config.scope === "string" ? source.config.scope : source.scope_label;
  const scopeField = source.ui_kind === "gmail"
    ? `<label><span>${p.text("拉取范围")}</span><select data-source-config-field="scope">${source.scope_options.map((option) => `<option value="${p.escape(option.value)}"${scope === option.value ? " selected" : ""}>${p.escape(option.label)} · ${p.escape(option.value)}</option>`).join("")}</select><small class="source-config-help">${p.text("首次同步和增量同步都会执行同一范围；不做完整邮箱回填。")}</small></label>`
    : `<label><span>${p.text("拉取范围")}</span><textarea rows="3" readonly>${p.escape(scope)}</textarea></label>`;
  const runs = renderSourceRuns(source, p);
  const messages = source.messages.length ? `<ul>${source.messages.map((message) => `<li>${p.icon("rss")}<span><strong>${p.escape(message)}</strong><small>${p.escape(source.name)}</small></span></li>`).join("")}</ul>` : `<div class="source-panel-empty">${p.icon("archive")}<strong>${p.text("还没有来源消息")}</strong></div>`;
  return `<article class="source-detail" data-source-detail="${sourceId}" data-real-source-id="${sourceId}"${selected ? "" : " hidden"}><header class="source-detail-header"><div class="source-detail-identity"><span class="source-detail-mark">${p.icon(sourceIconName(source.ui_kind))}</span><div><div class="source-detail-labels"><span>${p.escape(source.type_label)}</span><em>${p.text("真实本地来源")}</em></div><h1>${p.escape(source.name)}</h1><p>${p.escape(source.description)}</p></div></div><div class="source-detail-health" data-source-status="${p.escape(source.status_kind)}"><strong data-source-health-label>${p.escape(source.status_label)}</strong><small>${p.text("来自数据库与运行记录")}</small></div></header><nav class="mw-tabs source-detail-tabs" role="tablist" aria-label="${p.text("来源详情")}"><button class="is-active" type="button" role="tab" aria-selected="true" data-source-detail-tab="overview">${p.text("概览")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="config">${p.text("配置")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="schedule">${p.text("拉取计划")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="messages">${p.text("来源消息")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="runs">${p.text("运行状态")}</button></nav><div class="source-detail-panels"><section class="source-detail-panel source-detail-panel--overview" data-source-detail-panel="overview"><section class="source-now"><div><h2>${source.status_kind === "attention" ? p.text("需要你的处理") : source.status_kind === "syncing" ? p.text("正在拉取新消息") : source.status_kind === "paused" ? p.text("来源已暂停") : p.text("来源运行正常")}</h2><p>${p.text("手动拉取与后台计划共用同一幂等运行记录。")}</p></div><button class="mw-btn mw-btn--primary" type="button" data-source-runtime-action="sync" data-source-id="${sourceId}"${canSync ? "" : " disabled"}>${p.icon("refresh")}${p.text("立即拉取")}</button><p data-source-action-status role="status" hidden></p></section><section class="source-overview-section"><header class="source-panel-heading"><h2>${p.text("概览")}</h2><p>${p.text("账号、接入源与拉取计划")}</p></header><dl class="source-overview-ledger"><div><dt>${p.text("账号 / 接入源")}</dt><dd>${p.escape(source.account_label || p.text("公开来源"))}</dd></div><div><dt>${p.text("连接状态")}</dt><dd>${p.escape(source.status_label)}</dd></div><div><dt>${p.text("上次拉取")}</dt><dd>${p.escape(source.last_fetch_label)}</dd></div><div><dt>${p.text("下次拉取")}</dt><dd>${p.escape(source.next_fetch_label)}</dd></div><div><dt>${p.text("已拉取消息")}</dt><dd>${source.item_count}</dd></div><div><dt>${p.text("范围")}</dt><dd>${p.escape(source.scope_label)}</dd></div>${source.protocol_status ? `<div><dt>${p.text("条件请求")}</dt><dd>${p.escape(source.protocol_status)}</dd></div>` : ""}</dl></section><div class="source-runtime-actions"><button class="mw-btn mw-btn--secondary" type="button" data-source-runtime-action="${source.enabled ? "pause" : "resume"}" data-source-id="${sourceId}">${source.enabled ? p.text("暂停来源") : p.text("恢复来源")}</button>${connector ? `<a class="mw-btn mw-btn--secondary" href="${p.escape(connectorSettingsHref(model, source.kind))}">${p.text("管理账号连接")}</a><button class="mw-btn mw-btn--secondary" type="button" data-source-runtime-action="disconnect" data-source-id="${sourceId}">${p.text("断开账号")}</button>` : ""}<details><summary>${p.text("删除来源")}</summary><p>${p.text("请选择历史处理方式。两种操作都会停止后续拉取。")}</p><div><button class="mw-btn mw-btn--secondary" type="button" data-source-delete="retain_history" data-source-id="${sourceId}">${p.text("删除来源，保留历史")}</button><button class="mw-btn mw-btn--danger" type="button" data-source-delete="delete_local_history" data-source-id="${sourceId}">${p.text("连同本地历史删除")}</button></div></details></div></section><section class="source-detail-panel" data-source-detail-panel="config" hidden><header class="source-panel-heading"><h2>${p.text("配置")}</h2><p>${p.text("地址与账号身份由 Provider 管理；这里只保存非秘密配置")}</p></header><div class="source-config-sheet"><label><span>${p.text("来源名称")}</span><input value="${p.escape(source.name)}" data-source-config-field="name"></label><label><span>${p.text("账号 / 地址")}</span><input value="${p.escape(source.configured_endpoint)}"${source.editable_endpoint ? ` data-source-config-field="feed_url"` : ` readonly aria-readonly="true"`}></label><label><span>${p.text("说明")}</span><textarea rows="2" data-source-config-field="description">${p.escape(source.description)}</textarea></label>${scopeField}<div class="source-config-actions"><button class="mw-btn mw-btn--primary" type="button" data-source-config-save data-source-id="${sourceId}">${p.text("保存配置")}</button><small>${p.text("保存后请立即拉取验证。")}</small></div><p data-source-action-status role="status" hidden></p></div></section><section class="source-detail-panel" data-source-detail-panel="schedule" hidden><div class="source-schedule-sheet"><div class="source-schedule-heading"><div><h2>${p.text("定时拉取")}</h2><p>${p.text("计划由本地服务执行；重启或休眠错过时只补拉一次。")}</p></div><label class="source-schedule-toggle"><input type="checkbox" ${scheduleEnabled ? "checked " : ""}data-source-schedule-enabled><span>${scheduleEnabled ? p.text("已开启") : p.text("已暂停")}</span></label></div><label><span>${p.text("模式")}</span><select data-source-schedule-mode><option value="manual"${scheduleMode === "manual" ? " selected" : ""}>${p.text("仅手动拉取")}</option><option value="interval"${scheduleMode === "interval" ? " selected" : ""}>${p.text("按固定间隔")}</option></select></label><label><span>${p.text("频率")}</span><select data-source-schedule-interval>${[15, 30, 60, 360, 720, 1440].map((minutes) => `<option value="${minutes}"${intervalMinutes === minutes ? " selected" : ""}>${minutes} min</option>`).join("")}</select></label><div class="source-schedule-actions"><button class="mw-btn mw-btn--primary" type="button" data-source-schedule-save data-source-id="${sourceId}">${p.text("保存拉取计划")}</button><small>${p.escape(source.next_fetch_label)}</small></div><p data-source-action-status role="status" hidden></p></div></section><section class="source-detail-panel" data-source-detail-panel="messages" hidden><div class="source-message-list"><header><div><h2>${p.text("最近来自此来源")}</h2><p>${p.text("完整消息仍保存在 Feed，这里只用于来源核对。")}</p></div><button class="mw-btn mw-btn--link" type="button" data-work-surface-open="feed" data-feed-preset="feed" data-feed-source="${p.escape(source.name)}">${p.text("在 Feed 中查看")}${p.icon("chevron-right")}</button></header>${messages}</div></section><section class="source-detail-panel" data-source-detail-panel="runs" hidden><header class="source-panel-heading"><h2>${p.text("运行状态")}</h2><p>${p.text("手动拉取或计划第一次执行后，会在这里留下可诊断记录。")}</p></header>${runs}</section></div></article>`;
}

function renderPrototypeSourceDetail(source: FeedUiSource, selected: boolean, model: FeedUiModel): string {
  const p = model.primitives;
  const sourceId = p.escape(source.source_id);
  const intervalMinutes = source.schedule.mode === "interval" ? source.schedule.interval_minutes : 60;
  const scheduleEnabled = source.schedule.mode === "interval" && source.schedule.enabled;
  const statusCopy = source.status_kind === "attention"
    ? p.text("授权或运行状态需要处理；最后可信游标不会被失败结果覆盖。")
    : source.status_kind === "syncing"
      ? p.text("正在读取新条目；相同计划槽不会重复写入。")
      : p.text("手动拉取与后台计划共用同一幂等运行记录。");
  const messages = source.messages.length
    ? `<ul>${source.messages.map((message) => `<li>${p.icon("rss")}<span><strong>${p.escape(message)}</strong><small>${p.escape(source.name)}</small></span></li>`).join("")}</ul>`
    : `<div class="source-panel-empty">${p.icon("archive")}<strong>${p.text("还没有来源消息")}</strong></div>`;
  return `<article class="source-detail" data-source-detail="${sourceId}"${selected ? "" : " hidden"}>
    <header class="source-detail-header"><div class="source-detail-identity"><span class="source-detail-mark">${p.icon(sourceIconName(source.ui_kind))}</span><div><div class="source-detail-labels"><span>${p.escape(source.type_label)}</span><em>${p.text("高保真演示 · 不连接外部服务")}</em></div><h1>${p.escape(source.name)}</h1><p>${p.escape(source.description)}</p></div></div><div class="source-detail-health" data-source-status="${p.escape(source.status_kind)}"><strong data-source-health-label>${p.escape(source.status_label)}</strong><small>${p.text("模拟状态")}</small></div></header>
    <nav class="mw-tabs source-detail-tabs" role="tablist" aria-label="${p.text("来源详情")}"><button class="is-active" type="button" role="tab" aria-selected="true" data-source-detail-tab="overview">${p.text("概览")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="config">${p.text("配置")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="schedule">${p.text("拉取计划")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="messages">${p.text("来源消息")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="runs">${p.text("运行状态")}</button></nav>
    <div class="source-detail-panels">
      <section class="source-detail-panel source-detail-panel--overview" data-source-detail-panel="overview"><section class="source-now"><div><h2>${source.status_kind === "attention" ? p.text("需要你的处理") : source.status_kind === "syncing" ? p.text("正在拉取新消息") : p.text("来源运行正常")}</h2><p>${statusCopy}</p></div><button class="mw-btn mw-btn--primary" type="button" data-prototype-source-sync="${sourceId}">${p.icon("refresh")}${p.text("模拟立即拉取")}</button><p data-prototype-action-status role="status" hidden></p></section><section class="source-overview-section"><header class="source-panel-heading"><h2>${p.text("概览")}</h2><p>${p.text("账号、接入源与拉取计划")}</p></header><dl class="source-overview-ledger"><div><dt>${p.text("账号 / 接入源")}</dt><dd>${p.escape(source.account_label || p.text("公开来源"))}</dd></div><div><dt>${p.text("连接状态")}</dt><dd>${p.escape(source.status_label)}</dd></div><div><dt>${p.text("上次拉取")}</dt><dd>${p.escape(source.last_fetch_label)}</dd></div><div><dt>${p.text("下次拉取")}</dt><dd>${p.escape(source.next_fetch_label)}</dd></div><div><dt>${p.text("已拉取消息")}</dt><dd>${source.item_count}</dd></div><div><dt>${p.text("范围")}</dt><dd>${p.escape(source.scope_label)}</dd></div>${source.protocol_status ? `<div><dt>${p.text("条件请求")}</dt><dd>${p.escape(source.protocol_status)}</dd></div>` : ""}</dl></section></section>
      <section class="source-detail-panel" data-source-detail-panel="config" hidden><header class="source-panel-heading"><h2>${p.text("配置")}</h2><p>${p.text("不会写入数据库或外部账号")}</p></header><div class="source-config-sheet"><label><span>${p.text("来源名称")}</span><input value="${p.escape(source.name)}" data-prototype-config-input></label><label><span>${p.text("账号 / 地址")}</span><input value="${p.escape(source.configured_endpoint)}" readonly aria-readonly="true"></label><label><span>${p.text("说明")}</span><textarea rows="2" data-prototype-config-input>${p.escape(source.description)}</textarea></label><label><span>${p.text("拉取范围")}</span><textarea rows="3" data-prototype-config-input>${p.escape(source.scope_label)}</textarea></label><div class="source-config-actions"><button class="mw-btn mw-btn--primary" type="button" data-prototype-config-save>${p.text("保存演示配置")}</button><small>${p.text("不会写入数据库或外部账号")}</small></div><p data-prototype-config-status role="status" hidden></p></div></section>
      <section class="source-detail-panel" data-source-detail-panel="schedule" hidden><div class="source-schedule-sheet"><div class="source-schedule-heading"><div><h2>${p.text("定时拉取")}</h2><p>${p.text("仅演示计划配置；浏览器关闭后不会继续运行。")}</p></div><label class="source-schedule-toggle"><input type="checkbox" ${scheduleEnabled ? "checked " : ""}data-prototype-schedule-enabled><span>${scheduleEnabled ? p.text("已开启") : p.text("已暂停")}</span></label></div><label><span>${p.text("模式")}</span><select data-prototype-schedule-frequency><option value="manual"${source.schedule.mode === "manual" ? " selected" : ""}>${p.text("仅手动拉取")}</option><option value="interval"${source.schedule.mode === "interval" ? " selected" : ""}>${p.text("按固定间隔")}</option></select></label><label><span>${p.text("频率")}</span><select data-prototype-schedule-frequency>${[15, 30, 60, 360, 720, 1440].map((minutes) => `<option value="${minutes}"${intervalMinutes === minutes ? " selected" : ""}>${minutes} min</option>`).join("")}</select></label><div class="source-schedule-actions"><button class="mw-btn mw-btn--primary" type="button" data-prototype-schedule-save>${p.text("保存拉取计划")}</button><small>${p.escape(source.next_fetch_label)}</small></div><p data-prototype-schedule-status role="status" hidden></p></div></section>
      <section class="source-detail-panel" data-source-detail-panel="messages" hidden><div class="source-message-list"><header><div><h2>${p.text("最近来自此来源")}</h2><p>${p.text("完整消息仍保存在 Feed，这里只用于来源核对。")}</p></div><button class="mw-btn mw-btn--link" type="button" data-work-surface-open="feed" data-feed-preset="feed" data-feed-source="${p.escape(source.name)}">${p.text("在 Feed 中查看")}${p.icon("chevron-right")}</button></header>${messages}</div></section>
      <section class="source-detail-panel" data-source-detail-panel="runs" hidden><header class="source-panel-heading"><h2>${p.text("运行状态")}</h2><p>${p.text("这里展示模拟运行记录，不会启动后台任务。")}</p></header><ol class="source-run-ledger"><li data-run-state="complete"><span>${p.icon("check")}</span><div><strong>${p.text("最近一次拉取")}</strong><p>${source.status_kind === "attention" ? p.text("失败 · 授权已失效，游标未推进") : p.text("完成 · 新增 3，去重 8")}</p></div><time>${p.escape(source.last_fetch_label)}</time></li><li data-run-state="scheduled"><span>${p.icon("waiting")}</span><div><strong>${p.text("下一次计划")}</strong><p>${p.escape(source.schedule_label)}</p></div><time>${p.escape(source.next_fetch_label)}</time></li></ol></section>
    </div><p class="prototype-honesty-note source-honesty-note">${p.icon("alert")}${p.text("此来源用于验证高保真路径；同步、授权与调度均为页面内模拟。")}</p>
  </article>`;
}

function renderItemActions(item: FeedUiItem, inboxActive: boolean, p: FeedUiPrimitives): string {
  if (item.disposition === "archived") {
    return `<button class="mw-btn mw-btn--secondary" type="button" data-feed-action="restore" data-feed-restore-target="feed" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}">${p.text("恢复到 Feed")}</button>`;
  }
  const shown = inboxActive
    ? [...FEED_CAPTURE_DISPOSITION_IDS]
    : visibleFeedDispositionIds(item.suggested_behavior_ids, true);
  const manualAdmission = !inboxActive && !shown.includes(INBOX_ADMIT_BEHAVIOR_ID)
    ? `<button class="mw-btn mw-btn--secondary" type="button" data-feed-action="inbox" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}">${p.text("手动加入 Inbox")}</button>` : "";
  return shown.map((id, index) => dispositionButton(item, id, index === 0, inboxActive, p)).join("") + manualAdmission;
}

function dispositionButton(
  item: FeedUiItem,
  behaviorId: string,
  primary: boolean,
  inboxActive: boolean,
  p: FeedUiPrimitives,
): string {
  const itemId = p.escape(item.item_id);
  const revision = item.revision;
  if (behaviorId === INBOX_ADMIT_BEHAVIOR_ID) {
    const cls = primary ? "mw-btn mw-btn--primary" : "mw-btn mw-btn--secondary";
    return `<button class="${cls}" type="button" data-feed-action="inbox" data-feed-item-id="${itemId}" data-feed-revision="${revision}"${inboxActive ? " disabled" : ""}>${p.icon("inbox")}${inboxActive ? p.text("已加入 Inbox") : p.text("加入 Inbox")}</button>`;
  }
  if (behaviorId === FEED_SAVE_BEHAVIOR_ID) {
    const saved = item.disposition === "saved";
    const cls = primary ? "mw-btn mw-btn--primary" : "mw-btn mw-btn--secondary";
    return `<button class="${cls}" type="button" data-feed-action="save" data-feed-item-id="${itemId}" data-feed-revision="${revision}"${saved ? " disabled" : ""}>${saved ? p.text("已保存为资料") : p.text("保存为资料")}</button>`;
  }
  if (behaviorId === FEED_PROMOTE_BEHAVIOR_ID) {
    const cls = primary ? "mw-btn mw-btn--primary" : "mw-btn mw-btn--secondary";
    return `<button class="${cls}" type="button" data-feed-action="promote" data-feed-item-id="${itemId}" data-feed-revision="${revision}">${p.icon("target")}${item.linked_goal_id ? p.text("查看 Goal") : p.text("升格为 Goal")}</button>`;
  }
  if (behaviorId !== FEED_ARCHIVE_BEHAVIOR_ID) return "";
  const cls = primary ? "mw-btn mw-btn--primary" : "mw-btn mw-btn--ghost feed-action-subtle";
  return `<button class="${cls}" type="button" data-feed-action="archive" data-feed-item-id="${itemId}" data-feed-revision="${revision}">${p.text("忽略")}</button>`;
}

function dispositionLabel(value: string, p: FeedUiPrimitives): string {
  const labels: Record<string, string> = {
    feed: p.text("仅 Feed"),
    inbox: p.text("已加入 Inbox"),
    saved: p.text("已保存为资料"),
    promoted: p.text("已升格为 Goal"),
    processing: p.text("处理中"),
    archived: p.text("已忽略"),
  };
  return labels[value] ?? value;
}

function renderFeedEntryStatus(entry: FeedUiEntry, p: FeedUiPrimitives): string {
  if (entry.disposition !== "feed") {
    const marks = {
      inbox: { tone: "attention", icon: "inbox" },
      saved: { tone: "done", icon: "archive" },
      promoted: { tone: "progress", icon: "target" },
      processing: { tone: "progress", icon: "waiting" },
      archived: { tone: "quiet", icon: "archive" },
    } as const;
    const mark = marks[entry.disposition as keyof typeof marks] ?? { tone: "idle" as const, icon: "dot" as const };
    return renderStatusMark({
      label: dispositionLabel(entry.disposition, p),
      tone: mark.tone,
      icon: mark.icon,
      plain: true,
      className: "feed-entry-status",
    });
  }
  return renderStatusMark({
    label: p.text(entry.read ? "已读" : "未读"),
    tone: entry.read ? "quiet" : "attention",
    icon: entry.read ? "check" : "bell",
    plain: true,
    className: "feed-entry-status",
    labelAttrs: { "data-feed-read-state": true },
  });
}

function destinationCopy(value: string, p: FeedUiPrimitives): readonly [string, string] {
  const copy: Record<string, readonly [string, string]> = {
    feed: [p.text("仅保留在 Feed"), p.text("没有占用 Inbox；原消息和来源保持可追溯")],
    inbox: [p.text("已加入 Inbox"), p.text("Inbox 只保存需处理引用；原消息仍在 Feed")],
    saved: [p.text("已保存为资料"), p.text("完整消息、来源和已有资料保持关联")],
    promoted: [p.text("已升格为 Goal"), p.text("Goal 使用这条消息作为可追溯输入")],
    processing: [p.text("正在处理"), p.text("关联 Goal 已打开，原消息仍保留")],
    archived: [p.text("已忽略"), p.text("默认列表不再显示，仍可从状态筛选恢复")],
  };
  return copy[value] ?? [value, p.text("原消息仍然保留")];
}

function sourceIconName(kind: FeedUiSource["ui_kind"]) {
  return kind === "github" ? "tree" : kind === "gmail" ? "mail" : kind === "rss" ? "rss" : kind === "connector" ? "link" : "link";
}
