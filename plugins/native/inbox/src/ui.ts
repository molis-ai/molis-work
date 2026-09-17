import { renderDirectoryPanel, renderDirectoryRow } from "@molis-ai/molis-work-design-system";
import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { isActiveInboxStatus, type InboxUiEntry, type InboxUiFilter } from "./projection.js";

export const INBOX_UI_CONTRIBUTION_ID = "io.molis.work.native.inbox.ui.v1";

export type InboxUiSurface = "directory" | "workbench";

export interface InboxUiPrimitives {
  escape(value: unknown): string;
  icon(name: string): string;
  text(value: string, values?: Record<string, string | number>): string;
  formatDate(value: string): string;
}

export interface InboxUiModel {
  readonly route_prefix: string;
  readonly entries: readonly InboxUiEntry[];
  readonly filter: InboxUiFilter;
  readonly primitives: InboxUiPrimitives;
}

export const inboxUiDescriptor: UiContributionDescriptor = {
  contribution_id: INBOX_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.native.inbox",
  kind: "primary-page",
  navigation_id: "inbox",
  label: "Inbox",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const inboxUiContribution: UiContribution<InboxUiModel> = {
  descriptor: inboxUiDescriptor,
  render(request: UiRenderRequest<InboxUiModel>): string {
    switch (request.surface as InboxUiSurface) {
      case "directory":
        return renderInboxDirectory(request.model);
      case "workbench":
        return renderInboxWorkbench(request.model);
      default:
        throw new Error(`Inbox UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderInboxDirectory(model: InboxUiModel): string {
  const { primitives: p, filter } = model;
  const visible = model.entries.filter((entry) => matchesFilter(entry, filter));
  const initial = visible[0] ?? null;
  const rows = model.entries.map((entry) => {
    const selected = entry.entry_id === initial?.entry_id;
    return renderDirectoryRow({
      title: entry.title,
      caption: entry.reason_label,
      status: entry.status_label,
      statusTone: entry.status === "open" ? "attention" : entry.status === "in_progress" ? "progress" : entry.status === "done" ? "done" : "quiet",
      statusIcon: entry.status === "open" ? "bell" : entry.status === "in_progress" ? "play" : entry.status === "done" ? "check" : "rejected",
      density: "meta",
      selected,
      hidden: !matchesFilter(entry, filter),
      draggable: true,
      attrs: {
        role: "option",
        "aria-selected": selected ? "true" : "false",
        tabindex: selected ? 0 : -1,
        "data-frame-asset": "inbox",
        "data-frame-asset-id": entry.entry_id,
        "data-frame-asset-title": entry.title,
        "data-frame-asset-caption": entry.reason_label,
        "data-frame-reading-reason": entry.reason_label,
        "data-frame-reading-relation": entry.relation_label,
        "data-frame-reading-next": entry.next_action,
        "data-frame-reading-status": entry.status_label,
        "data-inbox-row": true,
        "data-inbox-entry-id": entry.entry_id,
        "data-inbox-entry-revision": entry.revision,
        "data-inbox-status": entry.status,
        "data-inbox-subject-type": entry.subject_type,
        "data-inbox-subject-id": entry.subject_id,
        "data-inbox-reason": entry.reason,
      },
    });
  }).join("");
  return renderDirectoryPanel({
    pluginId: "inbox",
    listLabel: p.text("Inbox 列表"),
    attrs: { "data-inbox-directory": true, "data-inbox-current-filter": filter },
    tools: `<div class="inbox-filter-row" role="group" aria-label="${p.text("Inbox 筛选")}"><button class="${filter === "active" ? "is-active" : ""}" type="button" data-inbox-filter="active">${p.text("待处理")}</button><button class="${filter === "history" ? "is-active" : ""}" type="button" data-inbox-filter="history">${p.text("历史")}</button></div>`,
    listAttrs: { "data-inbox-list": true },
    body: rows,
    empty: `<div class="feed-list-empty mw-empty" data-inbox-empty${visible.length ? " hidden" : ""}><strong data-inbox-empty-title>${p.escape(emptyTitle(filter, p))}</strong></div>`,
  });
}

export function renderInboxWorkbench(model: InboxUiModel): string {
  const { primitives: p, filter } = model;
  const visible = model.entries.filter((entry) => matchesFilter(entry, filter));
  const initial = visible[0] ?? null;
  const details = model.entries.map((entry) => renderInboxDetail(entry, entry.entry_id === initial?.entry_id, p)).join("");
  const emptyHeading = visible.length ? p.text("选择一条需要处理的事项") : emptyTitle(filter, p);
  return `<section class="desktop-work-surface" data-work-surface="inbox" data-work-surface-label="Inbox" hidden data-inbox-workbench>
    ${details}
    <div class="feed-detail-empty mw-empty" data-inbox-detail-empty${initial ? " hidden" : ""}>${p.icon("inbox")}<h1>${emptyHeading}</h1></div>
  </section>`;
}

function renderInboxDetail(entry: InboxUiEntry, selected: boolean, p: InboxUiPrimitives): string {
  const active = isActiveInboxStatus(entry.status);
  const openAction = openButton(entry, p);
  const resultActions = active
    ? `<button class="mw-btn mw-btn--primary" type="button" data-inbox-action="done" data-inbox-entry-id="${p.escape(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}">${p.icon("check")}${p.text("标记已处理")}</button><button class="mw-btn mw-btn--ghost feed-action-subtle" type="button" data-inbox-action="dismissed" data-inbox-entry-id="${p.escape(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}">${p.text("忽略")}</button>`
    : `<button class="mw-btn mw-btn--secondary" type="button" data-inbox-action="open" data-inbox-entry-id="${p.escape(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}">${p.text("重新打开")}</button>`;
  return `<article class="feed-detail feed-detail--attention inbox-reference-detail" data-inbox-detail="${p.escape(entry.entry_id)}" data-inbox-subject-type="${entry.subject_type}"${selected ? "" : " hidden"}>
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span class="mw-status mw-status--attention">${p.escape(entry.kind_label)}</span><span class="mw-status mw-status--quiet">${p.escape(entry.source_label)}</span><span class="mw-status mw-status--${entry.status === "open" ? "attention" : entry.status === "in_progress" ? "progress" : entry.status === "done" ? "done" : "quiet"}">${p.escape(entry.status_label)}</span></div><h1>${p.escape(entry.title)}</h1></header>
    <div class="inbox-reference-footer"><div class="feed-detail-actions">${openAction}${resultActions}</div><p class="feed-action-status" data-inbox-action-status role="status" hidden></p></div>
    <div class="inbox-reference-body"><section class="inbox-attention-context" aria-label="${p.text("处理上下文")}"><dl><div><dt>${p.text("为什么进入 Inbox")}</dt><dd>${p.escape(entry.reason_label)}</dd></div><div><dt>${p.text("关联对象")}</dt><dd>${p.escape(entry.relation_label)}</dd></div><div class="inbox-attention-next"><dt>${p.text("下一步")}</dt><dd>${p.escape(entry.next_action)}</dd></div><div><dt>${p.text("当前状态")}</dt><dd>${p.escape(entry.status_label)}</dd></div></dl></section></div>
  </article>`;
}

function openButton(entry: InboxUiEntry, p: InboxUiPrimitives): string {
  if (!entry.open || !entry.available) {
    return `<button class="mw-btn mw-btn--secondary" type="button" disabled aria-disabled="true">${p.text("原对象不可用")}</button>`;
  }
  if (entry.open.kind === "feed") {
    return `<button class="mw-btn mw-btn--secondary" type="button" data-inbox-open-feed="${p.escape(entry.open.item_id)}">${p.icon("rss")}${p.text("查看原消息")}</button>`;
  }
  if (entry.open.kind === "source") {
    return `<button class="mw-btn mw-btn--secondary" type="button" data-feed-task-config-open="${p.escape(entry.open.source_id)}">${p.icon("settings")}${p.text("处理任务配置")}</button>`;
  }
  return `<a class="feed-linked-goal" href="${p.escape(entry.open.href)}">${p.icon("target")}${p.text("打开 Goal")}</a>`;
}

function matchesFilter(entry: InboxUiEntry, filter: InboxUiFilter): boolean {
  return filter === "active" ? isActiveInboxStatus(entry.status) : !isActiveInboxStatus(entry.status);
}

function emptyTitle(filter: InboxUiFilter, p: InboxUiPrimitives): string {
  return filter === "history" ? p.text("没有已完成或已忽略的事项") : p.text("现在没有需要你介入的事项");
}
