import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalEventFieldDefinition } from "./contract/goals.js";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import type { GoalEventDocumentView } from "./event-document-model.js";
import type { EventFormShared } from "./event-forms-shared.js";

/** 字段、记录类型的新建与编辑表单；由 createEventDocumentForms 组合。 */
export function createTypeForms(primitives: GoalsDocumentUiPrimitives, shared: EventFormShared) {
  const { escapeHtml } = primitives;
  const { fieldError, newToken } = shared;
  function renderFieldRow(field?: Pick<GoalEventFieldDefinition, "field_id" | "name" | "purpose" | "format" | "required">): string {
    const id = field?.field_id || newToken("field");
    return `<div class="type-field-row">
      <input type="hidden" name="field_id" value="${escapeHtml(id)}">
      <label><span>${uiText("goals.event-forms-type.field-name")}</span><input name="field_name" required value="${escapeHtml(field?.name ?? uiText.text("goals.event-forms-type.content"))}"></label>
      <label><span>${uiText("goals.event-forms-type.description")}</span><input name="field_purpose" required value="${escapeHtml(field?.purpose ?? uiText.text("goals.event-forms-type.record-original-text"))}"></label>
      <div class="type-field-tools">
        <label><span>${uiText("goals.event-forms-type.content-form")}</span><select name="field_format"><option value="text"${field?.format === "text" ? " selected" : ""}>${uiText("goals.event-forms-type.short-text")}</option><option value="longtext"${!field || field.format === "longtext" ? " selected" : ""}>${uiText("goals.event-forms-type.long-text")}</option></select></label>
        <label class="check-row"><input type="checkbox" name="field_required"${field?.required !== false ? " checked" : ""}><span>${uiText("goals.event-forms-type.required")}</span></label>
        <button type="button" class="mw-btn mw-btn--link" data-remove-type-field>${uiText("goals.event-forms-type.remove")}</button>
      </div>
    </div>`;
  }

  function renderTypeForm(doc: GoalEventDocumentView): string {
    return `<form class="event-form mw-form" data-event-form="type" data-config-version="${doc.state.config.version}" data-agreement-version="${doc.state.agreement.version}" hidden>
      <header class="event-form-heading"><button type="button" class="mw-btn mw-btn--link" data-event-reader="planning">${uiText("goals.event-forms-type.back-record-templates")}</button><h2>${uiText("goals.event-forms-type.new-event-type")}</h2>
      <p class="form-lead">${uiText("goals.event-forms-type.applies-only-current-goal-registering-type-does-not")}</p></header>
      <div class="event-form-body"><input type="hidden" name="type_id" value="${newToken("type")}">
      <label><span>${uiText("goals.event-forms-type.name")}</span><input name="name" required>${fieldError("name")}</label>
      <label><span>${uiText("goals.event-forms-type.purpose")}</span><textarea name="purpose" rows="2" required></textarea>${fieldError("purpose")}</label>
      <label><span>${uiText("goals.event-forms-type.general-category")}</span><select name="semantic_family"><option value="">${uiText("goals.event-forms-type.no-category")}</option><option value="progress">${uiText("goals.event-forms-type.progress")}</option><option value="delivery">${uiText("goals.event-forms-type.delivery")}</option><option value="verification">${uiText("goals.event-forms-type.verify")}</option><option value="concern">${uiText("goals.event-forms-type.issues-risks")}</option><option value="observation">${uiText("goals.event-forms-type.observe")}</option><option value="custom">${uiText("goals.event-forms-type.custom")}</option></select></label>
      <div data-type-fields>${renderFieldRow()}</div>
      <button type="button" class="mw-btn mw-btn--secondary" data-add-type-field>${uiText("goals.event-forms-type.add-field")}</button>
      <label class="check-row"><input type="checkbox" name="add_requirement"><span>${uiText("goals.event-forms-type.also-add-completion-requirement-separate-choice-having-type")}</span></label>
      <label data-new-requirement hidden><span>${uiText("goals.event-forms-type.completion-requirement")}</span><textarea name="requirement_statement" rows="2"></textarea>
        <input type="hidden" name="new_requirement_id" value="${newToken("req")}"></label>

      <p class="event-form-help">${uiText("goals.event-forms-type.keep-least-one-field")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${uiText("goals.event-forms-type.cancel")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${uiText("goals.event-forms-type.register-current-goal")}</button></footer></div>
    </form>`;
  }

  function renderTypeEditForms(doc: GoalEventDocumentView): string {
    return doc.types.map((type) => `<form class="event-form mw-form" data-event-form="type-edit" data-type-id="${escapeHtml(type.type_id)}" data-config-version="${doc.state.config.version}" hidden>
      <header class="event-form-heading"><button type="button" class="mw-btn mw-btn--link" data-event-reader="planning">${uiText("goals.event-forms-type.back-record-templates")}</button><h2>${uiText("goals.event-forms-type.register-new-version")} · ${escapeHtml(type.name)}</h2>
      <p class="form-lead">${uiText("goals.event-forms-type.historical-events-stay-version-that-time-new-reports", { version: type.version + 1 })}</p></header>
      <div class="event-form-body"><input type="hidden" name="type_id" value="${escapeHtml(type.type_id)}">
      <input type="hidden" name="version" value="${type.version + 1}">
      <input type="hidden" name="semantic_family" value="${escapeHtml(type.semantic_family ?? "")}">
      <label><span>${uiText("goals.event-forms-type.name")}</span><input name="name" required value="${escapeHtml(type.name)}"></label>
      <label><span>${uiText("goals.event-forms-type.purpose")}</span><textarea name="purpose" rows="2" required>${escapeHtml(type.purpose)}</textarea></label>
      <div data-type-fields>${type.fields.map((field) => renderFieldRow(field)).join("")}</div>
      <button type="button" class="mw-btn mw-btn--secondary" data-add-type-field>${uiText("goals.event-forms-type.add-field")}</button></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${uiText("goals.event-forms-type.cancel")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${uiText("goals.event-forms-type.save-new-revision")}</button></footer></div>
    </form>`).join("");
  }

  return {
    renderTypeForm,
    renderTypeEditForms,
  };
}
