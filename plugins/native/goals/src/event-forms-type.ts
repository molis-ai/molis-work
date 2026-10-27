import type { GoalEventFieldDefinition } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import type { GoalEventDocumentView } from "./event-document-model.js";
import type { EventFormShared } from "./event-forms-shared.js";

/** 字段、记录类型的新建与编辑表单；由 createEventDocumentForms 组合。 */
export function createTypeForms(primitives: GoalsDocumentUiPrimitives, shared: EventFormShared) {
  const { translate: L, escapeHtml } = primitives;
  const { fieldError, newToken } = shared;
  function renderFieldRow(field?: Pick<GoalEventFieldDefinition, "field_id" | "name" | "purpose" | "format" | "required">): string {
    const id = field?.field_id || newToken("field");
    return `<div class="type-field-row">
      <input type="hidden" name="field_id" value="${escapeHtml(id)}">
      <label><span>${L("字段名")}</span><input name="field_name" required value="${escapeHtml(field?.name ?? L("内容"))}"></label>
      <label><span>${L("说明")}</span><input name="field_purpose" required value="${escapeHtml(field?.purpose ?? L("记录原文"))}"></label>
      <div class="type-field-tools">
        <label><span>${L("内容形式")}</span><select name="field_format"><option value="text"${field?.format === "text" ? " selected" : ""}>${L("短文本")}</option><option value="longtext"${!field || field.format === "longtext" ? " selected" : ""}>${L("长文本")}</option></select></label>
        <label class="check-row"><input type="checkbox" name="field_required"${field?.required !== false ? " checked" : ""}><span>${L("必填")}</span></label>
        <button type="button" class="mw-btn mw-btn--link" data-remove-type-field>${L("移除")}</button>
      </div>
    </div>`;
  }

  function renderTypeForm(doc: GoalEventDocumentView): string {
    return `<form class="event-form mw-form" data-event-form="type" data-config-version="${doc.state.config.version}" data-agreement-version="${doc.state.agreement.version}" hidden>
      <header class="event-form-heading"><button type="button" class="mw-btn mw-btn--link" data-event-reader="planning">${L("返回记录模板")}</button><h2>${L("新增事件类型")}</h2>
      <p class="form-lead">${L("只作用于当前 Goal。登记类型不会自动启用完成要求。标识会自动生成，已有记录的标识不会改。")}</p></header>
      <div class="event-form-body"><input type="hidden" name="type_id" value="${newToken("type")}">
      <label><span>${L("名称")}</span><input name="name" required>${fieldError("name")}</label>
      <label><span>${L("用途")}</span><textarea name="purpose" rows="2" required></textarea>${fieldError("purpose")}</label>
      <label><span>${L("通用分类")}</span><select name="semantic_family"><option value="">${L("不分类")}</option><option value="progress">${L("进展")}</option><option value="delivery">${L("交付")}</option><option value="verification">${L("验证")}</option><option value="concern">${L("问题与风险")}</option><option value="observation">${L("观察")}</option><option value="custom">${L("自定义")}</option></select></label>
      <div data-type-fields>${renderFieldRow()}</div>
      <button type="button" class="mw-btn mw-btn--secondary" data-add-type-field>${L("增加字段")}</button>
      <label class="check-row"><input type="checkbox" name="add_requirement"><span>${L("同时增加一条完成要求（分开的选择，不会因为有类型就启用）")}</span></label>
      <label data-new-requirement hidden><span>${L("完成要求")}</span><textarea name="requirement_statement" rows="2"></textarea>
        <input type="hidden" name="new_requirement_id" value="${newToken("req")}"></label>

      <p class="event-form-help">${L("至少保留一个字段。")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("登记到当前 Goal")}</button></footer></div>
    </form>`;
  }

  function renderTypeEditForms(doc: GoalEventDocumentView): string {
    return doc.types.map((type) => `<form class="event-form mw-form" data-event-form="type-edit" data-type-id="${escapeHtml(type.type_id)}" data-config-version="${doc.state.config.version}" hidden>
      <header class="event-form-heading"><button type="button" class="mw-btn mw-btn--link" data-event-reader="planning">${L("返回记录模板")}</button><h2>${L("登记新版本")} · ${escapeHtml(type.name)}</h2>
      <p class="form-lead">${L("历史事件仍按当时版本阅读。新报告使用 v{version}。", { version: type.version + 1 })}</p></header>
      <div class="event-form-body"><input type="hidden" name="type_id" value="${escapeHtml(type.type_id)}">
      <input type="hidden" name="version" value="${type.version + 1}">
      <input type="hidden" name="semantic_family" value="${escapeHtml(type.semantic_family ?? "")}">
      <label><span>${L("名称")}</span><input name="name" required value="${escapeHtml(type.name)}"></label>
      <label><span>${L("用途")}</span><textarea name="purpose" rows="2" required>${escapeHtml(type.purpose)}</textarea></label>
      <div data-type-fields>${type.fields.map((field) => renderFieldRow(field)).join("")}</div>
      <button type="button" class="mw-btn mw-btn--secondary" data-add-type-field>${L("增加字段")}</button></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("保存新版本")}</button></footer></div>
    </form>`).join("");
  }

  return {
    renderTypeForm,
    renderTypeEditForms,
  };
}
