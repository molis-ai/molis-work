/** The timeline of a Goal's event document: the rows a later page of records adds. */
import { relationWordKey } from "../relation-words.js";

/** One record of the timeline, as `/event-timeline` lists it. */
export interface TimelineItem {
  readonly item_id: string;
  readonly event_id?: string;
  readonly source?: string;
  readonly original_id?: string;
  readonly lane?: string;
  readonly received_at?: string;
  readonly title?: string;
  readonly type_label?: string;
  readonly type_key?: string;
  readonly actor_id?: string;
  readonly status_label?: string;
  readonly status_key?: string | null;
  readonly relation?: {
    readonly type?: string;
    readonly label?: string;
    readonly from_title?: string;
    readonly to_title?: string;
  } | null;
}

const HISTORY_TYPE_KEYS: Record<string, string> = {
  progress_summary: "goals.history.type.progress-summary",
  observation_note: "goals.history.type.observation-note",
  concern_opened: "goals.history.type.concern-opened",
  concern_resolved: "goals.history.type.concern-resolved",
  concern_accepted: "goals.history.type.concern-accepted",
  concern_overturned: "goals.history.type.concern-overturned",
  decision_requested: "goals.history.type.decision-requested",
  user_decision: "goals.history.type.user-decision",
  decision_cited: "goals.history.type.decision-cited",
  agreement_set: "goals.history.type.agreement-set",
  closure_submitted: "goals.history.type.closure-submitted",
  completion_reopened: "goals.history.type.completion-reopened",
  work_resumed: "goals.history.type.work-resumed",
  event_owner_continued: "goals.history.type.event-owner-continued",
  input_acknowledged: "goals.history.type.input-acknowledged",
  report: "goals.history.type.report",
  configuration: "goals.history.type.configuration",
  system: "goals.history.type.system",
  "goal.created": "goals.history.journal.created",
  "goal.updated": "goals.history.journal.updated",
  "goal.accepted": "goals.history.journal.accepted",
  "relation.added": "goals.history.journal.relation-added",
  "relation.deactivated": "goals.history.journal.relation-deactivated",
  record: "goals.history.type.record",
};

const HISTORY_STATUS_KEYS: Record<string, string> = {
  created: "goals.history.status.created",
  removed: "goals.history.status.removed",
};

const RELATION_TYPES = new Set([
  "part_of", "depends_on", "conflicts_with", "mitigates", "extends",
  "replaces", "corrects", "invalidates", "migrates_from",
]);

export const escapeText = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Hides a row the lane filter leaves out. */
export const applyLaneFilter = (node: HTMLElement, filter: string) => {
  node.hidden = filter !== "all" && node.dataset.lane !== filter;
};

const pad = (value: number) => String(value).padStart(2, "0");
const markOf = (item: TimelineItem) => item.relation ? "↗" : item.lane === "result" ? "✓" : item.lane === "decision" ? "◇" : item.lane === "problem" ? "!" : "·";

