import type { InboxJudgmentSummary } from "./route-handlers.js";
import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import {
  INBOX_DISMISS_BEHAVIOR_ID,
  INBOX_DONE_BEHAVIOR_ID,
  INBOX_COMPOSE_BEHAVIOR_ID,
  INBOX_VERIFY_BEHAVIOR_ID,
  defaultInboxNextBehaviorIds,
} from "@molis-ai/molis-work-contracts/modules/functions";
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
  readonly judgment?: InboxJudgmentSummary;
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

export function renderInboxDirectory(_model: InboxUiModel): string {
  return "";
}

export function renderInboxWorkbench(model: InboxUiModel): string {
  const { primitives: p } = model;
  const active = model.entries.filter((entry) => isActiveInboxStatus(entry.status));
  const history = model.entries.filter((entry) => !isActiveInboxStatus(entry.status));
  const details = model.entries.map((entry) => renderInboxDetail(entry, false, p)).join("");
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="inbox" data-work-surface-label="Inbox" hidden data-inbox-workbench data-inbox-directory data-inbox-stage-shell data-expanded="false" data-inbox-current-filter="active">
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-inbox-list>
      <header class="plugin-stage-chrome inbox-compose-toolbar"><button class="mw-btn mw-btn--ghost tree-create" type="button" data-inbox-compose-open="">${p.icon("note")}<span>${p.text("整理材料到 Pages")}</span></button></header>
      ${model.judgment ? `<details class="inbox-next-config"><summary><span class="goal-collection-caret" aria-hidden="true">${p.icon("chevron-down")}</span>${p.text("下一步建议")}</summary><p>${p.escape(model.judgment.name || p.text("尚未绑定规则"))}${model.judgment.name && model.judgment.reason ? ` · ${p.escape(p.text(model.judgment.reason))}` : ""}</p><button class="mw-btn mw-btn--secondary" type="button" data-inbox-functions>${p.text("配置判断规则")}</button><button class="mw-btn mw-btn--secondary" type="button" data-inbox-evaluate${model.judgment.available && active.length ? "" : " disabled"}>${p.text("更新前 20 条待处理建议")}</button><p role="status" data-inbox-evaluate-status></p></details>` : ""}
      ${renderInboxFold("active", p.text("待处理"), "alert", active, p)}
      ${renderInboxFold("history", p.text("历史"), "check", history, p)}
    </div>
    <div class="plugin-stage-workspace" data-inbox-stage-workspace hidden>
      ${details}
      <div class="feed-detail-empty mw-empty" data-inbox-detail-empty>${p.icon("inbox")}<h1>${p.text("现在没有需要你介入的事项")}</h1></div>
    </div>
    <dialog class="inbox-compose-dialog" data-inbox-compose>
      <form data-inbox-compose-form>
        <header><h2>${p.text("整理材料到 Pages")}</h2><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-inbox-compose-close aria-label="${p.text("关闭")}">${p.icon("x")}</button></header>
        <p>${p.text("选择 Inbox 中的原始材料，补充要求，生成后在 Pages 继续编辑。")}</p>
        <fieldset data-inbox-compose-materials><legend>${p.text("使用的材料")}</legend></fieldset>
        <label>${p.text("文稿标题")}<input class="mw-input" name="title" required maxlength="80" autocomplete="off"></label>
        <label>${p.text("处理要求")}<textarea class="mw-textarea" name="instructions" required maxlength="4000" rows="4" placeholder="${p.text("例如：整理为 AI 产品观察，区分事实、推断和待验证问题，并保留来源。")}"></textarea></label>
        <p role="status" data-inbox-compose-status></p>
        <footer><button class="mw-btn mw-btn--secondary" type="button" data-inbox-compose-close>${p.text("稍后继续")}</button><button class="mw-btn mw-btn--primary" type="submit" data-inbox-compose-submit>${p.text("生成文稿")}</button></footer>
        <section data-inbox-compose-results aria-label="${p.text("处理记录")}"></section>
      </form>
    </dialog>
  </section>`;
}

function renderInboxFold(
  id: "active" | "history",
  label: string,
  mark: "alert" | "check",
  entries: readonly InboxUiEntry[],
  p: InboxUiPrimitives,
): string {
  const tone = mark === "check" ? "ready" : "attention";
  const rows = entries.map((entry) => renderInboxStageRow(entry, p)).join("");
  return `<details class="goal-collection-fold" data-inbox-stage-group="${id}" open>
    <summary>
      <span class="goal-collection-caret" aria-hidden="true">${p.icon("chevron-down")}</span>
      <span class="goal-collection-mark is-${tone}" aria-hidden="true">${p.icon(mark)}</span>
      <strong>${p.escape(label)}</strong>
      <small data-inbox-stage-group-count>${entries.length}</small>
    </summary>
    <div class="inbox-stage-group-body" role="list" aria-label="${p.escape(label)}">${rows}<p class="goal-collection-empty" data-inbox-stage-group-empty${entries.length ? " hidden" : ""}>${p.text(id === "history" ? "没有已完成或已忽略的事项" : "现在没有需要你介入的事项")}</p></div>
  </details>`;
}

function renderInboxStageRow(entry: InboxUiEntry, p: InboxUiPrimitives): string {
  return `<article class="inbox-stage-item feed-stage-item" role="listitem" data-inbox-item-wrap="${p.escape(entry.entry_id)}">
    <button class="feed-stage-entry directory-list-row" type="button" aria-selected="false" draggable="true" data-frame-asset="inbox" data-frame-asset-id="${p.escape(entry.entry_id)}" data-frame-asset-title="${p.escape(entry.title)}" data-frame-asset-caption="${p.escape(entry.reason_label)}" data-frame-reading-reason="${p.escape(entry.reason_label)}" data-frame-reading-relation="${p.escape(entry.relation_label)}" data-frame-reading-next="${p.escape(entry.next_action)}" data-frame-reading-status="${p.escape(entry.status_label)}" data-inbox-row data-inbox-entry-id="${p.escape(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}" data-inbox-status="${p.escape(entry.status)}" data-inbox-subject-type="${p.escape(entry.subject_type)}" data-inbox-subject-id="${p.escape(entry.subject_id)}" data-inbox-reason="${p.escape(entry.reason)}">
      <span class="feed-stage-leading"><strong title="${p.escape(entry.title)}">${p.escape(entry.title)}</strong></span>
      <span class="feed-entry-source">${p.escape(entry.reason_label)}</span>
      <span class="mw-status mw-status--${entry.status === "open" ? "attention" : entry.status === "in_progress" ? "progress" : entry.status === "done" ? "done" : "quiet"} mw-status--plain feed-entry-status">${p.escape(entry.status_label)}</span>
    </button>
  </article>`;
}

function renderInboxDetail(entry: InboxUiEntry, selected: boolean, p: InboxUiPrimitives): string {
  const openAction = openButton(entry, p);
  return `<article class="feed-detail feed-detail--attention inbox-reference-detail" data-inbox-detail="${p.escape(entry.entry_id)}" data-inbox-subject-type="${entry.subject_type}"${selected ? "" : " hidden"}>
    <header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-inbox-collapse aria-label="${p.text("返回 Inbox 列表")}" title="${p.text("返回 Inbox 列表")}">${p.icon("chevron-right")}</button><div class="feed-detail-kicker"><span class="mw-status mw-status--attention">${p.escape(entry.kind_label)}</span><span class="mw-status mw-status--quiet">${p.escape(entry.source_label)}</span><span class="mw-status mw-status--${entry.status === "open" ? "attention" : entry.status === "in_progress" ? "progress" : entry.status === "done" ? "done" : "quiet"}">${p.escape(entry.status_label)}</span></div></header>
    <header class="feed-detail-header"><h1>${p.escape(entry.title)}</h1></header>
    <div class="inbox-reference-footer">${renderNextSuggestion(entry, p)}<div class="feed-detail-actions">${openAction}${entry.subject_type === "feed_item" && entry.available ? renderMaterialActions(entry, p) : ""}${resultActions(entry, p)}</div><p class="feed-action-status" data-inbox-action-status role="status" hidden></p></div>
    <div class="inbox-reference-body"><section class="inbox-attention-context" aria-label="${p.text("处理上下文")}"><dl><div><dt>${p.text("为什么进入 Inbox")}</dt><dd>${p.escape(entry.reason_label)}</dd></div><div><dt>${p.text("关联对象")}</dt><dd>${p.escape(entry.relation_label)}</dd></div><div class="inbox-attention-next"><dt>${p.text("下一步")}</dt><dd>${p.escape(entry.next_action)}</dd></div><div><dt>${p.text("当前状态")}</dt><dd>${p.escape(entry.status_label)}</dd></div></dl></section><section data-inbox-entry-results="${p.escape(entry.entry_id)}" aria-label="${p.text("处理结果")}"></section></div>
  </article>`;
}

function resultActions(entry: InboxUiEntry, p: InboxUiPrimitives): string {
  if (!isActiveInboxStatus(entry.status)) {
    return `<button class="mw-btn mw-btn--secondary" type="button" data-inbox-action="open" data-inbox-entry-id="${p.escape(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}">${p.text("重新打开")}</button>`;
  }
  // Recommendations do not remove the person's other valid choices.
  return defaultInboxNextBehaviorIds(true).map(id => writeButton(entry, id, entry.suggested_behavior_ids.includes(id), p)).join("");
}

function renderMaterialActions(entry: InboxUiEntry, p: InboxUiPrimitives): string {
  return [[INBOX_COMPOSE_BEHAVIOR_ID, "compose", "整理成文稿"], [INBOX_VERIFY_BEHAVIOR_ID, "verify", "先核查"]].map(([id, mode, label]) =>
    `<button class="mw-btn mw-btn--${isActiveInboxStatus(entry.status) && entry.suggested_behavior_ids.includes(id!) ? "primary" : "secondary"}" type="button" data-inbox-compose-open="${p.escape(entry.entry_id)}" data-inbox-compose-mode="${mode}">${p.text(label!)}</button>`).join("");
}

function renderNextSuggestion(entry: InboxUiEntry, p: InboxUiPrimitives): string {
  const judgment = entry.next_judgment;
  if (!judgment || !isActiveInboxStatus(entry.status)) return "";
  const names: Record<string, string> = { [INBOX_COMPOSE_BEHAVIOR_ID]: "整理成文稿", [INBOX_VERIFY_BEHAVIOR_ID]: "先核查", [INBOX_DISMISS_BEHAVIOR_ID]: "忽略", [INBOX_DONE_BEHAVIOR_ID]: "做完了" };
  const label = judgment.outcome === "needs_review" ? p.text("判断未完成，请人工复核或重试")
    : p.text("建议：{action}，由你确认执行", { action: p.text(names[judgment.suggested_behavior_ids[0] ?? ""] ?? "查看原消息") });
  return `<p class="inbox-next-suggestion">${p.escape(label)} <small>v${judgment.function_version} · ${p.escape(p.formatDate(judgment.created_at))}</small><button class="mw-btn mw-btn--ghost" type="button" data-inbox-evaluate="${p.escape(entry.entry_id)}">${p.text("重新判断")}</button></p>`;
}

function writeButton(entry: InboxUiEntry, behaviorId: string, primary: boolean, p: InboxUiPrimitives): string {
  if (behaviorId === INBOX_DISMISS_BEHAVIOR_ID) {
    const cls = primary ? "mw-btn mw-btn--primary" : "mw-btn mw-btn--ghost feed-action-subtle";
    return `<button class="${cls}" type="button" data-inbox-action="dismissed" data-inbox-entry-id="${p.escape(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}">${p.text("忽略")}</button>`;
  }
  if (behaviorId !== INBOX_DONE_BEHAVIOR_ID) return "";
  const cls = primary ? "mw-btn mw-btn--primary" : "mw-btn mw-btn--secondary";
  return `<button class="${cls}" type="button" data-inbox-action="done" data-inbox-entry-id="${p.escape(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}">${p.icon("check")}${p.text("标记已处理")}</button>`;
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
