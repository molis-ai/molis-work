import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalEventStateView } from "./contract/goals.js";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import type { GoalRequirementRow } from "./event-document-model.js";
import type { EventFormShared } from "./event-forms-shared.js";
import { createDecisionForm } from "./event-forms-decision.js";

/** 约定相关的表单：关切、决定、收尾、约定与拟改变化；要求在平台的要求栏里加、改、认可。由 createEventDocumentForms 组合。 */
export function createAgreementForms(primitives: GoalsDocumentUiPrimitives, shared: EventFormShared) {
  const { escapeHtml } = primitives;
  void shared;
  const renderDecisionForm = createDecisionForm(primitives);
  function renderConcernForm(state: GoalEventStateView, rows: readonly GoalRequirementRow[]): string {
    const open = state.concerns.filter((item) => item.status === "open");
    const existing = open.length
      ? `<label><span>${uiText("goals.event-forms-agreement.existing-issues")}</span><select name="concern_id"><option value="">${uiText("goals.event-forms-agreement.record-new-concern")}</option>${
        open.map((item) => `<option value="${escapeHtml(item.concern_id)}">${escapeHtml(item.title)}</option>`).join("")
      }</select></label>
        <label data-concern-existing hidden><span>${uiText("goals.event-forms-agreement.processed-result")}</span><select name="action"><option value="open">${uiText("goals.event-forms-agreement.open-new")}</option><option value="resolve">${uiText("goals.event-forms-agreement.resolved")}</option><option value="accept">${uiText("goals.event-forms-agreement.accept-risk")}</option><option value="overturn">${uiText("goals.event-forms-agreement.overturned-counterevidence")}</option></select></label>`
      : `<input type="hidden" name="action" value="open">`;
    const requirements = rows.map((item) => `<label class="check-row"><input type="checkbox" name="requirement_ids" value="${escapeHtml(item.requirement_id)}"><span>${escapeHtml(item.statement)}</span></label>`).join("");
    const decisions = state.current_decisions.length
      ? `<label data-concern-decision hidden><span>${uiText("goals.event-forms-agreement.referenced-user-decision-required-when-accepting-risk")}</span><select name="cited_decision_id"><option value="">${uiText("goals.event-forms-agreement.no-reference")}</option>${
        state.current_decisions.map((item) => `<option value="${escapeHtml(item.decision_id)}">${escapeHtml(item.conclusion)} · ${escapeHtml(item.actor_id)}</option>`).join("")
      }</select></label>`
      : `<p class="form-note" data-concern-accept hidden>${uiText("goals.event-forms-agreement.accepting-risk-requires-user-decision-covering-its-scope")}</p>`;
    return `<form class="event-form mw-form" data-event-form="concern" hidden>
      <header class="event-form-heading"><h2>${uiText("goals.event-forms-agreement.issues-risks")}</h2>
      <p class="form-lead">${uiText("goals.event-forms-agreement.log-issue-follow-up-update-how-existing-issue")}</p></header>
      <div class="event-form-body">${existing}
      <label data-concern-new><span>${uiText("goals.event-forms-agreement.concern-title")}</span><input name="title" required placeholder="${uiText("goals.event-forms-agreement.what-happened-what-needs-following-up")}"></label>
      <label data-concern-new><span>${uiText("goals.event-forms-agreement.description")}</span><textarea name="statement" rows="3" required></textarea></label>
      <label data-concern-existing hidden><span>${uiText("goals.event-forms-agreement.reason-handling")}</span><textarea name="reason" rows="2"></textarea></label>
      <label data-concern-evidence hidden><span>${uiText("goals.event-forms-agreement.supporting-evidence-later-event-ids")}</span><input name="supporting_event_ids" placeholder="gevt-…"><small>${uiText("goals.event-forms-agreement.reference-events-recorded-goal-after-concern-was-opened")}</small></label>
      <fieldset data-concern-new><legend>${uiText("goals.event-forms-agreement.clarify-impact-scope")}</legend>
        <p class="form-note">${uiText("goals.event-forms-agreement.specify-affected-requirement-event-action")}</p>
        ${requirements || `<p class="form-note">${uiText("goals.event-forms-agreement.there-no-completion-requirement-yet-can-still-specify")}</p>`}
        <details class="form-disclosure"><summary>${uiText("goals.event-forms-agreement.link-specific-event-action-optional")}</summary><label><span>${uiText("goals.event-forms-agreement.related-event-id")}</span><input name="event_ids" placeholder="gevt-…"></label>
        <label><span>${uiText("goals.event-forms-agreement.related-action-optional")}</span><input name="scope_action" placeholder="${uiText("goals.event-forms-agreement.example-complete-finish-goal-agreed-action-name")}"></label></details>
      </fieldset>
      ${decisions}
      <label class="check-row" data-concern-new><input type="checkbox" name="blocks_closure" checked><span>${uiText("goals.event-forms-agreement.blocks-completion")}</span></label></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${uiText("goals.event-forms-agreement.cancel")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${uiText("goals.event-forms-agreement.save-issue")}</button></footer></div>
    </form>`;
  }

  function renderClosureForm(state: GoalEventStateView): string {
    return `<form class="event-form mw-form" data-event-form="closure" hidden>
      <header class="event-form-heading"><h2>${uiText("goals.event-forms-agreement.explicit-close-out")}</h2></header>
      <div class="event-form-body"><label><span>${uiText("goals.event-forms-agreement.conclusion")}</span><select name="kind"><option value="complete">${uiText("goals.event-forms-agreement.done")}</option><option value="cancel">${uiText("goals.event-forms-agreement.cancel")}</option></select></label>
      <label><span>${uiText("goals.event-forms-agreement.result-notes")}</span><textarea name="result" rows="2"></textarea></label><fieldset class="closure-deliverables" data-closure-deliverables><legend>${uiText("goals.event-forms-agreement.deliverable")}</legend><p class="form-note">${uiText("goals.event-forms-agreement.choose-versions-results-library-pin-version-goal-s")}</p><div data-closure-deliverable-list></div><p class="form-note" data-deliverable-read-status role="status" hidden></p><button type="button" class="mw-btn mw-btn--secondary" data-reconcile-deliverables hidden>${uiText("goals.event-forms-agreement.check-deliverables")}</button></fieldset>
      <label><span>${uiText("goals.event-forms-agreement.reason")}</span><textarea name="reason" rows="3" required></textarea></label>
      <input type="hidden" name="expected_config_version" value="${state.config.version}">
      <input type="hidden" name="expected_agreement_version" value="${state.agreement.version}">
      <p class="form-note">${uiText("goals.event-forms-agreement.if-agreement-has-changed-stops-so-can-compare")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${uiText("goals.event-forms-agreement.cancel")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${uiText("goals.event-forms-agreement.submit-close-out")}</button></footer></div>
    </form>`;
  }

  function renderAgreementForm(state: GoalEventStateView): string {
    return `<form class="event-form mw-form" data-event-form="agreement" hidden>
      <header class="event-form-heading"><h2>${uiText("goals.event-forms-agreement.change-current-agreement")}</h2></header>
      <div class="event-form-body"><label><span>${uiText("goals.event-forms-agreement.expected-result")}</span><textarea name="outcome" rows="3" required>${escapeHtml(state.agreement.outcome)}</textarea></label>
      <p class="form-note">${uiText("goals.event-forms-agreement.requirements-changed-in-requirement-column")}</p>
      <input type="hidden" name="expected_config_version" value="${state.config.version}">
      <input type="hidden" name="expected_agreement_version" value="${state.agreement.version}">
      <p class="form-note">${uiText("goals.event-forms-agreement.checks-both-agreement-version-configuration-version-changing-exi")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${uiText("goals.event-forms-agreement.cancel")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${uiText("goals.event-forms-agreement.save-agreement")}</button></footer></div>
    </form>`;
  }

  return {
    renderConcernForm,
    renderDecisionForm,
    renderClosureForm,
    renderAgreementForm,
  };
}
