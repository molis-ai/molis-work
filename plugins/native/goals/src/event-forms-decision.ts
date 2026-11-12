import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalEventStateView } from "./contract/goals.js";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";

/** The user decision and its exact agreement-change comparison; the agreement form factory keeps the same public return. */
export function createDecisionForm(primitives: GoalsDocumentUiPrimitives) {
  const { escapeHtml } = primitives;
  function renderDecisionForm(state: GoalEventStateView): string {
    const pending = state.pending_decisions[0];
    const agreementChange = pending?.purpose === "agreement_change";
    const expired = Boolean(agreementChange && pending && agreementChangeRequestExpired(pending, state));
    const requirements = state.requirements.map((item) => `<label class="check-row"><input type="checkbox" name="requirement_ids" value="${escapeHtml(item.requirement_id)}"><span>${escapeHtml(item.statement)}</span></label>`).join("");
    const concerns = state.concerns.filter((item) => item.status === "open").map((item) => `<label class="check-row"><input type="checkbox" name="concern_ids" value="${escapeHtml(item.concern_id)}"><span>${escapeHtml(item.title)}</span></label>`).join("");
    const options = pending && !agreementChange
      ? `<fieldset><legend>${uiText("goals.event-forms-decision.option")}</legend>${pending.options.map((option) => `<label class="check-row"><input type="radio" name="selected_option_id" value="${escapeHtml(option.option_id)}"><span><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.impact)}</small></span></label>`).join("")}</fieldset>`
      : pending && agreementChange
        ? `<div class="form-note"><strong>${uiText("goals.event-forms-decision.business-options-request-context-not-approve-reject")}</strong><ul>${pending.options.map((option) => `<li><strong>${escapeHtml(option.label)}</strong> · ${escapeHtml(option.impact)}</li>`).join("")}</ul></div>`
        : "";
    const pendingAction = pending?.scope.action?.trim() || "";
    const effects = agreementChange
      ? `<fieldset><legend>${uiText("goals.event-forms-decision.agreement-change")}</legend>
        <p class="form-note">${uiText("goals.event-forms-decision.must-choose-approve-reject-business-options-above-not")}</p>
        <label class="check-row"><input type="radio" name="agreement_change_decision" value="authorize" required><span>${uiText("goals.event-forms-decision.approve-agreement-change")}</span></label>
        <label class="check-row"><input type="radio" name="agreement_change_decision" value="deny" required><span>${uiText("goals.event-forms-decision.reject-agreement-change")}</span></label>
      </fieldset>`
      : `<fieldset><legend>${uiText("goals.event-forms-decision.effect")}</legend>
        <label class="check-row"><input type="checkbox" name="effect" value="accept_requirements"><span>${uiText("goals.event-forms-decision.accept-these-requirements")}</span></label>
        <label class="check-row"><input type="checkbox" name="effect" value="reject_requirements"><span>${uiText("goals.event-forms-decision.reject-these-requirements")}</span></label>
        <label class="check-row"><input type="checkbox" name="effect" value="accept_concerns"><span>${uiText("goals.event-forms-decision.accept-these-risks")}</span></label>
        <label class="check-row"><input type="checkbox" name="effect" value="reject_concerns"><span>${uiText("goals.event-forms-decision.reject-these-issues")}</span></label>
        <label class="check-row"><input type="checkbox" name="effect" value="authorize_action"><span>${uiText("goals.event-forms-decision.authorize-action")}${pendingAction ? uiText.text("common.punctuation.in-parens", { value: escapeHtml(pendingAction) }) : ""}</span></label>
        <label class="check-row"><input type="checkbox" name="effect" value="deny_action"><span>${uiText("goals.event-forms-decision.reject-action")}</span></label>
      </fieldset>
      <fieldset><legend>${uiText("goals.event-forms-decision.requirement-scope")}</legend>${requirements || `<p class="form-note">${uiText("goals.event-forms-decision.there-no-requirements-yet")}</p>`}</fieldset>
      <fieldset><legend>${uiText("goals.event-forms-decision.issue-scope")}</legend>${concerns || `<p class="form-note">${uiText("goals.event-forms-decision.no-issues-currently-need-attention")}</p>`}</fieldset>
      ${pendingAction
        ? `<input type="hidden" name="action" value="${escapeHtml(pendingAction)}"><p class="form-note">${uiText("goals.event-forms-decision.pending-action")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(pendingAction)}</p>`
        : `<label><span>${uiText("goals.event-forms-decision.related-action-fill-when-authorizing-rejecting-not-inferred")}</span><input name="action" placeholder="complete"></label>`}`;
    return `<form class="event-form mw-form" data-event-form="decision" data-pending-action="${escapeHtml(pendingAction)}" hidden>
      <header class="event-form-heading"><h2>${uiText("goals.event-forms-decision.user-decision")}</h2></header>
      <div class="event-form-body">${pending ? `<p class="reader-lead">${escapeHtml(pending.question)}</p><input type="hidden" name="request_id" value="${escapeHtml(pending.request_id)}">` : `<label><span>${uiText("goals.event-forms-decision.conclusion")}</span><textarea name="conclusion" rows="3" required></textarea></label>`}
      ${options}
      ${pending?.proposed_change ? renderProposedChange(pending, state) : ""}
      ${expired ? `<p class="form-note">${uiText("goals.event-forms-decision.result-requirement-request-was-based-has-changed-so")}</p>` : ""}
      ${effects}
      ${pending ? `<label><span>${uiText("goals.event-forms-decision.conclusion")}</span><textarea name="conclusion" rows="2" required></textarea></label>` : ""}
      <p class="form-note">${uiText("goals.event-forms-decision.effect-scope-come-choices-here-approval-not-inferred")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${uiText("goals.event-forms-decision.cancel")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${uiText("goals.event-forms-decision.record-decision")}</button></footer></div>
    </form>`;
  }

  function agreementChangeRequestExpired(
    pending: GoalEventStateView["pending_decisions"][number],
    state: GoalEventStateView,
  ): boolean {
    if (!pending.commitment) return true;
    if (pending.commitment.outcome !== state.agreement.outcome) return true;
    const recordedIds = new Set(pending.commitment.requirements.map((item) => item.requirement_id));
    for (const item of pending.commitment.requirements) {
      const current = state.requirements.find((row) => row.requirement_id === item.requirement_id);
      if (!current) return true;
      if (current.statement !== item.statement) return true;
      if (current.human_decision_required !== item.human_decision_required) return true;
      if ([...current.bound_type_ids].sort().join("\0") !== [...item.bound_type_ids].sort().join("\0")) return true;
    }
    if (pending.proposed_change?.outcome && state.requirements.some((item) => !recordedIds.has(item.requirement_id))) {
      return true;
    }
    return false;
  }

  function renderProposedChange(
    pending: GoalEventStateView["pending_decisions"][number],
    state: GoalEventStateView,
  ): string {
    const change = pending.proposed_change;
    if (!change) return "";
    const byId = new Map((pending.commitment?.requirements ?? []).map((item) => [item.requirement_id, item]));
    const parts: string[] = [];
    if (change.outcome) {
      const from = pending.commitment?.outcome || state.agreement.outcome;
      parts.push(`${uiText.text("goals.event-forms-decision.original-result")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(from)} → ${uiText.text("goals.event-forms-decision.proposed-result-change")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(change.outcome)}`);
    }
    for (const item of change.new_requirements ?? []) parts.push(`${uiText.text("goals.event-forms-decision.new-requirement")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(item.statement)}`);
    for (const item of change.revise_requirements ?? []) {
      const previous = byId.get(item.requirement_id);
      const from = previous?.statement || item.requirement_id;
      if (item.statement) {
        parts.push(`${uiText.text("goals.event-forms-decision.original-requirement")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(from)} → ${uiText.text("goals.event-forms-decision.proposed-requirement-change")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(item.statement)}`);
      }
      if (item.human_decision_required === false) {
        parts.push(`${uiText.text("goals.event-forms-decision.cancel-human-acceptance")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(from)}`);
      }
      if (item.human_decision_required === true) {
        parts.push(`${uiText.text("goals.event-forms-decision.change-requiring-user-acceptance")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(from)}`);
      }
    }
    for (const id of change.retire_requirement_ids ?? []) {
      const previous = byId.get(id);
      parts.push(`${uiText.text("goals.event-forms-decision.retire-requirement")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(previous?.statement || id)}`);
    }
    return `<div class="reader-lead"><strong>${uiText("goals.event-forms-decision.agreement-change-2")}</strong><ul>${parts.map((part) => `<li>${part}</li>`).join("")}</ul></div>`;
  }

  return renderDecisionForm;
}
