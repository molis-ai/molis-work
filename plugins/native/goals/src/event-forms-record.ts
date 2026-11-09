import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalEventStateView, GoalEventTypeDefinition } from "./contract/goals.js";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import type { GoalEventDocumentView } from "./event-document-model.js";
import type { EventFormShared } from "./event-forms-shared.js";

/** 时间线上一笔记录的表单：汇报、备注、进展、续接、采用、规划；由 createEventDocumentForms 组合。 */
export function createRecordForms(primitives: GoalsDocumentUiPrimitives, shared: EventFormShared) {
  const { escapeHtml } = primitives;
  const { fieldError } = shared;
  function renderReportForm(doc: GoalEventDocumentView, type: GoalEventTypeDefinition): string {
    const fields = type.fields.map((field) => {
      const input = field.format === "longtext"
        ? `<textarea id="report-field-${escapeHtml(field.field_id)}" data-report-field name="${escapeHtml(field.field_id)}" rows="4"${field.required ? " required" : ""}></textarea>`
        : `<input id="report-field-${escapeHtml(field.field_id)}" data-report-field name="${escapeHtml(field.field_id)}" type="text"${field.required ? " required" : ""}>`;
      return `<label><span>${escapeHtml(field.name)}${field.required ? uiText("goals.event-forms-record.required") : uiText("goals.event-forms-record.optional")}</span><small>${escapeHtml(field.purpose)}</small>${input}${fieldError(field.field_id)}</label>`;
    }).join("");
    const bound = doc.state.requirements.filter((item) => item.bound_type_ids.includes(type.type_id));
    const judgments = bound.length
      ? `<label><span>${uiText("goals.event-forms-record.linked-completion-requirement")}</span><select data-judgment-requirement name="judgment_requirement_id"><option value="">${uiText("goals.event-forms-record.record-only-do-not-judge-completion")}</option>${
        bound.map((item) => `<option value="${escapeHtml(item.requirement_id)}">${escapeHtml(item.statement)}</option>`).join("")
      }</select></label>
        <label data-judgment-row hidden><span>${uiText("goals.event-forms-record.judgment-requirement")}</span><select data-judgment-verdict name="judgment_verdict" disabled><option value="">${uiText("goals.event-forms-record.record-only-default")}</option><option value="supports">${uiText("goals.event-forms-record.report-supports")}</option><option value="unknown">${uiText("goals.event-forms-record.still-cannot-decide")}</option><option value="contradicts">${uiText("goals.event-forms-record.not-yet-met")}</option></select><small>${uiText("goals.event-forms-record.support-only-means-reporter-s-judgment-not-independent")}</small></label>`
      : `<p class="form-note">${uiText("goals.event-forms-record.type-not-bound-completion-requirement-saving-only-records")}</p>`;
    return `<form class="event-form mw-form" data-event-form="report" data-type-id="${escapeHtml(type.type_id)}" data-type-version="${type.version}" hidden>
      <header class="event-form-heading"><button type="button" class="mw-btn mw-btn--link" data-event-reader="planning">${uiText("goals.event-forms-record.back-record-templates")}</button><h2>${escapeHtml(type.name)}</h2>
      <p class="form-lead">${escapeHtml(type.purpose)}</p></header>
      <div class="event-form-body"><label><span>${uiText("goals.event-forms-record.one-line-title")}</span><input data-event-title name="event_title" required maxlength="200">${fieldError("event_title")}</label>
      ${fields}
      ${judgments}

      <p class="event-form-help">${uiText("goals.event-forms-record.failure-what-just-entered-kept-so-can-retry")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${uiText("goals.event-forms-record.cancel")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${uiText("goals.event-forms-record.save-record")}</button></footer></div>
    </form>`;
  }

  function renderPlanning(doc: GoalEventDocumentView, owned = true): string {
    const adopted = doc.state.config.adopted_planning;
    const source = adopted.length
      ? adopted.map((item) => `${item.source} · ${item.method_id} v${item.version}`).join("；")
      : uiText.text("goals.event-forms-record.no-template-used-blank-start-does-not-silently");
    const types = doc.types.length
      ? `<ul class="planning-types">${doc.types.map((type) => `<li><div><strong>${escapeHtml(type.name)}</strong><small>${escapeHtml(type.purpose)} · v${type.version}</small></div>${owned ? `<span><button type="button" class="mw-btn mw-btn--secondary" data-event-report="${escapeHtml(type.type_id)}">${uiText("goals.event-forms-record.capture")}</button><button type="button" class="mw-btn mw-btn--link" data-event-form-open="type-edit" data-type-id="${escapeHtml(type.type_id)}">${uiText("goals.event-forms-record.change-version")}</button></span>` : ""}</li>`).join("")}</ul>`
      : `<p class="form-note">${owned ? uiText("goals.event-forms-record.there-no-event-type-record-yet") : uiText("goals.event-forms-record.no-event-types-available")}</p>`;
    return `<div class="event-reader-panel" data-event-panel="planning">
      <p class="reader-lead">${escapeHtml(source)}</p>
      <h3>${uiText("goals.event-forms-record.recordable-types")}</h3>
      ${types}
      ${owned ? `<div class="event-actions">
        <button type="button" class="mw-btn mw-btn--secondary" data-event-reader="type">${uiText("goals.event-forms-record.new-event-type")}</button>
        <button type="button" class="mw-btn mw-btn--secondary" data-event-form-open="adopt">${uiText("goals.event-forms-record.adopt-planning-method")}</button>
        ${doc.transfer.kind === "resume_cancelled" || doc.transfer.kind === "reopen_event_completed"
          ? `<button type="button" class="mw-btn mw-btn--primary" data-event-form-open="resume">${doc.transfer.kind === "resume_cancelled" ? uiText("goals.event-forms-record.resume-explicitly") : uiText("goals.event-forms-record.continue-goal")}</button>` : ""}
      </div>` : ""}
    </div>`;
  }

  function renderProgressForm(state: GoalEventStateView): string {
    return `<form class="event-form mw-form" data-event-form="progress" hidden>
      <header class="event-form-heading"><h2>${uiText("goals.event-forms-record.progress-update")}</h2>
      <p class="form-lead">${uiText("goals.event-forms-record.update-progress-shown-goal-info-save-update-timeline")}</p></header>
      <div class="event-form-body"><label><span>${uiText("goals.event-forms-record.where-things-stand")}</span><textarea name="summary" rows="4" required></textarea></label>
      <label><span>${uiText("goals.event-forms-record.next-step-optional")}</span><input name="next_step"></label>
      <label><span>${uiText("goals.event-forms-record.who-will-do-optional")}</span><input name="next_actor"></label>
      <input type="hidden" name="based_on_cursor" value="${state.goal_event_cursor}"></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${uiText("goals.event-forms-record.cancel")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${uiText("goals.event-forms-record.save-progress")}</button></footer></div>
    </form>`;
  }

  function renderResumeForm(doc: GoalEventDocumentView): string {
    if (doc.transfer.kind !== "resume_cancelled" && doc.transfer.kind !== "reopen_event_completed") return "";
    const completed = doc.transfer.kind === "reopen_event_completed";
    return `<form class="event-form mw-form" data-event-form="resume" hidden>
      <header class="event-form-heading"><h2>${completed ? uiText("goals.event-forms-record.continue-goal") : uiText("goals.event-forms-record.continue-cancelled-goal")}</h2>
      <p class="form-lead">${completed ? uiText("goals.event-forms-record.original-completion-facts-sources-stay-after-explicit-continue") : uiText("goals.event-forms-record.ordinary-records-will-not-restore-automatically")}</p></header>
      <div class="event-form-body"><label><span>${uiText("goals.event-forms-record.reason")}</span><textarea name="reason" rows="3" required></textarea></label></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${uiText("goals.event-forms-record.cancel")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${uiText("goals.event-forms-record.resume-explicitly")}</button></footer></div>
    </form>`;
  }

  function renderAdoptForm(doc: GoalEventDocumentView): string {
    const methods = doc.planning_methods.filter((item) => item.enabled !== false);
    const options = methods.map((item) => `<option value="${escapeHtml(item.method_id)}" data-version="${item.version}" data-source="${item.scope === "project" ? "project" : item.scope === "personal" ? "personal" : "built_in"}">${escapeHtml(item.name)} · ${escapeHtml(item.scope)} v${item.version}</option>`).join("");
    const defaults = methods.flatMap((item) => item.default_requirements.map((req) => `<label class="check-row" data-adopt-method="${escapeHtml(item.method_id)}"${item.method_id === methods[0]?.method_id ? '' : ' hidden'}><input type="checkbox" name="adopt_default_requirement_ids" value="${escapeHtml(req.requirement_id)}"><span>${escapeHtml(item.name)} · ${escapeHtml(req.statement)}</span></label>`)).join("");
    return `<form class="event-form mw-form" data-event-form="adopt" data-config-version="${doc.state.config.version}" data-agreement-version="${doc.state.agreement.version}" hidden>
      <header class="event-form-heading"><button type="button" class="mw-btn mw-btn--link" data-event-reader="planning">${uiText("goals.event-forms-record.back-record-templates")}</button><h2>${uiText("goals.event-forms-record.adopt-planning-method")}</h2>
      <p class="form-lead">${uiText("goals.event-forms-record.applies-only-current-goal-blank-start-does-not")}</p></header>
      <div class="event-form-body"><label><span>${uiText("goals.event-forms-record.method")}</span><select name="method_id">${options || `<option value="">${uiText("goals.event-forms-record.no-method-available-choose")}</option>`}</select></label>
      ${defaults ? `<fieldset><legend>${uiText("goals.event-forms-record.also-adopt-its-completion-requirements-optional")}</legend>${defaults}<p class="form-note" data-adopt-empty${methods[0]?.default_requirements.length ? ' hidden' : ''}>${uiText("goals.event-forms-record.plan-carries-no-preset-completion-requirements")}</p></fieldset>` : ""}</div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${uiText("goals.event-forms-record.cancel")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit"${methods.length ? '' : ' disabled'}>${uiText("goals.event-forms-record.adopt-into-current-goal")}</button></footer></div>
    </form>`;
  }

  function renderNoteForm(doc?: GoalEventDocumentView | null): string {
    return `<form class="event-form mw-form" data-event-form="note" hidden>
      <header class="event-form-heading"><h2>${uiText("goals.event-forms-record.note")}</h2>
      <p class="form-lead">${uiText("goals.event-forms-record.save-note-timeline-continue-work-ai-send-instructions")}</p></header>
      <div class="event-form-body">${doc?.types.length ? `<details class="record-templates"><summary>${uiText("goals.event-forms-record.use-record-template")}</summary><div class="event-actions">${doc.types.map((type) => `<button type="button" class="mw-btn mw-btn--secondary" data-event-report="${escapeHtml(type.type_id)}">${escapeHtml(type.name)}</button>`).join("")}</div></details>` : ""}
      <label for="event-note">${uiText("goals.event-forms-record.note-2")}</label>
      <textarea id="event-note" name="note" rows="3" maxlength="5000" required placeholder="${uiText("goals.event-forms-record.add-fact-idea-what-want-change")}"></textarea>
      <p class="event-form-help">${uiText("goals.event-forms-record.saves-timeline-does-not-send-message-ai-change")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${uiText("goals.event-forms-record.cancel")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${uiText("goals.event-forms-record.save-record")}</button></footer></div>
    </form>`;
  }

  return {
    renderReportForm,
    renderPlanning,
    renderProgressForm,
    renderResumeForm,
    renderAdoptForm,
    renderNoteForm,
  };
}