/** Appends the rows of `items` the timeline does not show yet, under a day heading when the day changes. */
export const appendTimelineItems = (nav: HTMLElement, items: readonly TimelineItem[], reading: { readonly item: string; readonly filter: string }) => {
  const existing = new Set([...nav.querySelectorAll<HTMLElement>("[data-timeline-item]")].map((node) => node.dataset.timelineItem));
  const pending = new Set<string>(JSON.parse(nav.dataset.pendingDecisionEvents || "[]"));
  let lastDay = [...nav.querySelectorAll(".day-label")].at(-1)?.textContent;
  items.forEach((item) => {
    if (existing.has(item.item_id)) return;
    existing.add(item.item_id);
    const received = item.received_at || "";
    const date = new Date(received);
    const validDate = !Number.isNaN(date.getTime());
    const day = validDate ? date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) : globalThis.t.text("goals.event-document-client.no-date");
    if (day !== lastDay) {
      const heading = document.createElement("div");
      heading.className = "day-label";
      heading.textContent = day;
      nav.append(heading);
      lastDay = day;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "timeline-entry";
    button.dataset.timelineItem = item.item_id;
    button.dataset.eventId = item.event_id || "";
    button.dataset.source = item.source || "";
    button.dataset.originalId = item.original_id || "";
    button.dataset.lane = item.lane || "other";
    if (item.lane && item.lane !== "other") button.classList.add("is-" + item.lane);
    button.setAttribute("aria-current", String(item.item_id === reading.item));
    button.setAttribute("aria-expanded", "false");
    applyLaneFilter(button, reading.filter);
    const time = validDate ? pad(date.getHours()) + ":" + pad(date.getMinutes()) : "--:--";
    const hasTypeKey = Boolean(item.type_key && Object.hasOwn(HISTORY_TYPE_KEYS, item.type_key));
    const typeLabel = hasTypeKey ? globalThis.t.text(HISTORY_TYPE_KEYS[item.type_key!]!) : (item.type_label || "");
    const relationLabel = item.relation?.type && RELATION_TYPES.has(item.relation.type) ? globalThis.t.text(relationWordKey(item.relation.type, "out")) : (item.relation?.label || "");
    const title = item.relation && item.relation.from_title && item.relation.to_title
      ? item.relation.from_title + " → " + relationLabel + " → " + item.relation.to_title
      : (item.source === "journal" && item.title === item.type_label && hasTypeKey ? typeLabel : (item.title || ""));
    const status = item.type_key === "decision_requested"
      ? pending.has(item.event_id || "") ? globalThis.t.text("goals.event-document-client.needs-decision") : globalThis.t.text("goals.event-document-client.handled")
      : item.status_key && Object.hasOwn(HISTORY_STATUS_KEYS, item.status_key) ? globalThis.t.text(HISTORY_STATUS_KEYS[item.status_key]!) : item.status_label;
    button.innerHTML = "<time></time><span class=timeline-dot aria-hidden=true><span class=timeline-mark>" + markOf(item) + "</span></span><span class=timeline-copy><strong>" + escapeText(title) + "</strong><small><b class=timeline-type>" + escapeText(typeLabel) + "</b> <span class=timeline-actor>" + escapeText(item.actor_id || "") + "</span></small>" + (status ? "<em class=history-state>" + escapeText(status) + "</em>" : "") + "</span>";
    const stamp = button.querySelector("time");
    if (stamp) {
      stamp.dateTime = received;
      stamp.textContent = time;
    }
    nav.append(button);
  });
};

/** What `/event-state` says of the current agreement and configuration. */
export interface EventState {
  readonly agreement?: { readonly outcome?: string; readonly version?: number };
  readonly config?: { readonly version?: number };
  readonly review_version?: string;
}

/** The lines a version conflict shows: the current expected result and the two versions it is measured against. */
export const conflictLines = (state: EventState) =>
  "<p>" + escapeText(globalThis.t.text("goals.event-document-client.current-expected-result")) + globalThis.t.text("common.punctuation.label-separator") + escapeText(state.agreement?.outcome || globalThis.t.text("goals.event-document-client.not-filled")) + "</p>"
  + "<p>" + escapeText(globalThis.t.text("goals.event-document-client.agreement-version")) + " " + escapeText(state.agreement?.version ?? "") + " · " + escapeText(globalThis.t.text("goals.event-document-client.configuration-version")) + " " + escapeText(state.config?.version ?? "") + "</p>";

/** A new row of a record template's field list. */
export const typeFieldRow = () => {
  const wrap = document.createElement("div");
  wrap.className = "type-field-row";
  const id = "field-" + (globalThis.crypto?.randomUUID?.().slice(0, 8) || String(Date.now()));
  wrap.innerHTML = '<input type="hidden" name="field_id" value="' + id + '"><label><span>' + escapeText(globalThis.t.text("goals.event-document-client.field-name")) + '</span><input name="field_name" required></label><label><span>' + escapeText(globalThis.t.text("goals.event-document-client.description")) + '</span><input name="field_purpose" required value="' + escapeText(globalThis.t.text("goals.event-document-client.record-original-text")) + '"></label><div class="type-field-tools"><label><span>' + escapeText(globalThis.t.text("goals.event-document-client.content-form")) + '</span><select name="field_format"><option value="text">' + escapeText(globalThis.t.text("goals.event-document-client.short-text")) + '</option><option value="longtext" selected>' + escapeText(globalThis.t.text("goals.event-document-client.long-text")) + '</option></select></label><label class="check-row"><input type="checkbox" name="field_required" checked><span>' + escapeText(globalThis.t.text("goals.event-document-client.required")) + '</span></label><button type="button" class="mw-btn mw-btn--link" data-remove-type-field>' + escapeText(globalThis.t.text("goals.event-document-client.remove")) + "</button></div>";
  return wrap;
};
