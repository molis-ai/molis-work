import type {
  AttentionEntryRecord,
  AttentionReason,
  AttentionStatus,
} from "@adeptify/goalboard-contracts/modules/attention-resumption";
import type {
  FeedItemDisposition,
  FeedItemRecord,
  FeedMaterialRecord,
} from "@adeptify/goalboard-contracts/modules/feed";
import type { SourceRecord } from "@adeptify/goalboard-contracts/modules/sources";
import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@adeptify/goalboard-contracts/platform/ui";

export const FEED_UI_CONTRIBUTION_ID = "io.goalboard.native.feed.ui.v1";

export type FeedUiPreset = "feed" | "inbox_message";
export type FeedUiProvider = "github" | "gmail" | "rss" | "other";

export interface FeedUiMaterial extends FeedMaterialRecord {
  readonly content?: string | null;
}

export interface FeedUiItem extends Omit<FeedItemRecord, "materials"> {
  readonly item_type: FeedUiPreset;
  readonly materials: readonly FeedUiMaterial[];
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
  readonly ui_kind: "github" | "gmail" | "rss" | "other";
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

export interface FeedUiRelayImport {
  readonly available: boolean;
  readonly source_count: number;
  readonly item_count: number;
  readonly material_count: number;
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

export interface FeedUiModel {
  readonly route_prefix: string;
  readonly preset: FeedUiPreset;
  readonly entries: readonly FeedUiEntry[];
  readonly sources: readonly FeedUiSource[];
  readonly relay_import: FeedUiRelayImport;
  readonly source_catalog: readonly FeedUiCatalogSource[];
  readonly connector_auth: {
    readonly github: FeedUiConnectorStatus;
    readonly gmail: FeedUiConnectorStatus;
  };
  readonly primitives: FeedUiPrimitives;
  readonly demo: boolean;
  readonly active?: boolean;
  readonly error?: string | null;
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
  | "persisted-detail";

export const feedUiDescriptor: UiContributionDescriptor = {
  contribution_id: FEED_UI_CONTRIBUTION_ID,
  plugin_id: "io.goalboard.native.feed",
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
      default:
        throw new Error(`Feed UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderFeedDirectory(model: FeedUiModel): string {
  const { primitives: p, preset } = model;
  const entries = [...model.entries]
    .sort((left, right) => right.attention_rank - left.attention_rank || right.updated_at.localeCompare(left.updated_at));
  const visibleEntries = entries.filter((entry) => entry.preset === preset);
  const initial = visibleEntries[0] ?? null;
  const sourceLabels = [...new Set(entries.map((entry) => entry.source_label).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  const sourceOptions: readonly (readonly [string, string])[] = [["all", p.text("全部来源")], ...sourceLabels.map((label) => [label, label] as const)];
  const typeOptions = [["all", p.text("全部类型")], ["github", "GitHub"], ["gmail", "Gmail"], ["rss", "RSS / Atom"], ["other", p.text("其他类型")]] as const;
  const timeOptions = [["all", p.text("全部时间")], ["day", p.text("最近 24 小时")], ["week", p.text("最近 7 天")], ["month", p.text("最近 30 天")]] as const;
  const statusOptions = [["active", preset === "feed" ? p.text("未忽略") : p.text("待处理")], ["all", p.text("全部状态")], ["feed", p.text("仅 Feed")], ["inbox", p.text("待处理")], ["saved", p.text("已保存")], ["promoted", p.text("已升格")], ["processing", p.text("处理中")], ["archived", p.text("已忽略")]] as const;
  const sortOptions = [["newest", p.text("最新在前")], ["oldest", p.text("最早在前")], ["source", p.text("按来源")], ["title", p.text("按标题")]] as const;
  const filterOptions = (kind: string, options: readonly (readonly [string, string])[], selected: string) =>
    options.map(([value, label]) => `<button class="feed-filter-option" type="button" role="radio" aria-checked="${value === selected}" data-feed-filter-option="${kind}" data-feed-filter-value="${p.escape(value)}"><span>${p.escape(label)}</span>${p.icon("check")}</button>`).join("");
  const selectOptions = (options: readonly (readonly [string, string])[]) => options.map(([value, label]) => `<option value="${p.escape(value)}">${p.escape(label)}</option>`).join("");
  const rows = entries.map((entry) => {
    const selected = entry.entry_id === initial?.entry_id;
    const visible = entry.preset === preset;
    const stateLabel = entry.prototype
      ? entry.preset === "feed" ? p.text("未安排") : p.text("需介入")
      : dispositionLabel(entry.disposition, entry.preset, p);
    return `<button class="feed-list-item directory-list-row${selected ? " is-selected" : ""}" type="button" role="option" aria-selected="${selected}" tabindex="${selected ? "0" : "-1"}" data-feed-entry-id="${p.escape(entry.entry_id)}"${entry.item_id ? ` data-feed-item-id="${p.escape(entry.item_id)}"` : ""}${entry.inbox_entry ? ` data-inbox-entry-id="${p.escape(entry.inbox_entry.entry_id)}" data-inbox-entry-revision="${entry.inbox_entry.revision}" data-inbox-subject-type="${entry.inbox_entry.subject_type}" data-inbox-reason="${entry.inbox_entry.reason}"` : ""} data-feed-entry-type="${entry.preset}" data-feed-entry-provider="${entry.provider}" data-feed-entry-attention-rank="${entry.attention_rank}" data-feed-entry-persisted="${entry.item && !entry.prototype ? "true" : "false"}"${entry.prototype ? ` data-feed-entry-prototype="true"` : ""} data-feed-entry-read="${entry.read ? "read" : "unread"}" data-feed-entry-source="${p.escape(entry.source_label)}" data-feed-entry-status="${p.escape(entry.disposition)}" data-feed-entry-time="${p.escape(entry.updated_at)}" data-feed-entry-title="${p.escape(entry.title)}" data-feed-entry-search="${p.escape(`${entry.title} ${entry.summary} ${entry.source_label}`.toLocaleLowerCase())}"${visible ? "" : " hidden"}><span class="feed-list-copy"><strong title="${p.escape(entry.title)}">${p.escape(entry.title)}</strong></span><span class="directory-row-state"><span class="feed-list-state" data-feed-disposition="${p.escape(entry.disposition)}">${p.escape(stateLabel)}</span></span></button>`;
  }).join("");
  return `<section class="desktop-directory-panel feed-directory" data-directory-panel="feed" data-feed-directory data-feed-preset="${preset}" hidden>
    <header class="desktop-directory-heading feed-directory-heading"><button type="button" data-directory-back aria-label="${p.text("返回上一级")}">${p.icon("back")}</button><span><strong data-feed-directory-title>${preset === "feed" ? "Feed" : "Inbox"}</strong><small data-feed-directory-copy>${preset === "feed" ? p.text("所有来源消息，完整保留") : p.text("只保留需要你介入的事情")}</small></span><button class="feed-import-trigger" type="button" data-work-surface-open="sources" aria-label="${p.text("打开来源")}">${p.icon("settings")}</button></header>
    <div class="feed-directory-tools"><div class="feed-directory-toolbar"><label class="feed-directory-search">${p.icon("search")}<input type="search" data-feed-search aria-label="${p.text("搜索 Item")}" placeholder="${p.text("搜索标题、摘要或来源")}" autocomplete="off"></label><div class="feed-filter-control"><button class="feed-filter-trigger" type="button" data-feed-filter-trigger aria-expanded="false" aria-haspopup="true" aria-controls="feed-filter-panel" aria-label="${p.text("筛选与排序")}">${p.icon("filter")}<span data-feed-filter-badge hidden>0</span></button><section class="feed-filter-panel" id="feed-filter-panel" data-feed-filter-panel hidden aria-label="${p.text("筛选与排序")}"><header><strong>${p.text("筛选与排序")}</strong><button type="button" data-feed-filter-reset>${p.text("清除筛选")}</button></header><div class="feed-filter-section"><span>${p.text("来源")}</span><div class="feed-filter-options">${filterOptions("source", sourceOptions, "all")}</div></div><div class="feed-filter-section"><span>${p.text("类型")}</span><div class="feed-filter-options">${filterOptions("type", typeOptions, "all")}</div></div><div class="feed-filter-section"><span>${p.text("时间")}</span><div class="feed-filter-options">${filterOptions("time", timeOptions, "all")}</div></div><div class="feed-filter-section"><span>${p.text("状态")}</span><div class="feed-filter-options">${filterOptions("status", statusOptions, "active")}</div></div><div class="feed-filter-section"><span>${p.text("排序")}</span><div class="feed-filter-options">${filterOptions("sort", sortOptions, "newest")}</div></div></section></div></div><select data-feed-source-filter hidden tabindex="-1" aria-hidden="true">${selectOptions(sourceOptions)}</select><select data-feed-type-filter hidden tabindex="-1" aria-hidden="true">${selectOptions(typeOptions)}</select><select data-feed-time-filter hidden tabindex="-1" aria-hidden="true">${selectOptions(timeOptions)}</select><select data-feed-status-filter hidden tabindex="-1" aria-hidden="true">${selectOptions(statusOptions)}</select><select data-feed-sort hidden tabindex="-1" aria-hidden="true">${selectOptions(sortOptions)}</select>${model.demo ? `<button type="button" hidden data-prototype-feed-empty-state>${p.text("预览空状态")}</button>` : ""}</div>
    <div class="feed-item-scroll" data-feed-list role="listbox" aria-label="${p.text("Item 列表")}">${rows}<div class="feed-list-empty" data-feed-empty${entries.length ? " hidden" : ""}>${p.icon("input")}<strong data-feed-empty-title>${p.text("这里还没有 Item")}</strong><p data-feed-empty-copy>${p.text("接入来源后，消息和 Feed 会出现在这里。")}</p><button type="button" data-feed-clear-filters hidden>${p.text("清除筛选")}</button>${model.demo ? `<button type="button" data-prototype-feed-restore hidden>${p.text("恢复列表")}</button>` : ""}<button type="button" data-feed-empty-sources data-work-surface-open="sources">${p.text("打开来源")}</button></div></div>
  </section>`;
}

export function renderFeedWorkbench(model: FeedUiModel): string {
  const { details, initial, initialIsInline } = feedWorkbenchDetails(model);
  return `<section class="desktop-work-surface feed-workbench" data-work-surface="feed" data-work-surface-label="${model.preset === "feed" ? "Feed" : "Inbox"}" data-feed-workbench data-feed-preset="${model.preset}" data-loaded="${Boolean(model.active)}"${model.active ? ` data-loaded-preset="${model.preset}"` : ""}${model.active ? "" : " hidden"}>
    ${model.error ? `<div class="feed-error-state" role="alert"><strong>${model.primitives.text("Feed 暂时无法载入")}</strong><p>${model.primitives.escape(model.error)}</p><button type="button" data-retry-feed-detail>${model.primitives.text("重试")}</button></div>` : model.active ? details : ""}
    <div class="feed-detail-empty" data-feed-detail-empty${model.active && initialIsInline ? " hidden" : ""}>${model.primitives.icon("input")}<h1 data-feed-detail-empty-title>${initial ? model.primitives.text("正在载入 Item…") : model.primitives.text("选择一条 Item")}</h1><p data-feed-detail-empty-copy>${initial ? model.primitives.text("只读取当前选择的正文和资料。") : model.primitives.text("左侧目录保留来源、状态与时间；这里用于阅读和决定下一步。")}</p><button type="button" data-retry-feed-detail hidden>${model.primitives.text("重试")}</button></div>
  </section>`;
}

export function renderFeedWorkbenchFragment(model: FeedUiModel): string {
  if (model.error) {
    return `<div class="feed-error-state" role="alert"><strong>${model.primitives.text("Feed 暂时无法载入")}</strong><p>${model.primitives.escape(model.error)}</p><button type="button" data-retry-feed-detail>${model.primitives.text("重试")}</button></div>`;
  }
  return feedWorkbenchDetails(model).details;
}

function feedWorkbenchDetails(model: FeedUiModel): { details: string; initial: FeedUiEntry | null; initialIsInline: boolean } {
  const entries = model.entries.filter((entry) => entry.preset === model.preset)
    .sort((left, right) => right.attention_rank - left.attention_rank || right.updated_at.localeCompare(left.updated_at));
  const details = entries.map((entry, index) => entry.prototype && entry.item
    ? renderPrototypeFeedDetail(entry, index === 0, model)
    : entry.detail_slot_html
      ? setSelected(entry.detail_slot_html, index === 0)
      : "").join("");
  const initial = entries[0] ?? null;
  const initialIsInline = Boolean(initial?.prototype || initial?.detail_slot_html);
  return { details, initial, initialIsInline };
}

function renderPrototypeFeedDetail(entry: FeedUiEntry, selected: boolean, model: FeedUiModel): string {
  const p = model.primitives;
  const item = entry.item!;
  const prototype = entry.prototype!;
  const isInbox = item.item_type === "inbox_message";
  const isSourceFault = item.kind === "source_fault";
  const isGoalDecision = item.kind === "goal_decision";
  const primaryAction = isInbox
    ? `<button class="button-primary" type="button" data-prototype-inbox-complete data-prototype-item-id="${p.escape(item.item_id)}">${p.icon("check")}${isSourceFault ? p.text("重新连接并完成（模拟）") : isGoalDecision ? p.text("完成判断（模拟）") : p.text("标记为已处理")}</button>`
    : `<button class="button-primary" type="button" data-prototype-feed-action="inbox" data-prototype-item-id="${p.escape(item.item_id)}">${p.icon("input")}${p.text("加入 Inbox")}</button>`;
  const secondaryActions = isInbox
    ? isSourceFault
      ? `<button type="button" data-open-prototype-source="prototype-source-gmail" data-open-source-kind="gmail">${p.icon("settings")}${p.text("查看来源配置")}</button>`
      : isGoalDecision
        ? `<a class="feed-linked-goal" href="${p.escape(item.url || "#")}">${p.icon("target")}${p.text("打开关联 Goal")}</a>`
        : `<button type="button" data-prototype-inbox-defer>${p.text("稍后处理")}</button>`
    : `<button type="button" data-prototype-feed-action="save">${p.text("保存为资料")}</button><button type="button" data-prototype-feed-action="promote">${p.icon("target")}${p.text("升格为 Goal")}</button><button class="feed-action-subtle" type="button" data-prototype-feed-action="ignore">${p.text("忽略")}</button>`;
  return `<article class="feed-detail feed-detail--prototype${isInbox ? " feed-detail--attention" : ""}" data-feed-detail="${p.escape(entry.entry_id)}" data-feed-detail-item-type="${item.item_type}" data-prototype-feed-detail${selected ? "" : " hidden"}>
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span>${p.escape(entry.kind_label)}</span><span>${p.escape(entry.source_label)}</span><span>${p.text("仅本页演示")}</span></div><h1>${p.escape(item.title)}</h1><p>${p.escape(item.summary)}</p><div class="feed-detail-meta"><span>${p.icon("link")}${p.escape(prototype.relation)}</span><time datetime="${p.escape(item.source_updated_at)}">${p.formatDate(item.source_updated_at)}</time></div><div class="feed-detail-actions" data-feed-actions>${primaryAction}${secondaryActions}</div><p class="feed-action-status" data-prototype-action-status role="status" hidden></p></header>
    ${isInbox ? `<section class="inbox-attention-context" aria-label="${p.text("处理上下文")}"><dl><div><dt>${p.text("为什么进入 Inbox")}</dt><dd>${p.escape(prototype.reason)}</dd></div><div><dt>${p.text("关联对象")}</dt><dd>${p.escape(prototype.relation)}</dd></div><div><dt>${p.text("下一步")}</dt><dd>${p.escape(prototype.next_action)}</dd></div></dl></section>` : `<section class="feed-destination-strip" data-prototype-destination><span>${p.icon("activity")}${p.text("当前去向")}</span><strong>${p.text("仅保留在 Feed")}</strong><small>${p.text("尚未占用你的 Inbox")}</small></section>`}
    <section class="feed-detail-body"><h2>${p.text("内容")}</h2><div class="feed-rich-content">${p.richText(item.body)}</div></section>
    <section class="feed-detail-tags" aria-label="${p.text("标签")}">${item.tags.map((tag) => `<span>${p.escape(tag)}</span>`).join("")}</section>
    <p class="prototype-honesty-note">${p.icon("alert")}${p.text("演示动作只改变当前页面状态，不会连接账号、写入数据库或启动后台任务。")}</p>
  </article>`;
}

export function renderPersistedFeedItemDetail(model: PersistedFeedDetailModel, selected = true): string {
  const { item, primitives: p, inbox_entry: inbox } = model;
  const itemUrl = p.safeExternalHref(item.url);
  const body = p.richText(item.body || item.summary) || `<p>${p.text("这条消息没有可显示的正文。")}</p>`;
  const effectiveDisposition = inbox
    ? attentionDisposition(inbox.status)
    : item.disposition === "inbox" && !model.inbox_active
      ? "feed"
      : item.disposition;
  const linkedGoal = item.linked_goal_id ? `<a class="feed-linked-goal" href="${model.route_prefix}/goals/${encodeURIComponent(item.linked_goal_id)}">${p.icon("target")}${p.text("查看 Goal")}</a>` : "";
  const actions = renderItemActions(item, inbox, model.inbox_active, p);
  const materials = item.materials.length ? item.materials.map((material) => {
    const href = p.safeExternalHref(material.canonical_url);
    return `<li><span>${p.icon("link")}</span><div><strong>${p.escape(material.title || material.source_name)}</strong><small>${p.escape([material.source_name, material.published_at ? p.formatDate(material.published_at) : ""].filter(Boolean).join(" · "))}</small>${material.preview ? `<p>${p.escape(material.preview)}</p>` : ""}${material.content ? `<details class="feed-material-content"><summary>${p.text("查看保存的正文")}</summary><div>${p.escape(material.content)}</div></details>` : material.content_ref && !material.content_available ? `<small class="feed-material-unavailable">${p.text("正文暂时不可读取")}</small>` : ""}</div>${href ? `<a href="${p.escape(href)}" target="_blank" rel="noopener noreferrer" aria-label="${p.text("打开原资料")}">${p.icon("arrow")}</a>` : ""}</li>`;
  }).join("") : `<li class="feed-material-empty">${p.icon("archive")}<p>${p.text("这条 Item 没有附带资料；正文和来源信息仍会进入处理上下文。")}</p></li>`;
  return `<article class="feed-detail${inbox ? " feed-detail--attention" : ""}" data-feed-detail="${p.escape(model.entry_id)}" data-feed-detail-item-type="${item.item_type}" data-feed-detail-read="${item.read_at ? "read" : "unread"}"${selected ? "" : " hidden"}>
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span>${item.item_type === "feed" ? "Feed" : "Inbox Message"}</span><span>${p.escape(item.source_label || item.source_kind)}</span>${item.item_type === "feed" ? `<span data-feed-read-state>${item.read_at ? p.text("已读") : p.text("未读")}</span>` : ""}<span>${p.escape(dispositionLabel(effectiveDisposition, item.item_type, p))}</span></div><h1>${p.escape(item.title || p.text("未命名消息"))}</h1>${item.summary ? `<p>${p.escape(p.plainText(item.summary))}</p>` : ""}<div class="feed-detail-meta">${item.author ? `<span>${p.icon("user")}${p.escape(item.author)}</span>` : ""}<time datetime="${p.escape(item.source_updated_at)}">${p.formatDate(item.source_updated_at)}</time>${item.source_id ? `<button type="button" data-open-source-record="${p.escape(item.source_id)}">${p.icon("settings")}${p.text("查看来源")}</button>` : ""}${itemUrl ? `<a href="${p.escape(itemUrl)}" target="_blank" rel="noopener noreferrer">${p.text("打开原文")}${p.icon("arrow")}</a>` : ""}</div><div class="feed-detail-actions" data-feed-actions>${actions}${linkedGoal}</div><p class="feed-action-status" data-feed-action-status role="status" hidden></p></header>
    ${inbox ? renderAttentionContext(item, inbox, p) : item.item_type === "feed" ? `<section class="feed-destination-strip" data-destination-state="${p.escape(effectiveDisposition)}"><span>${p.icon("activity")}${p.text("当前去向")}</span><strong>${p.escape(destinationCopy(effectiveDisposition, item.item_type, p)[0])}</strong><small>${p.escape(destinationCopy(effectiveDisposition, item.item_type, p)[1])}</small></section>` : ""}
    <section class="feed-detail-body"><h2>${p.text("内容")}</h2><div class="feed-rich-content">${body}</div></section>
    ${item.tags.length ? `<section class="feed-detail-tags" aria-label="${p.text("标签")}">${item.tags.map((tag) => `<span>${p.escape(tag)}</span>`).join("")}</section>` : ""}
    <section class="feed-materials"><header><div><span>${p.text("资料")}</span><h2>${p.text("随 Item 一起保存的来源")}</h2></div><small>${p.text("{count} 项", { count: item.materials.length })}</small></header><ul>${materials}</ul></section>
  </article>`;
}

export function renderSourceDirectory(model: FeedUiModel): string {
  const p = model.primitives;
  const rows = model.sources.map((source, index) => `<button class="source-list-item directory-list-row${index === 0 ? " is-selected" : ""}" type="button" role="option" aria-selected="${index === 0}" tabindex="${index === 0 ? "0" : "-1"}" data-source-entry-id="${p.escape(source.source_id)}" data-source-kind="${p.escape(source.ui_kind)}" data-source-status="${p.escape(source.status_kind)}" data-source-search-value="${p.escape(`${source.name} ${source.type_label} ${source.account_label || ""}`.toLocaleLowerCase())}"><span class="source-list-copy"><strong title="${p.escape(source.name)}">${p.escape(source.name)}</strong></span><span class="directory-row-state"><span class="source-list-state" data-source-status="${p.escape(source.status_kind)}">${p.escape(source.status_label)}</span></span></button>`).join("");
  return `<section class="desktop-directory-panel source-directory" data-directory-panel="sources" data-source-directory hidden><header class="desktop-directory-heading source-directory-heading"><button type="button" data-directory-back aria-label="${p.text("返回上一级")}">${p.icon("back")}</button><span><strong>${p.text("来源")}</strong><small>${p.text("账号、接入源与拉取计划")}</small></span><button class="source-add-trigger" type="button" data-feed-sources-open aria-label="${p.text("添加来源")}">${p.icon("plus")}</button></header><div class="source-directory-tools"><button class="source-mobile-add" type="button" data-feed-sources-open>${p.icon("plus")}${p.text("添加来源")}</button><label class="feed-directory-search">${p.icon("search")}<input type="search" data-source-search aria-label="${p.text("搜索来源")}" placeholder="${p.text("搜索账号或来源")}" autocomplete="off"></label><div class="source-filter-row" role="group" aria-label="${p.text("来源筛选")}"><button class="is-active" type="button" data-source-filter="all">${p.text("全部")}</button><button type="button" data-source-filter="account">${p.text("账号")}</button><button type="button" data-source-filter="public">${p.text("公开 Feed")}</button><button type="button" data-source-filter="attention">${p.text("需处理")}</button></div></div><div class="source-list" data-source-list role="listbox" aria-label="${p.text("来源列表")}">${rows}<div class="feed-list-empty source-list-empty" data-source-empty hidden>${p.icon("search")}<strong>${p.text("没有符合条件的来源")}</strong><p>${p.text("换一个关键词或清除筛选，来源仍然保留。")}</p><button type="button" data-source-filter-reset>${p.text("清除筛选")}</button></div></div></section>`;
}

export function renderSourceWorkbench(model: FeedUiModel): string {
  const p = model.primitives;
  const panels = model.sources.map((source, index) => renderSourceDetail(source, index === 0, model)).join("");
  return `<section class="desktop-work-surface source-workbench" data-work-surface="sources" data-work-surface-label="${p.text("来源")}" data-source-workbench hidden>${panels}<div class="feed-detail-empty" data-source-detail-empty${panels ? " hidden" : ""}>${p.icon("settings")}<h1>${panels ? p.text("选择一个来源") : p.text("还没有可管理的来源")}</h1><p>${panels ? p.text("查看配置、拉取计划、来源消息和运行状态。") : p.text("从左侧添加 RSS，或连接 GitHub / Gmail 账号。")}</p>${panels ? "" : `<button type="button" data-feed-sources-open>${p.icon("plus")}${p.text("添加来源")}</button>`}</div></section>`;
}

export function renderFeedOverlays(model: FeedUiModel): string {
  const { primitives: p, relay_import: relay } = model;
  const persistedSources = model.sources.filter((source) => !source.prototype);
  const sourceRows = persistedSources.length ? persistedSources.map((source) => `<article class="feed-source-row directory-list-row" data-feed-source-row="${p.escape(source.source_id)}"><span class="feed-source-mark">${p.icon(sourceIconName(source.ui_kind))}</span><div class="feed-source-copy"><strong>${p.escape(source.name)}</strong><p>${p.escape(source.description)}</p><small>${p.escape([source.account_label, `${source.item_count} Item`, source.last_fetch_label, source.last_error_code].filter(Boolean).join(" · "))}</small></div><div class="feed-source-side"><em class="directory-row-state" data-source-status="${p.escape(source.status)}">${p.escape(sourceStatusLabel(source.status, p))}</em><div class="feed-source-actions">${source.sync_kind !== "manual" ? `<button type="button" data-feed-source-sync="${p.escape(source.source_id)}"${source.enabled && source.status !== "disconnected" ? "" : " disabled"}>${p.icon("refresh")}${p.text("同步")}</button>` : ""}<button type="button" data-feed-source-toggle="${p.escape(source.source_id)}" data-feed-source-enabled="${source.enabled ? "true" : "false"}">${source.enabled ? p.text("暂停") : p.text("恢复")}</button></div></div></article>`).join("") : `<p class="feed-source-empty">${p.text("还没有来源。先从下面添加公开 Feed，或连接账号。")}</p>`;
  const catalogOptions = model.source_catalog.map((source) => `<option value="${p.escape(source.id)}">${p.escape(`${source.category_label} · ${source.name}`)}</option>`).join("");
  const connectorLabel = (status: FeedUiConnectorStatus) => status.bound ? `${p.text("已连接")} ${p.escape(status.hint || "")}` : status.problem ? p.text("凭据不可读取") : p.text("未连接");
  return `<dialog class="feed-source-dialog" data-feed-sources-dialog aria-labelledby="feed-source-dialog-title"><div class="feed-source-dialog-shell"><header><span>${p.icon("settings")}</span><div><h2 id="feed-source-dialog-title">${p.text("来源与连接")}</h2><p>${p.text("GoalBoard 直接保存来源、凭据、同步游标和正文，不再依赖 Relay 运行。")}</p></div><button type="button" data-feed-sources-close aria-label="${p.text("关闭")}">${p.icon("x")}</button></header><div class="feed-source-dialog-scroll"><section class="feed-source-section"><div class="feed-source-section-title"><h3>${p.text("来源与同步状态")}</h3><small>${persistedSources.length} ${p.text("个来源")}</small></div><div class="feed-source-list">${sourceRows}</div></section><section class="feed-source-section"><div class="feed-source-section-title"><h3>${p.text("添加一个无需账号的来源")}</h3></div><div class="feed-source-form-grid"><div class="feed-source-form"><label><span>${p.text("RSS 目录")}</span><select data-feed-rss-definition>${catalogOptions}</select></label><button type="button" data-feed-source-register="rss"${catalogOptions ? "" : " disabled"}>${p.text("添加")}</button></div><div class="feed-source-form"><label><span>${p.text("网页查询")}</span><input data-feed-source-value="web_query" placeholder="AI agent product launch"></label><button type="button" data-feed-source-register="web_query">${p.text("添加")}</button></div><div class="feed-source-form"><label><span>YouTube Channel ID</span><input data-feed-source-value="youtube_channel" placeholder="UC…"></label><button type="button" data-feed-source-register="youtube_channel">${p.text("添加")}</button></div><div class="feed-source-form"><label><span>${p.text("自定义 HTTPS RSS / Atom")}</span><input data-feed-source-value="custom_rss" placeholder="https://example.com/feed.xml"></label><button type="button" data-feed-source-register="custom_rss">${p.text("添加")}</button></div></div></section><section class="feed-source-section"><div class="feed-source-section-title"><h3>${p.text("连接 Inbox 消息来源")}</h3></div><div class="feed-connector-grid"><article class="feed-connector-card"><div><strong>GitHub</strong><em>${connectorLabel(model.connector_auth.github)}</em></div><p>${p.text("读取 GitHub 未读通知；直接点名、分配、Review、CI 与安全提醒才进入 Inbox。")}</p><label><span>${p.text("Classic PAT（notifications scope）")}</span><input type="password" autocomplete="off" data-feed-connector-token="github" placeholder="ghp_…"></label><div class="feed-connector-actions"><button type="button" data-feed-connector-bind="github">${p.text("保存 Token")}</button>${model.connector_auth.github.bound ? `<button type="button" data-feed-connector-unbind="github">${p.text("断开")}</button>` : ""}</div><details><summary>${p.text("使用 Device Flow（notifications + read:user）")}</summary><label><span>OAuth App Client ID</span><input autocomplete="off" data-feed-github-client-id></label><div class="feed-connector-actions"><button type="button" data-feed-github-device-start>${p.text("开始授权")}</button><button type="button" data-feed-github-device-poll hidden>${p.text("我已授权，检查状态")}</button></div><p data-feed-github-device-status hidden></p></details></article><article class="feed-connector-card"><div><strong>Gmail</strong><em>${connectorLabel(model.connector_auth.gmail)}</em></div><p>${p.text("只读访问必要的邮件元数据与预览；每个 Gmail 账号建立独立来源、范围和游标。")}</p><label><span>Access token</span><input type="password" autocomplete="off" data-feed-connector-token="gmail" placeholder="ya29.…"></label><div class="feed-connector-actions"><button type="button" data-feed-connector-bind="gmail">${p.text("保存 Token")}</button>${model.connector_auth.gmail.bound ? `<button type="button" data-feed-connector-unbind="gmail">${p.text("断开")}</button>` : ""}</div><details><summary>${p.text("使用 Google OAuth")}</summary><p>${p.text("授权范围：gmail.readonly、openid、email；GoalBoard 不发送、删除或修改 Gmail 邮件。")}</p><label><span>OAuth Client ID</span><input autocomplete="off" data-feed-gmail-client-id></label><label><span>Client secret（可选）</span><input type="password" autocomplete="off" data-feed-gmail-client-secret></label><button type="button" data-feed-gmail-oauth-start>${p.text("打开授权页面")}</button></details></article></div></section><section class="feed-source-section feed-relay-migration"><div><h3>${p.text("把 Relay 的 Feed 所有权搬到 GoalBoard")}</h3><p>${relay.available ? p.text("会迁入来源、Item、正文、游标与可解密的 GitHub/Gmail 凭据；Relay 数据库保持只读。") : p.text("没有找到 Relay 数据库")}</p></div><button type="button" data-relay-import-open${relay.available ? "" : " disabled"}>${p.icon("refresh")}${p.text("迁移 Relay")}</button></section><p class="form-error" data-feed-source-error role="alert" hidden></p><p class="feed-source-progress" data-feed-source-progress role="status" hidden></p></div></div></dialog>
    <dialog class="feed-import-dialog" data-relay-import-dialog><form method="dialog"><header><span>${p.icon("refresh")}</span><div><h2>${p.text("迁移 Relay Feed")}</h2><p>${p.text("把 Feed 的运行所有权完整迁入 GoalBoard。")}</p></div><button value="cancel" aria-label="${p.text("取消")}">${p.icon("x")}</button></header><dl><div><dt>${p.text("来源")}</dt><dd>${relay.source_count}</dd></div><div><dt>Item</dt><dd>${relay.item_count}</dd></div><div><dt>${p.text("资料")}</dt><dd>${relay.material_count}</dd></div></dl><p class="form-error" data-relay-import-error role="alert" hidden></p><footer><button value="cancel">${p.text("取消")}</button><button class="button-primary" type="button" data-relay-import-confirm${relay.available ? "" : " disabled"}>${p.text("确认迁移")}</button></footer></form></dialog>`;
}

function renderSourceDetail(source: FeedUiSource, selected: boolean, model: FeedUiModel): string {
  const p = model.primitives;
  if (source.prototype) return renderPrototypeSourceDetail(source, selected, model);
  const sourceId = p.escape(source.source_id);
  const scheduleMode = source.schedule.mode;
  const scheduleEnabled = scheduleMode === "interval" && source.schedule.enabled;
  const intervalMinutes = scheduleMode === "interval" ? source.schedule.interval_minutes : 60;
  const canSync = source.enabled && source.status !== "paused" && source.status !== "disconnected";
  const connector = source.sync_kind === "github" || source.sync_kind === "gmail";
  const scope = typeof source.config.scope === "string" ? source.config.scope : source.scope_label;
  const scopeField = source.ui_kind === "gmail"
    ? `<label><span>${p.text("拉取范围")}</span><select data-source-config-field="scope">${source.scope_options.map((option) => `<option value="${p.escape(option.value)}"${scope === option.value ? " selected" : ""}>${p.escape(option.label)} · ${p.escape(option.value)}</option>`).join("")}</select><small class="source-config-help">${p.text("首次同步和增量同步都会执行同一范围；不做完整邮箱回填。")}</small></label>`
    : `<label><span>${p.text("拉取范围")}</span><textarea rows="3" data-source-config-field="scope">${p.escape(scope)}</textarea></label>`;
  const runs = source.runs.length ? `<ol class="source-run-ledger">${source.runs.map((run) => {
    const state = run.phase === "running" ? "running" : run.phase === "interrupted" || run.error_code ? "error" : "complete";
    const title = run.phase === "running" ? p.text("正在拉取") : run.phase === "interrupted" ? p.text("拉取已中断") : run.error_code ? p.text("拉取失败") : p.text("拉取完成");
    const summary = run.phase === "running" ? p.text("已开始，等待 Provider 返回") : run.error_code ? p.text("错误：{code} · 可安全重试", { code: run.error_code }) : p.text("新增 {created} · 去重 {deduped}", { created: run.created_count, deduped: run.deduped_count });
    return `<li data-run-state="${state}"><span>${p.icon(state === "complete" ? "check" : state === "running" ? "refresh" : "alert")}</span><div><strong>${title}</strong><p>${p.escape(summary)}</p></div><time>${p.formatDate(run.completed_at || run.started_at)}</time></li>`;
  }).join("")}</ol>` : `<div class="source-panel-empty">${p.icon("waiting")}<strong>${p.text("还没有运行记录")}</strong><p>${p.text("手动拉取或计划第一次执行后，会在这里留下可诊断记录。")}</p></div>`;
  const messages = source.messages.length ? `<ul>${source.messages.map((message) => `<li>${p.icon("activity")}<span><strong>${p.escape(message)}</strong><small>${p.escape(source.name)}</small></span></li>`).join("")}</ul>` : `<div class="source-panel-empty">${p.icon("archive")}<strong>${p.text("还没有来源消息")}</strong><p>${p.text("完成一次拉取后，新消息会先进入 Feed。")}</p></div>`;
  return `<article class="source-detail" data-source-detail="${sourceId}" data-real-source-id="${sourceId}"${selected ? "" : " hidden"}><header class="source-detail-header"><div class="source-detail-identity"><span class="source-detail-mark">${p.icon(sourceIconName(source.ui_kind))}</span><div><div class="source-detail-labels"><span>${p.escape(source.type_label)}</span><em>${p.text("真实本地来源")}</em></div><h1>${p.escape(source.name)}</h1><p>${p.escape(source.description)}</p></div></div><div class="source-detail-health" data-source-status="${p.escape(source.status_kind)}"><strong data-source-health-label>${p.escape(source.status_label)}</strong><small>${p.text("来自数据库与运行记录")}</small></div></header><nav class="source-detail-tabs" role="tablist" aria-label="${p.text("来源详情")}"><button class="is-active" type="button" role="tab" aria-selected="true" data-source-detail-tab="overview">${p.text("概览")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="config">${p.text("配置")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="schedule">${p.text("拉取计划")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="messages">${p.text("来源消息")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="runs">${p.text("运行状态")}</button></nav><div class="source-detail-panels"><section class="source-detail-panel source-detail-panel--overview" data-source-detail-panel="overview"><section class="source-now"><div><h2>${source.status_kind === "attention" ? p.text("需要你的处理") : source.status_kind === "syncing" ? p.text("正在拉取新消息") : source.status_kind === "paused" ? p.text("来源已暂停") : p.text("来源运行正常")}</h2><p>${p.text("手动拉取与后台计划共用同一幂等运行记录。")}</p></div><button type="button" data-source-runtime-action="sync" data-source-id="${sourceId}"${canSync ? "" : " disabled"}>${p.icon("refresh")}${p.text("立即拉取")}</button><p data-source-action-status role="status" hidden></p></section><section class="source-overview-section"><header class="source-panel-heading"><h2>${p.text("概览")}</h2><p>${p.text("账号、接入源与拉取计划")}</p></header><dl class="source-overview-ledger"><div><dt>${p.text("账号 / 接入源")}</dt><dd>${p.escape(source.account_label || p.text("公开来源"))}</dd></div><div><dt>${p.text("连接状态")}</dt><dd>${p.escape(source.status_label)}</dd></div><div><dt>${p.text("上次拉取")}</dt><dd>${p.escape(source.last_fetch_label)}</dd></div><div><dt>${p.text("下次拉取")}</dt><dd>${p.escape(source.next_fetch_label)}</dd></div><div><dt>${p.text("已拉取消息")}</dt><dd>${source.item_count}</dd></div><div><dt>${p.text("范围")}</dt><dd>${p.escape(source.scope_label)}</dd></div>${source.protocol_status ? `<div><dt>${p.text("条件请求")}</dt><dd>${p.escape(source.protocol_status)}</dd></div>` : ""}</dl></section><div class="source-runtime-actions"><button type="button" data-source-runtime-action="${source.enabled ? "pause" : "resume"}" data-source-id="${sourceId}">${source.enabled ? p.text("暂停来源") : p.text("恢复来源")}</button>${connector ? `<button type="button" data-source-runtime-action="disconnect" data-source-id="${sourceId}">${p.text("断开账号")}</button>` : ""}<details><summary>${p.text("删除来源")}</summary><p>${p.text("请选择历史处理方式。两种操作都会停止后续拉取。")}</p><div><button type="button" data-source-delete="retain_history" data-source-id="${sourceId}">${p.text("删除来源，保留历史")}</button><button class="is-danger" type="button" data-source-delete="delete_local_history" data-source-id="${sourceId}">${p.text("连同本地历史删除")}</button></div></details></div></section><section class="source-detail-panel" data-source-detail-panel="config" hidden><header class="source-panel-heading"><h2>${p.text("配置")}</h2><p>${p.text("地址与账号身份由 Provider 管理；这里只保存非秘密配置")}</p></header><div class="source-config-sheet"><label><span>${p.text("来源名称")}</span><input value="${p.escape(source.name)}" data-source-config-field="name"></label><label><span>${p.text("账号 / 地址")}</span><input value="${p.escape(source.configured_endpoint)}"${source.editable_endpoint ? ` data-source-config-field="feed_url"` : ` readonly aria-readonly="true"`}></label><label><span>${p.text("说明")}</span><textarea rows="2" data-source-config-field="description">${p.escape(source.description)}</textarea></label>${scopeField}<div class="source-config-actions"><button type="button" data-source-config-save data-source-id="${sourceId}">${p.text("保存配置")}</button><small>${p.text("保存后请立即拉取验证。")}</small></div><p data-source-action-status role="status" hidden></p></div></section><section class="source-detail-panel" data-source-detail-panel="schedule" hidden><div class="source-schedule-sheet"><div class="source-schedule-heading"><div><h2>${p.text("定时拉取")}</h2><p>${p.text("计划由本地服务执行；重启或休眠错过时只补拉一次。")}</p></div><label class="source-schedule-toggle"><input type="checkbox" ${scheduleEnabled ? "checked " : ""}data-source-schedule-enabled><span>${scheduleEnabled ? p.text("已开启") : p.text("已暂停")}</span></label></div><label><span>${p.text("模式")}</span><select data-source-schedule-mode><option value="manual"${scheduleMode === "manual" ? " selected" : ""}>${p.text("仅手动拉取")}</option><option value="interval"${scheduleMode === "interval" ? " selected" : ""}>${p.text("按固定间隔")}</option></select></label><label><span>${p.text("频率")}</span><select data-source-schedule-interval>${[15, 30, 60, 360, 720, 1440].map((minutes) => `<option value="${minutes}"${intervalMinutes === minutes ? " selected" : ""}>${minutes} min</option>`).join("")}</select></label><div class="source-schedule-actions"><button class="button-primary" type="button" data-source-schedule-save data-source-id="${sourceId}">${p.text("保存拉取计划")}</button><small>${p.escape(source.next_fetch_label)}</small></div><p data-source-action-status role="status" hidden></p></div></section><section class="source-detail-panel" data-source-detail-panel="messages" hidden><div class="source-message-list"><header><div><h2>${p.text("最近来自此来源")}</h2><p>${p.text("完整消息仍保存在 Feed，这里只用于来源核对。")}</p></div><button type="button" data-work-surface-open="feed" data-feed-preset="feed" data-feed-source="${p.escape(source.name)}">${p.text("在 Feed 中查看")}${p.icon("chevron-right")}</button></header>${messages}</div></section><section class="source-detail-panel" data-source-detail-panel="runs" hidden><header class="source-panel-heading"><h2>${p.text("运行状态")}</h2><p>${p.text("手动拉取或计划第一次执行后，会在这里留下可诊断记录。")}</p></header>${runs}</section></div></article>`;
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
    ? `<ul>${source.messages.map((message) => `<li>${p.icon("activity")}<span><strong>${p.escape(message)}</strong><small>${p.escape(source.name)}</small></span></li>`).join("")}</ul>`
    : `<div class="source-panel-empty">${p.icon("archive")}<strong>${p.text("还没有来源消息")}</strong><p>${p.text("完成一次拉取后，新消息会先进入 Feed。")}</p></div>`;
  return `<article class="source-detail" data-source-detail="${sourceId}"${selected ? "" : " hidden"}>
    <header class="source-detail-header"><div class="source-detail-identity"><span class="source-detail-mark">${p.icon(sourceIconName(source.ui_kind))}</span><div><div class="source-detail-labels"><span>${p.escape(source.type_label)}</span><em>${p.text("高保真演示 · 不连接外部服务")}</em></div><h1>${p.escape(source.name)}</h1><p>${p.escape(source.description)}</p></div></div><div class="source-detail-health" data-source-status="${p.escape(source.status_kind)}"><strong data-source-health-label>${p.escape(source.status_label)}</strong><small>${p.text("模拟状态")}</small></div></header>
    <nav class="source-detail-tabs" role="tablist" aria-label="${p.text("来源详情")}"><button class="is-active" type="button" role="tab" aria-selected="true" data-source-detail-tab="overview">${p.text("概览")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="config">${p.text("配置")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="schedule">${p.text("拉取计划")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="messages">${p.text("来源消息")}</button><button type="button" role="tab" aria-selected="false" data-source-detail-tab="runs">${p.text("运行状态")}</button></nav>
    <div class="source-detail-panels">
      <section class="source-detail-panel source-detail-panel--overview" data-source-detail-panel="overview"><section class="source-now"><div><h2>${source.status_kind === "attention" ? p.text("需要你的处理") : source.status_kind === "syncing" ? p.text("正在拉取新消息") : p.text("来源运行正常")}</h2><p>${statusCopy}</p></div><button type="button" data-prototype-source-sync="${sourceId}">${p.icon("refresh")}${p.text("模拟立即拉取")}</button><p data-prototype-action-status role="status" hidden></p></section><section class="source-overview-section"><header class="source-panel-heading"><h2>${p.text("概览")}</h2><p>${p.text("账号、接入源与拉取计划")}</p></header><dl class="source-overview-ledger"><div><dt>${p.text("账号 / 接入源")}</dt><dd>${p.escape(source.account_label || p.text("公开来源"))}</dd></div><div><dt>${p.text("连接状态")}</dt><dd>${p.escape(source.status_label)}</dd></div><div><dt>${p.text("上次拉取")}</dt><dd>${p.escape(source.last_fetch_label)}</dd></div><div><dt>${p.text("下次拉取")}</dt><dd>${p.escape(source.next_fetch_label)}</dd></div><div><dt>${p.text("已拉取消息")}</dt><dd>${source.item_count}</dd></div><div><dt>${p.text("范围")}</dt><dd>${p.escape(source.scope_label)}</dd></div>${source.protocol_status ? `<div><dt>${p.text("条件请求")}</dt><dd>${p.escape(source.protocol_status)}</dd></div>` : ""}</dl></section></section>
      <section class="source-detail-panel" data-source-detail-panel="config" hidden><header class="source-panel-heading"><h2>${p.text("配置")}</h2><p>${p.text("不会写入数据库或外部账号")}</p></header><div class="source-config-sheet"><label><span>${p.text("来源名称")}</span><input value="${p.escape(source.name)}" data-prototype-config-input></label><label><span>${p.text("账号 / 地址")}</span><input value="${p.escape(source.configured_endpoint)}" readonly aria-readonly="true"></label><label><span>${p.text("说明")}</span><textarea rows="2" data-prototype-config-input>${p.escape(source.description)}</textarea></label><label><span>${p.text("拉取范围")}</span><textarea rows="3" data-prototype-config-input>${p.escape(source.scope_label)}</textarea></label><div class="source-config-actions"><button type="button" data-prototype-config-save>${p.text("保存演示配置")}</button><small>${p.text("不会写入数据库或外部账号")}</small></div><p data-prototype-config-status role="status" hidden></p></div></section>
      <section class="source-detail-panel" data-source-detail-panel="schedule" hidden><div class="source-schedule-sheet"><div class="source-schedule-heading"><div><h2>${p.text("定时拉取")}</h2><p>${p.text("仅演示计划配置；浏览器关闭后不会继续运行。")}</p></div><label class="source-schedule-toggle"><input type="checkbox" ${scheduleEnabled ? "checked " : ""}data-prototype-schedule-enabled><span>${scheduleEnabled ? p.text("已开启") : p.text("已暂停")}</span></label></div><label><span>${p.text("模式")}</span><select data-prototype-schedule-frequency><option value="manual"${source.schedule.mode === "manual" ? " selected" : ""}>${p.text("仅手动拉取")}</option><option value="interval"${source.schedule.mode === "interval" ? " selected" : ""}>${p.text("按固定间隔")}</option></select></label><label><span>${p.text("频率")}</span><select data-prototype-schedule-frequency>${[15, 30, 60, 360, 720, 1440].map((minutes) => `<option value="${minutes}"${intervalMinutes === minutes ? " selected" : ""}>${minutes} min</option>`).join("")}</select></label><div class="source-schedule-actions"><button class="button-primary" type="button" data-prototype-schedule-save>${p.text("保存拉取计划")}</button><small>${p.escape(source.next_fetch_label)}</small></div><p data-prototype-schedule-status role="status" hidden></p></div></section>
      <section class="source-detail-panel" data-source-detail-panel="messages" hidden><div class="source-message-list"><header><div><h2>${p.text("最近来自此来源")}</h2><p>${p.text("完整消息仍保存在 Feed，这里只用于来源核对。")}</p></div><button type="button" data-work-surface-open="feed" data-feed-preset="feed" data-feed-source="${p.escape(source.name)}">${p.text("在 Feed 中查看")}${p.icon("chevron-right")}</button></header>${messages}</div></section>
      <section class="source-detail-panel" data-source-detail-panel="runs" hidden><header class="source-panel-heading"><h2>${p.text("运行状态")}</h2><p>${p.text("这里展示模拟运行记录，不会启动后台任务。")}</p></header><ol class="source-run-ledger"><li data-run-state="complete"><span>${p.icon("check")}</span><div><strong>${p.text("最近一次拉取")}</strong><p>${source.status_kind === "attention" ? p.text("失败 · 授权已失效，游标未推进") : p.text("完成 · 新增 3，去重 8")}</p></div><time>${p.escape(source.last_fetch_label)}</time></li><li data-run-state="scheduled"><span>${p.icon("waiting")}</span><div><strong>${p.text("下一次计划")}</strong><p>${p.escape(source.schedule_label)}</p></div><time>${p.escape(source.next_fetch_label)}</time></li></ol></section>
    </div><p class="prototype-honesty-note source-honesty-note">${p.icon("alert")}${p.text("此来源用于验证高保真路径；同步、授权与调度均为页面内模拟。")}</p>
  </article>`;
}

function renderItemActions(item: FeedUiItem, inbox: AttentionEntryRecord | null, inboxActive: boolean, p: FeedUiPrimitives): string {
  if (inbox) {
    if (inbox.status === "done" || inbox.status === "dismissed") {
      return `<button class="button-primary" type="button" data-inbox-action="open" data-inbox-entry-id="${p.escape(inbox.entry_id)}" data-inbox-entry-revision="${inbox.revision}">${p.icon("refresh")}${p.text("重新打开")}</button><button type="button" data-inbox-open-feed="${p.escape(item.item_id)}">${p.icon("activity")}${p.text("查看原消息")}</button>`;
    }
    return `<button class="button-primary" type="button" data-inbox-open-feed="${p.escape(item.item_id)}">${p.icon("activity")}${p.text("查看原消息")}</button><button type="button" data-feed-action="promote" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}">${p.icon("target")}${item.linked_goal_id ? p.text("查看 Goal") : p.text("升格为 Goal")}</button><button type="button" data-inbox-action="done" data-inbox-entry-id="${p.escape(inbox.entry_id)}" data-inbox-entry-revision="${inbox.revision}">${p.icon("check")}${p.text("完成")}</button><button class="feed-action-subtle" type="button" data-inbox-action="dismissed" data-inbox-entry-id="${p.escape(inbox.entry_id)}" data-inbox-entry-revision="${inbox.revision}">${p.text("忽略")}</button>`;
  }
  if (item.disposition === "archived") {
    return `<button type="button" data-feed-action="restore" data-feed-restore-target="${item.item_type === "inbox_message" ? "inbox" : "feed"}" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}">${item.item_type === "inbox_message" ? p.text("恢复到 Inbox") : p.text("恢复到 Feed")}</button>`;
  }
  if (item.item_type === "inbox_message") {
    return `<button class="button-primary" type="button" data-feed-action="start" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}">${p.icon("play")}${item.disposition === "processing" ? p.text("继续处理") : p.text("开始处理")}</button><button type="button" data-feed-action="promote" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}">${p.icon("target")}${item.linked_goal_id ? p.text("查看 Goal") : p.text("升格为 Goal")}</button><button type="button" data-feed-action="save" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}"${item.disposition === "saved" ? " disabled" : ""}>${item.disposition === "saved" ? p.text("已保存为资料") : p.text("保存为资料")}</button><button class="feed-action-subtle" type="button" data-feed-action="archive" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}">${p.text("归档")}</button>`;
  }
  return `<button class="button-primary" type="button" data-feed-action="inbox" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}"${inboxActive ? " disabled" : ""}>${p.icon("input")}${inboxActive ? p.text("已加入 Inbox") : p.text("加入 Inbox")}</button><button type="button" data-feed-action="save" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}"${item.disposition === "saved" ? " disabled" : ""}>${item.disposition === "saved" ? p.text("已保存为资料") : p.text("保存为资料")}</button><button type="button" data-feed-action="promote" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}">${p.icon("target")}${item.linked_goal_id ? p.text("查看 Goal") : p.text("升格为 Goal")}</button><button class="feed-action-subtle" type="button" data-feed-action="archive" data-feed-item-id="${p.escape(item.item_id)}" data-feed-revision="${item.revision}">${p.text("忽略")}</button>`;
}

function renderAttentionContext(item: FeedUiItem, inbox: AttentionEntryRecord, p: FeedUiPrimitives): string {
  return `<section class="inbox-attention-context" aria-label="${p.text("处理上下文")}"><dl><div><dt>${p.text("为什么进入 Inbox")}</dt><dd>${p.escape(attentionReasonLabel(inbox.reason, p))}</dd></div><div><dt>${p.text("关联对象")}</dt><dd>${p.escape(`${item.source_label || item.source_kind} · ${item.title}`)}</dd></div><div><dt>${p.text("当前状态")}</dt><dd>${p.escape(attentionStatusLabel(inbox.status, p))}</dd></div><div><dt>${p.text("下一步")}</dt><dd>${p.escape(inbox.status === "done" || inbox.status === "dismissed" ? p.text("可以重新打开，原消息仍保留在 Feed。") : p.text("查看原消息并处理，或直接完成 / 忽略这条注意力引用。"))}</dd></div></dl><p class="prototype-honesty-note">${p.icon("link")}${p.text("Inbox 只保存引用和进入原因；这里展示的是原 Feed Item，内容没有复制进 Inbox。")}</p></section>`;
}

function dispositionLabel(value: string, preset: FeedUiPreset, p: FeedUiPrimitives): string {
  const labels: Record<string, string> = {
    feed: p.text("仅 Feed"),
    inbox: p.text("待处理"),
    saved: p.text("已保存为资料"),
    promoted: p.text("已升格为 Goal"),
    processing: p.text("处理中"),
    archived: preset === "inbox_message" ? p.text("已归档") : p.text("已忽略"),
  };
  return labels[value] ?? value;
}

function destinationCopy(value: string, preset: FeedUiPreset, p: FeedUiPrimitives): readonly [string, string] {
  const copy: Record<string, readonly [string, string]> = {
    feed: [p.text("仅保留在 Feed"), p.text("没有占用 Inbox；原消息和来源保持可追溯")],
    inbox: [p.text("已加入 Inbox"), p.text("Inbox 只保存需处理引用；原消息仍在 Feed")],
    saved: [p.text("已保存为资料"), p.text("完整消息、来源和已有资料保持关联")],
    promoted: [p.text("已升格为 Goal"), p.text("Goal 使用这条消息作为可追溯输入")],
    processing: [p.text("正在处理"), p.text("关联 Goal 已打开，原消息仍保留")],
    archived: [preset === "inbox_message" ? p.text("已归档") : p.text("已忽略"), p.text("默认列表不再显示，仍可从状态筛选恢复")],
  };
  return copy[value] ?? [value, p.text("原消息仍然保留")];
}

function attentionDisposition(status: AttentionStatus): FeedItemDisposition {
  return ({ open: "inbox", in_progress: "processing", done: "saved", dismissed: "archived" } as const)[status];
}

function attentionReasonLabel(reason: AttentionReason, p: FeedUiPrimitives): string {
  return ({ manual: p.text("你手工加入"), source_rule: p.text("来源规则命中"), goal_decision: p.text("GoalBoard 等待决定"), source_fault: p.text("来源需要人工恢复") } as const)[reason];
}

function attentionStatusLabel(status: AttentionStatus, p: FeedUiPrimitives): string {
  return ({ open: p.text("待处理"), in_progress: p.text("处理中"), done: p.text("已完成"), dismissed: p.text("已忽略") } as const)[status];
}

function sourceStatusLabel(status: string, p: FeedUiPrimitives): string {
  return ({ active: p.text("运行中"), paused: p.text("已暂停"), error: p.text("需要恢复"), disconnected: p.text("未连接") } as Record<string, string>)[status] ?? status;
}

function sourceIconName(kind: FeedUiSource["ui_kind"]): string {
  return kind === "github" ? "tree" : kind === "gmail" ? "input" : kind === "rss" ? "activity" : "link";
}

function setSelected(html: string, selected: boolean): string {
  if (selected) return html.replace(/\s+hidden(?=[\s>])/u, "");
  return /\shidden(?=[\s>])/u.test(html) ? html : html.replace(/^(<[^>]+)/u, "$1 hidden");
}
