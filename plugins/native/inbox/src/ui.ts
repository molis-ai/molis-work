import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { InboxStageData } from "./actions.js";
import type { InboxJudgmentSummary } from "./route-handlers.js";
import type {
  StagePageModel,
  UiContribution,
  UiContributionDeclaration,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import {
  INBOX_DISMISS_OPTION_ID,
  INBOX_DONE_OPTION_ID,
  INBOX_COMPOSE_OPTION_ID,
  INBOX_VERIFY_OPTION_ID,
  defaultInboxNextOptionIds,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { buildInboxUiEntries, isActiveInboxStatus, type InboxUiEntry, type InboxUiFilter } from "./projection.js";

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

export const inboxUiDescriptor: UiContributionDeclaration = {
  contribution_id: INBOX_UI_CONTRIBUTION_ID,
  kind: "primary-page",
  navigation_id: "inbox",
  label: "Inbox",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const inboxUiContribution: UiContribution<InboxUiModel | StagePageModel<InboxStageData>> = {
  descriptor: inboxUiDescriptor,
  render(request: UiRenderRequest<InboxUiModel | StagePageModel<InboxStageData>>): string {
    const model = "entries" in request.model ? request.model : inboxStageModel(request.model);
    switch (request.surface as InboxUiSurface) {
      case "directory":
        return renderInboxDirectory(model);
      case "workbench":
        return renderInboxWorkbench(model);
      default:
        throw new Error(`Inbox UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

function inboxStageModel(model: StagePageModel<InboxStageData>): InboxUiModel {
  if (!model.data) throw new ActionError("actions.dependency_missing", "Inbox 舞台数据不可用");
  const { entries, subjects, judgments, judgment } = model.data, p = model.primitives;
  const byEntry = new Map(judgments.map(record => [record.subject.id, record]));
  const names = new Map(subjects.map(subject => [subject.entry_id, subject]));
  return { route_prefix: model.route_prefix, filter: "active", judgment, primitives: p,
    entries: buildInboxUiEntries(entries.map(entry => {
      const current = byEntry.get(entry.entry_id) ?? null;
      return { ...entry, next_judgment: current, suggested_behavior_ids: current?.outcome === "ok" ? current.suggested_behavior_ids : [] };
    }), entry => {
      const subject = names.get(entry.entry_id), available = subject?.title !== undefined && subject.title !== null;
      if (entry.subject_type === "feed_item") return { available, title: subject?.title || uiText.text("inbox.ui.original-feed-item-unavailable"),
        source_label: subject?.source_label || "Feed", open: available ? { kind: "feed", item_id: entry.subject_id } : null };
      if (entry.subject_type === "source_fault") return { available, title: available ? uiText.text("inbox.ui.source-source-needs-attention", { source: subject!.title! }) : uiText.text("inbox.ui.original-source-unavailable"),
        source_label: subject?.source_label || uiText.text("inbox.ui.other-source"), open: available ? { kind: "source", source_id: entry.subject_id } : null };
      return { available, title: subject?.title || uiText.text("inbox.ui.original-goal-unavailable"), source_label: "Molis Work",
        open: available ? { kind: "goal", href: `${model.route_prefix}/goals/${encodeURIComponent(entry.subject_id)}` } : null };
    }, p.text) };
}

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
      <header class="plugin-stage-chrome inbox-compose-toolbar"><button class="mw-btn mw-btn--ghost inbox-compose-trigger" type="button" data-inbox-compose-open="">${p.icon("note")}<span>${uiText("inbox.ui.write-materials-pages")}</span></button></header>
      ${model.judgment ? `<details class="inbox-next-config"><summary><span class="goal-collection-caret" aria-hidden="true">${p.icon("chevron-down")}</span>${uiText("inbox.ui.suggested-next-step")}</summary><p>${p.escape(model.judgment.name || uiText.text("inbox.ui.no-rule-selected"))}${model.judgment.name && model.judgment.reason ? ` · ${p.escape(model.judgment.reason)}` : ""}</p><button class="mw-btn mw-btn--secondary" type="button" data-inbox-functions>${uiText("inbox.ui.configure-judgment-rule")}</button><button class="mw-btn mw-btn--secondary" type="button" data-inbox-evaluate${model.judgment.available && active.length ? "" : " disabled"}>${uiText("inbox.ui.update-suggestions-first-20-open-items")}</button><p role="status" data-inbox-evaluate-status></p></details>` : ""}
      ${renderInboxFold("active", uiText.text("inbox.ui.open"), "alert", active, p)}
      ${renderInboxFold("history", uiText.text("inbox.ui.history"), "check", history, p)}
    </div>
    <div class="plugin-stage-workspace" data-inbox-stage-workspace hidden>
      ${details}
      <div class="feed-detail-empty mw-empty" data-inbox-detail-empty>${p.icon("inbox")}<h1>${uiText("inbox.ui.nothing-needs-attention-right-now")}</h1></div>
    </div>
    <dialog class="inbox-compose-dialog" data-inbox-compose>
      <form data-inbox-compose-form>
        <header><h2>${uiText("inbox.ui.write-materials-pages")}</h2><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-inbox-compose-close aria-label="${uiText("inbox.ui.close")}">${p.icon("x")}</button></header>
        <p>${uiText("inbox.ui.select-original-materials-inbox-add-instructions-then-continue")}</p>
        <fieldset data-inbox-compose-materials><legend>${uiText("inbox.ui.selected-materials")}</legend></fieldset>
        <label>${uiText("inbox.ui.document-title")}<input class="mw-input" name="title" required maxlength="80" autocomplete="off"></label>
        <label>${uiText("inbox.ui.instructions")}<textarea class="mw-textarea" name="instructions" required maxlength="4000" rows="4" placeholder="${uiText("inbox.ui.example-write-ai-product-observation-separating-facts-inferences")}"></textarea></label>
        <p role="status" data-inbox-compose-status></p>
        <footer><button class="mw-btn mw-btn--secondary" type="button" data-inbox-compose-close>${uiText("inbox.ui.continue-later")}</button><button class="mw-btn mw-btn--primary" type="submit" data-inbox-compose-submit>${uiText("inbox.ui.generate-document")}</button></footer>
        <section data-inbox-compose-results aria-label="${uiText("inbox.ui.decision-history")}"></section>
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
    <div class="inbox-stage-group-body" role="list" aria-label="${p.escape(label)}">${rows}<p class="goal-collection-empty" data-inbox-stage-group-empty${entries.length ? " hidden" : ""}>${uiText(id === "history" ? "inbox.ui.no-completed-ignored-items" : "inbox.ui.nothing-needs-attention-right-now")}</p></div>
  </details>`;
}

function renderInboxStageRow(entry: InboxUiEntry, p: InboxUiPrimitives): string {
  return `<article class="inbox-stage-item feed-stage-item" role="listitem" data-inbox-item-wrap="${p.escape(entry.entry_id)}">
    <button class="feed-stage-entry directory-list-row" type="button" aria-selected="false" data-frame-asset="inbox" data-frame-subject-kind="inbox_entry" data-frame-asset-id="${p.escape(entry.entry_id)}" data-frame-asset-title="${p.escape(entry.title)}" data-frame-asset-caption="${p.escape(entry.reason_label)}" data-frame-reading-reason="${p.escape(entry.reason_label)}" data-frame-reading-relation="${p.escape(entry.relation_label)}" data-frame-reading-next="${p.escape(entry.next_action)}" data-frame-reading-status="${p.escape(entry.status_label)}" data-inbox-row data-inbox-entry-id="${p.escape(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}" data-inbox-status="${p.escape(entry.status)}" data-inbox-subject-type="${p.escape(entry.subject_type)}" data-inbox-subject-id="${p.escape(entry.subject_id)}" data-inbox-reason="${p.escape(entry.reason)}">
      <span class="feed-stage-leading"><span data-frame-drag-slot aria-hidden="true" style="display:inline-block;width:24px;height:24px;flex:0 0 24px;vertical-align:middle"></span><strong title="${p.escape(entry.title)}">${p.escape(entry.title)}</strong></span>
      <span class="feed-entry-source">${p.escape(entry.reason_label)}</span>
      <span class="mw-status mw-status--${entry.status === "open" ? "attention" : entry.status === "in_progress" ? "progress" : entry.status === "done" ? "done" : "quiet"} mw-status--plain feed-entry-status" data-mw-state="${entry.status === "open" ? "answer" : entry.status === "in_progress" ? "doing" : entry.status === "done" ? "done" : "cancelled"}">${p.escape(entry.status_label)}</span>
    </button>
  </article>`;
}

function renderInboxDetail(entry: InboxUiEntry, selected: boolean, p: InboxUiPrimitives): string {
  const openAction = openButton(entry, p);
  return `<article class="feed-detail feed-detail--attention inbox-reference-detail" data-inbox-detail="${p.escape(entry.entry_id)}" data-inbox-subject-type="${entry.subject_type}" ${selected ? "" : " hidden"}>
    <header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-inbox-collapse aria-label="${uiText("inbox.ui.back-inbox-list")}" title="${uiText("inbox.ui.back-inbox-list")}">${p.icon("chevron-right")}</button><div class="feed-detail-kicker"><span class="mw-status mw-status--attention">${p.escape(entry.kind_label)}</span><span class="mw-status mw-status--quiet">${p.escape(entry.source_label)}</span><span class="mw-status mw-status--${entry.status === "open" ? "attention" : entry.status === "in_progress" ? "progress" : entry.status === "done" ? "done" : "quiet"}" data-mw-state="${entry.status === "open" ? "answer" : entry.status === "in_progress" ? "doing" : entry.status === "done" ? "done" : "cancelled"}">${p.escape(entry.status_label)}</span></div></header>
    <header class="feed-detail-header"><h1>${p.escape(entry.title)}</h1></header>
    <div class="inbox-reference-footer">${renderNextSuggestion(entry, p)}<div class="feed-detail-actions">${openAction}${entry.subject_type === "feed_item" && entry.available ? renderMaterialActions(entry, p) : ""}${todoButton(entry, p)}${resultActions(entry, p)}</div><p class="feed-action-status" data-inbox-action-status role="status" hidden></p></div>
    <div class="inbox-reference-body"><section class="inbox-attention-context" aria-label="${uiText("inbox.ui.processing-context")}"><dl><div><dt>${uiText("inbox.ui.why-entered-inbox")}</dt><dd>${p.escape(entry.reason_label)}</dd></div><div><dt>${uiText("inbox.ui.related-object")}</dt><dd>${p.escape(entry.relation_label)}</dd></div><div class="inbox-attention-next"><dt>${uiText("inbox.ui.next")}</dt><dd>${p.escape(entry.next_action)}</dd></div><div><dt>${uiText("inbox.ui.current-state")}</dt><dd>${p.escape(entry.status_label)}</dd></div></dl></section><section data-inbox-entry-results="${p.escape(entry.entry_id)}" aria-label="${uiText("inbox.ui.processed-result")}"></section></div>
  </article>`;
}

/**
 * "转为待办": the entry put into the creation entry named `todo` (`data-context-intake`), which the workbench finds in what the
 * plugins declare. The entry is kept as the todo's source; handling this entry does not complete the todo, and converting does
 * not handle the entry.
 */
function todoButton(entry: InboxUiEntry, p: InboxUiPrimitives): string {
  return `<button class="mw-btn mw-btn--secondary" type="button" data-context-intake="todo" data-context-id="${p.escape(entry.entry_id)}" data-context-title="${p.escape(entry.title)}">${p.icon("list")}${uiText("inbox.ui.make-todo")}</button>`;
}

function resultActions(entry: InboxUiEntry, p: InboxUiPrimitives): string {
  if (!isActiveInboxStatus(entry.status)) {
    return `<button class="mw-btn mw-btn--secondary" type="button" data-inbox-action="open" data-inbox-entry-id="${p.escape(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}">${uiText("inbox.ui.reopen")}</button>`;
  }
  // Recommendations do not remove the person's other valid choices.
  return defaultInboxNextOptionIds(true).map(id => writeButton(entry, id, entry.suggested_behavior_ids.includes(id), p)).join("");
}

function renderMaterialActions(entry: InboxUiEntry, p: InboxUiPrimitives): string {
  const choices = [[INBOX_COMPOSE_OPTION_ID, "compose", "inbox.ui.create-document"], [INBOX_VERIFY_OPTION_ID, "verify", "inbox.ui.verify-first"]] as const;
  return choices.map(([id, mode, label]) =>
    `<button class="mw-btn mw-btn--${isActiveInboxStatus(entry.status) && entry.suggested_behavior_ids.includes(id) ? "primary" : "secondary"}" type="button" data-inbox-compose-open="${p.escape(entry.entry_id)}" data-inbox-compose-mode="${mode}">${uiText(label)}</button>`).join("");
}

function renderNextSuggestion(entry: InboxUiEntry, p: InboxUiPrimitives): string {
  const judgment = entry.next_judgment;
  if (!judgment || !isActiveInboxStatus(entry.status)) return "";
  const names: Record<string, string> = { [INBOX_COMPOSE_OPTION_ID]: "inbox.ui.create-document", [INBOX_VERIFY_OPTION_ID]: "inbox.ui.verify-first", [INBOX_DISMISS_OPTION_ID]: "inbox.ui.ignore", [INBOX_DONE_OPTION_ID]: "inbox.ui.done" };
  const label = judgment.outcome === "needs_review" ? uiText.text("inbox.ui.judgment-incomplete-review-manually-retry")
    : uiText.text("inbox.ui.suggested-action-choose-whether-proceed", { action: uiText.text(names[judgment.suggested_behavior_ids[0] ?? ""] ?? "inbox.ui.view-original-message") });
  return `<p class="inbox-next-suggestion">${p.escape(label)} <small>v${judgment.function_version} · ${p.escape(p.formatDate(judgment.created_at))}</small><button class="mw-btn mw-btn--ghost" type="button" data-inbox-evaluate="${p.escape(entry.entry_id)}">${uiText("inbox.ui.evaluate-again")}</button></p>`;
}

function writeButton(entry: InboxUiEntry, optionId: string, primary: boolean, p: InboxUiPrimitives): string {
  if (optionId === INBOX_DISMISS_OPTION_ID) {
    const cls = primary ? "mw-btn mw-btn--primary" : "mw-btn mw-btn--ghost feed-action-subtle";
    return `<button class="${cls}" type="button" data-inbox-action="dismissed" data-inbox-entry-id="${p.escape(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}">${uiText("inbox.ui.ignore")}</button>`;
  }
  if (optionId !== INBOX_DONE_OPTION_ID) return "";
  const cls = primary ? "mw-btn mw-btn--primary" : "mw-btn mw-btn--secondary";
  return `<button class="${cls}" type="button" data-inbox-action="done" data-inbox-entry-id="${p.escape(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}">${p.icon("check")}${uiText("inbox.ui.mark-handled")}</button>`;
}

function openButton(entry: InboxUiEntry, p: InboxUiPrimitives): string {
  if (!entry.open || !entry.available) {
    return `<button class="mw-btn mw-btn--secondary" type="button" disabled aria-disabled="true">${uiText("inbox.ui.original-object-unavailable")}</button>`;
  }
  if (entry.open.kind === "feed") {
    return `<button class="mw-btn mw-btn--secondary" type="button" data-inbox-open-feed="${p.escape(entry.open.item_id)}">${p.icon("rss")}${uiText("inbox.ui.view-original-message")}</button>`;
  }
  if (entry.open.kind === "source") {
    return `<button class="mw-btn mw-btn--secondary" type="button" data-feed-task-config-open="${p.escape(entry.open.source_id)}">${p.icon("settings")}${uiText("inbox.ui.handling-task-configuration")}</button>`;
  }
  return `<a class="feed-linked-goal" href="${p.escape(entry.open.href)}">${p.icon("target")}${uiText("inbox.ui.open-goal")}</a>`;
}
