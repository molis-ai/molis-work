import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalEventStateView } from "./contract/goals.js";
import { renderProgressSource, formatEventTime } from "./event-history-body.js";
import type { GoalsDocumentContext, GoalsDocumentItem, GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import { type GoalEventDocumentView } from "./event-document-model.js";
import { createEventDocumentForms } from "./event-document-forms.js";
import type { GoalHistoryIndexItem } from "./event-history-map.js";

export function renderGoalEventDocument(
  item: GoalsDocumentItem,
  context: GoalsDocumentContext,
  selected: boolean,
  primitives: GoalsDocumentUiPrimitives,
): string {
  const { translate: readText, escapeHtml, icon, formatDate, renderVisibleGoalStatus } = primitives;
  const forms = createEventDocumentForms(primitives);
  const doc = context.eventDocument;
  const goal = item.goal;
  const goalId = escapeHtml(goal.goal_id);
  const owned = isEventStateOwner(item, doc);
  const state = doc?.state;
  const judgment = currentJudgment(state, readText);
  const stale = state?.progress_summary?.stale
    ? `<span class="overview-timestamp">${uiText("goals.event-document-ui.summary-has-not-caught-up-latest-updates")}</span>`
    : state?.progress_summary
      ? `<span class="overview-timestamp">${formatDate(state.progress_summary.recorded_at)}</span>`
      : "";
  const moreActions = `<details class="goal-more"><summary aria-label="${uiText("goals.event-document-ui.more-goal-actions")}">${icon("more")}</summary><div>
    <button class="mw-btn mw-btn--secondary" type="button" data-event-reader="planning">${icon("tune")}<span>${uiText("goals.event-document-ui.record-templates")}</span></button>
    ${goal.archived_at
      ? `<button class="mw-btn mw-btn--secondary" type="button" data-goal-archive="false" data-goal-id="${goalId}">${icon("refresh")}<span>${uiText("goals.event-document-ui.restore")}</span></button>`
      : item.display_status === "completed"
        ? `<button class="mw-btn mw-btn--secondary" type="button" data-goal-archive="true" data-goal-id="${goalId}">${icon("archive")}<span>${uiText("goals.event-document-ui.archive-goal")}</span></button>` : ""}
    ${goal.archived_at ? "" : `<button class="mw-btn mw-btn--danger-outline" type="button" data-open-goal-trash data-goal-id="${goalId}" data-goal-title="${escapeHtml(goal.title)}">${icon("archive")}<span>${uiText("goals.event-document-ui.move-trash")}</span></button>`}
  </div></details>`;
  const recordMenu = owned ? `<details class="timeline-compose" data-record-menu><summary>${icon("plus")}<span>${uiText("goals.event-document-ui.add-entry")}</span></summary><div class="timeline-compose-options">
    <button type="button" data-event-form-open="note"><strong>${uiText("goals.event-document-ui.note")}</strong><small>${uiText("goals.event-document-ui.save-thoughts-facts-without-messaging-ai")}</small></button>
    <button type="button" data-event-form-open="progress"><strong>${uiText("goals.event-document-ui.progress-update")}</strong><small>${uiText("goals.event-document-ui.update-where-things-stand-what-comes-next")}</small></button>
    <button type="button" data-event-form-open="concern"><strong>${uiText("goals.event-document-ui.issues-risks")}</strong><small>${uiText("goals.event-document-ui.log-resolve-issues-affecting-completion")}</small></button>
  </div></details>` : "";
  const timeline = renderTimeline(doc?.timeline.items ?? [], readText, escapeHtml, state);
  return `<article class="goal-event-document" data-goal-view="${goalId}" data-goal-event-document data-event-work="${doc?.state.owner ? "true" : "false"}" data-agreement-version="${state?.agreement.version ?? 0}" data-config-version="${state?.config.version ?? 0}" data-observed-cursor="${state?.observed_event_cursor ?? 0}" data-goal-event-cursor="${state?.goal_event_cursor ?? 0}"${selected ? "" : " hidden"}>
    <aside class="goal-workspace-hero" aria-label="${uiText("goals.event-document-ui.goal-info")}">
      <details class="goal-info-popover" data-goal-info open>
        <summary><span class="goal-info-label">${uiText("goals.event-document-ui.goal-info")}</span><span class="goal-info-collapsed-title">${escapeHtml(goal.title)}</span>${renderVisibleGoalStatus(item)}${icon("chevron-down")}</summary>
        <div class="goal-info-body">
          <span class="goal-doc-mark" aria-hidden="true">${icon("target")}</span>
          <h1 id="goal-title-${goalId}">${escapeHtml(goal.title)}</h1>
          <p class="goal-info-outcome">${escapeHtml((state?.agreement.outcome || goal.outcome) || uiText.text("goals.event-document-ui.intended-result-has-not-been-explained-yet"))}</p>
          <div class="goal-info-status" data-current-summary><p class="goal-current-fact">${escapeHtml(judgment.lead)}</p>${judgment.action ? `<button type="button" class="mw-btn mw-btn--link" ${judgment.form && owned ? `data-event-form-open="${judgment.form}"` : `data-event-reader="${judgment.reader || "requirements"}"`}>${escapeHtml(judgment.action)}${icon("chevron-right")}</button>` : ""}${state?.progress_summary?.summary && state.progress_summary.summary !== judgment.lead ? `<p class="goal-progress-fact">${escapeHtml(state.progress_summary.summary)}</p>` : ""}${stale}${renderProgressSource(state?.progress_summary?.source, escapeHtml)}${state?.progress_summary?.next_step ? `<p>${uiText("goals.event-document-ui.next")}：${escapeHtml(state.progress_summary.next_step)}</p>` : ""}</div>
          <button type="button" class="goal-info-requirements" data-event-reader="requirements" data-goal-requirement-progress><span>${uiText("goals.event-document-ui.completion-requirement")}</span><span>${state?.requirements.length ? uiText("goals.event-document-ui.done-total-satisfied", { done: state.requirements.filter((requirement) => requirement.currently_satisfied).length, total: state.requirements.length }) : uiText("goals.event-document-ui.not-defined")}</span>${icon("chevron-right")}</button>
          ${(() => { const materials = (item.input_bindings ?? []).filter((binding) => binding.state !== "inactive" && binding.source_type === "plugin_object").length + (item.artifact_inputs?.length ?? 0);
            return `<button type="button" class="goal-info-requirements" data-event-reader="description" data-goal-materials-entry><span>${uiText("goals.event-document-ui.inputs")}</span><span>${materials ? uiText("goals.event-document-ui.count", { count: materials }) : uiText("goals.event-document-ui.create-link")}</span>${icon("chevron-right")}</button>`; })()}
          ${item.artifact_outputs ? `<button type="button" class="goal-info-requirements" data-event-reader="requirements" data-goal-deliverables-entry><span>${uiText("goals.event-document-ui.deliverable")}</span><span>${uiText("goals.event-document-ui.count", { count: item.artifact_outputs })}</span>${icon("chevron-right")}</button>` : ""}
          ${state?.pending_decisions.length ? `<button type="button" class="goal-info-attention" data-event-form-open="decision">${uiText("goals.event-document-ui.count-awaiting-decision", { count: state.pending_decisions.length })}${icon("chevron-right")}</button>` : ""}
          ${owned && (doc?.transfer.kind === "resume_cancelled" || doc?.transfer.kind === "reopen_event_completed") ? `<button type="button" class="mw-btn mw-btn--primary" data-event-form-open="resume">${uiText("goals.event-document-ui.continue-goal")}</button>` : ""}
          <div class="goal-info-actions"><button type="button" class="mw-btn mw-btn--link" data-event-reader="description">${uiText("goals.event-document-ui.goal-requirements")}${icon("chevron-right")}</button>${moreActions}</div>
        </div>
      </details>
    </aside>
    ${context.decisionHtml ? `<section class="goal-pending-proposals" data-goal-decision-panel aria-label="${uiText("goals.event-document-ui.proposals-waiting-decision")}">${context.decisionHtml}</section>` : ""}
    <div class="goal-layout" data-goal-layout>
      <section class="timeline-pane" aria-labelledby="stream-title-${goalId}">
        <div class="stream-toolbar"><h2 id="stream-title-${goalId}">${uiText("goals.event-document-ui.timeline")} <span data-event-count>${doc?.timeline.items.length ?? 0}</span></h2>
          ${recordMenu}
        </div>
        <nav data-event-timeline data-pending-decision-events="${escapeHtml(JSON.stringify(state?.pending_decisions.map((request) => request.event_id) ?? []))}" aria-label="${uiText("goals.event-document-ui.choose-events-time")}">${timeline}</nav>
        <div class="timeline-footer">${uiText("goals.event-document-ui.newest-first")} <button type="button" class="mw-btn mw-btn--link" data-load-more-timeline${doc?.timeline.next_cursor == null ? " hidden" : ""} data-next-cursor="${doc?.timeline.next_cursor ?? ""}">${uiText("goals.event-document-ui.view-earlier-records")}</button><span>${uiText("goals.event-document-ui.switch-events")}</span></div>
      </section>
      <section class="detail-pane" aria-label="${uiText("goals.event-document-ui.selected-event-content")}">
        <div class="detail-toolbar"><button type="button" class="mw-btn mw-btn--link" data-event-back>${uiText("goals.event-document-ui.back-workspace")}</button>
          <button type="button" class="mw-btn mw-btn--link mobile-back" data-action="timeline">${uiText("goals.event-document-ui.back-timeline")}</button>
          <span data-detail-location>${uiText("goals.event-document-ui.event-content")}</span>
          <div class="event-paging">
            <button type="button" class="mw-btn mw-btn--link" data-previous-event aria-label="${uiText("goals.event-document-ui.previous-event")}">${uiText("goals.event-document-ui.previous")}</button>
            <button type="button" class="mw-btn mw-btn--link" data-next-event aria-label="${uiText("goals.event-document-ui.next-event")}">${uiText("goals.event-document-ui.next-2")}</button>
          </div>
        </div>
        <div class="event-sheet" data-event-sheet tabindex="-1" hidden></div>
        <section class="reader" data-event-reader-root hidden>
          <header class="reader-header"><button type="button" class="mw-btn mw-btn--link" data-event-back>${uiText("goals.event-document-ui.back-selected-event")}</button><h2 data-reader-title></h2></header>
          <div class="reader-content" data-reader-content>
            ${doc ? forms.renderPlanning(doc, owned) : ""}
            ${renderDescription(doc, item, context, readText, escapeHtml)}
            ${renderRequirements(doc, item, context, readText, escapeHtml, owned)}
          </div>
        </section>
        ${owned && doc ? forms.renderTypeForm(doc) : ""}
        ${owned && doc ? forms.renderTypeEditForms(doc) : ""}
        ${owned && doc ? doc.types.map((type) => forms.renderReportForm(doc, type)).join("") : ""}
        ${owned && doc ? forms.renderRequirementForm(doc) : ""}
        ${owned && doc ? forms.renderAdoptForm(doc) : ""}
        ${owned && state ? forms.renderAgreementForm(state) : ""}
        ${owned && state ? forms.renderProgressForm(state) : ""}
        ${owned && state ? forms.renderConcernForm(state) : ""}
        ${owned && state ? forms.renderDecisionForm(state) : ""}
        ${owned && state ? forms.renderClosureForm(state) : ""}
        ${owned && doc ? forms.renderResumeForm(doc) : ""}
        ${owned ? forms.renderNoteForm(doc) : ""}
        <p class="event-conflict" data-event-conflict hidden></p>
      </section>
    </div>
  </article>`;
}

function currentJudgment(state: GoalEventStateView | undefined, _L: GoalsDocumentUiPrimitives["translate"]): { lead: string; action?: string; form?: string; reader?: string } {
  if (!state) return { lead: uiText.text("goals.event-document-ui.reading-current-facts") };
  if (!state.owner) return { lead: uiText.text("goals.event-document-ui.read-original-description-requirements-history-view-read-only") };
  if (state.work_status === "completed") return { lead: state.closure?.result || state.agreement.outcome || uiText.text("goals.event-document-ui.completion-conclusion-already-exists") };
  if (state.work_status === "cancelled") return { lead: uiText.text("goals.event-document-ui.cancelled-ordinary-records-will-not-restore-automatically") };
  const pending = state.pending_decisions[0];
  if (pending) return { lead: pending.question, action: uiText.text("goals.event-document-ui.make-decision"), form: "decision" };
  const concern = state.concerns.find((item) => item.status === "open" && item.blocks_closure);
  if (concern) return { lead: uiText.text("goals.event-document-ui.resolve-text", { text: concern.title }), action: uiText.text("goals.event-document-ui.review-issues-risks"), form: "concern" };
  const unmet = state.closure && !state.closure.completion_applied ? state.closure.unmet_reasons[0] : null;
  if (unmet) return { lead: unmet.message, action: uiText.text("goals.event-document-ui.view-completion-requirements"), reader: "requirements" };
  const rejected = state.requirements.find((item) => !item.currently_satisfied && item.user_conclusion?.verdict === "rejected");
  if (rejected) return { lead: uiText.text("goals.event-document-ui.did-not-accept-text", { text: rejected.statement }), action: uiText.text("goals.event-document-ui.view-completion-requirements"), reader: "requirements" };
  const human = state.requirements.find((item) => item.human_decision_required && !item.currently_satisfied);
  if (human) return { lead: uiText.text("goals.event-document-ui.awaiting-review-text", { text: human.statement }), action: uiText.text("goals.event-document-ui.view-completion-requirements"), reader: "requirements" };
  // Only the reporter's own "supports" is behind it (PWA-144), or a later report took the acceptance back (user 2026-11-05): the
  // person's acceptance meets it, so the next step is their decision.
  const claimed = state.requirements.find((item) => item.current_report?.verdict === "supports" && !item.currently_satisfied);
  if (claimed) return { lead: uiText.text("goals.event-document-ui.awaiting-acceptance-text", { text: claimed.statement }), action: uiText.text("goals.event-document-ui.record-decision"), form: "decision" };
  const requirement = state.requirements.find((item) => !item.currently_satisfied);
  if (requirement) return { lead: uiText.text("goals.event-document-ui.still-complete-text", { text: requirement.statement }), action: uiText.text("goals.event-document-ui.view-completion-requirements"), reader: "requirements" };
  const gap = state.gaps[0];
  if (gap) return { lead: gap.statement, action: uiText.text("goals.event-document-ui.view-completion-requirements"), reader: "requirements" };
  if (!state.requirements.length) return { lead: uiText.text("goals.event-document-ui.completion-requirements-have-not-been-defined-yet"), action: uiText.text("goals.event-document-ui.add-completion-requirement"), form: "requirement" };
  return { lead: state.progress_summary?.summary || uiText.text("goals.event-document-ui.requirements-satisfied-completion-still-needs-confirmation"), action: uiText.text("goals.event-document-ui.view-completion-requirements"), reader: "requirements" };
}

function renderTimeline(items: readonly GoalHistoryIndexItem[], _L: GoalsDocumentUiPrimitives["translate"], escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"], state?: GoalEventStateView): string {
  if (!items.length) return `<p class="no-results">${uiText("goals.event-document-ui.no-timeline-points-yet-they-appear-after-intent")}</p>`;
  const groups = new Map<string, GoalHistoryIndexItem[]>();
  for (const item of items) {
    const day = formatEventTime(item.received_at).slice(0, 10) || uiText.text("goals.event-document-ui.no-date");
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()].map(([day, rows]) => `<div class="day-label">${escapeHtml(day)}</div>${rows.map((item) => {
    const current = false;
    const kind = item.lane && item.lane !== "other" ? item.lane : "";
    const time = formatClock(item.received_at);
    const pending = item.type_label === "请求决定" ? state?.pending_decisions.find((request) => request.event_id === item.event_id) : undefined;
    const statusLabel = item.type_label === "请求决定" && state ? pending ? uiText.text("goals.event-document-ui.needs-decision") : uiText.text("goals.event-document-ui.handled") : item.status_label;
    return `<button type="button" class="timeline-entry${kind ? ` is-${kind}` : ""}" data-timeline-item="${escapeHtml(item.item_id)}" data-event-id="${escapeHtml(item.event_id ?? "")}" data-source="${escapeHtml(item.source)}" data-original-id="${escapeHtml(item.original_id)}" data-lane="${escapeHtml(item.lane)}" aria-current="${current ? "true" : "false"}" aria-expanded="${current ? "true" : "false"}">
      <time datetime="${escapeHtml(item.received_at)}">${escapeHtml(time)}</time>
      <span class="timeline-dot" aria-hidden="true"><span class="timeline-mark">${item.relation ? "↗" : kind === "result" ? "✓" : kind === "decision" ? "◇" : kind === "problem" ? "!" : "·"}</span></span>
      <span class="timeline-copy"><strong>${escapeHtml(item.title)}</strong><small><b class="timeline-type">${escapeHtml(item.type_label)}</b> <span class="timeline-actor">${escapeHtml(item.actor_id)}</span></small>${statusLabel ? `<em class="history-state">${escapeHtml(statusLabel)}</em>` : ""}</span>
    </button>`;
  }).join("")}`).join("");
}

function isEventStateOwner(item: GoalsDocumentItem, doc: GoalEventDocumentView | null | undefined): boolean {
  return Boolean(doc?.state.owner) || item.event_work === true;
}

function originalDefinitionLine(
  label: string,
  values: readonly string[] | undefined,
  _L: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
): string {
  return `<p>${uiText(label)}：${escapeHtml((values ?? []).join("、") || uiText.text("goals.event-document-ui.not-filled"))}</p>`;
}

function renderDescription(
  doc: GoalEventDocumentView | null | undefined,
  item: GoalsDocumentItem,
  context: GoalsDocumentContext,
  readText: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
): string {
  const d = doc?.description;
  return `<div class="event-reader-panel" id="goal-description-${escapeHtml(item.goal.goal_id)}" data-event-panel="description" hidden>
    <h3>${uiText("goals.event-document-ui.what-get")}</h3><p>${escapeHtml(d?.outcome || item.goal.outcome || uiText.text("goals.event-document-ui.not-filled"))}</p>
    <h3>${uiText("goals.event-document-ui.why")}</h3><p>${escapeHtml(d?.why || item.goal.why || uiText.text("goals.event-document-ui.not-filled"))}</p>
    <h3>${uiText("goals.event-document-ui.how-will-work")}</h3><p>${escapeHtml(d?.business_logic || item.goal.business_logic || uiText.text("goals.event-document-ui.not-filled"))}</p>
    <h3>${uiText("goals.event-document-ui.effective-decisions")}</h3>${doc?.state.current_decisions.length
      ? `<ul>${doc.state.current_decisions.map((decision) => `<li>${escapeHtml(decision.conclusion)} · ${escapeHtml(decision.actor_id)}</li>`).join("")}</ul>`
      : `<p>${uiText("goals.event-document-ui.there-no-currently-effective-user-decision")}</p>`}
    <h3>${uiText("goals.event-document-ui.scope")}</h3>
    ${originalDefinitionLine("goals.event-document-ui.scope-2", d?.in_scope ?? item.goal.in_scope, readText, escapeHtml)}
    ${originalDefinitionLine("goals.event-document-ui.out-scope", d?.out_of_scope ?? item.goal.out_of_scope, readText, escapeHtml)}
    ${originalDefinitionLine("goals.event-document-ui.constraints", d?.constraints ?? item.goal.constraints, readText, escapeHtml)}
    ${originalDefinitionLine("goals.event-document-ui.required-inputs", d?.required_inputs ?? item.goal.required_inputs, readText, escapeHtml)}
    ${originalDefinitionLine("goals.event-document-ui.promised-outputs", d?.promised_outputs ?? item.goal.promised_outputs, readText, escapeHtml)}
    ${context.coverageHtml}
    ${context.relatedWorkHtml}
  </div>`;
}

function formatOriginalCriterionTarget(
  target: Record<string, unknown> | null | undefined,
  _L: GoalsDocumentUiPrimitives["translate"],
): string {
  if (target == null) return uiText.text("goals.event-document-ui.no-target-value");
  const keys = Object.keys(target);
  if (keys.length === 1 && "value" in target) return String(target.value ?? "");
  if (keys.length === 2 && "value" in target && typeof target.unit === "string" && target.unit.trim()) {
    return `${String(target.value ?? "")} ${target.unit}`;
  }
  return JSON.stringify(target);
}

function renderOriginalCriteria(
  criteria: GoalsDocumentItem["goal"]["acceptance_criteria"],
  readText: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
): string {
  if (!criteria.length) return "";
  return `<details class="original-goal-criteria"><summary>${uiText("goals.event-document-ui.original-goal-standard")}</summary>
    <p>${uiText("goals.event-document-ui.keeps-goals-saved-original-acceptance-criteria-current-results")}</p>
    <ul>${criteria.map((criterion) => `<li><strong>${escapeHtml(criterion.statement)}</strong><small>${uiText("goals.event-document-ui.pass-when")}${escapeHtml(criterion.pass_condition || "")}</small><p>${uiText("goals.event-document-ui.criterion-id")}：${escapeHtml(criterion.criterion_id)}</p><p>${uiText("goals.event-document-ui.decision-method")}：${escapeHtml(criterion.decision_method)}</p><p>${uiText("goals.event-document-ui.target")}：${escapeHtml(formatOriginalCriterionTarget(criterion.target, readText))}</p><p>${uiText("goals.event-document-ui.required-evidence")}：${escapeHtml(criterion.required_evidence.join("、") || uiText.text("goals.event-document-ui.not-specified"))}</p></li>`).join("")}</ul>
  </details>`;
}

function renderRequirements(
  doc: GoalEventDocumentView | null | undefined,
  item: GoalsDocumentItem,
  context: GoalsDocumentContext,
  readText: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
  owned = false,
): string {
  const rows = doc?.state.requirements ?? [];
  const original = item.goal.acceptance_criteria ?? [];
  return `<div class="event-reader-panel" id="goal-requirements-${escapeHtml(item.goal.goal_id)}" data-event-panel="requirements" hidden>
    <h3>${uiText("goals.event-document-ui.current-completion-requirements")}</h3>
    ${rows.length ? `<ul>${rows.map((requirement) => {
      const source = requirement.user_conclusion?.verdict === "accepted"
        ? uiText.text("goals.event-document-ui.accepted-user")
        : requirement.current_report
          ? `${uiText.text("goals.event-document-ui.reporter")} ${escapeHtml(requirement.current_report.actor_id)} · ${uiText.text("goals.event-document-ui.not-independently-checked")}`
          : requirement.human_decision_required ? uiText.text("goals.event-document-ui.needs-user-acceptance") : "";
      const boundType = owned ? escapeHtml(requirement.bound_type_ids[0] ?? "") : "";
      return `<li><button type="button" class="mw-btn mw-btn--link" data-locate-event="${escapeHtml(requirement.current_report?.event_id ?? "")}"${boundType ? ` data-bound-type="${boundType}"` : ""}>${escapeHtml(requirement.statement)}</button><small>${requirement.currently_satisfied ? uiText("goals.event-document-ui.currently-satisfied") : uiText("goals.event-document-ui.not-yet-satisfied")}${source ? ` · ${source}` : ""}</small></li>`;
    }).join("")}</ul>` : `<p>${uiText("goals.event-document-ui.there-no-completion-requirements-yet")}</p>`}
    ${owned ? `<div class="event-actions"><button type="button" class="mw-btn mw-btn--secondary" data-event-form-open="requirement">${uiText("goals.event-document-ui.add-completion-requirement-2")}</button><button type="button" class="mw-btn mw-btn--secondary" data-event-form-open="agreement">${uiText("goals.event-document-ui.change-current-agreement")}</button><button type="button" class="mw-btn mw-btn--primary" data-event-form-open="decision">${uiText("goals.event-document-ui.record-decision")}</button><button type="button" class="mw-btn mw-btn--primary" data-event-form-open="closure">${uiText("goals.event-document-ui.check-close")}</button></div>` : ""}
    ${renderOriginalCriteria(original, readText, escapeHtml)}
    ${context.artifactHtml}
  </div>`;
}

function formatClock(value: string): string {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16) || "--:--";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
