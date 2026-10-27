import type { GoalEventStateView, GoalEventTypeDefinition } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import type { GoalEventDocumentView } from "./event-document-model.js";
import type { EventFormShared } from "./event-forms-shared.js";

/** 时间线上一笔记录的表单：汇报、备注、进展、续接、采用、规划；由 createEventDocumentForms 组合。 */
export function createRecordForms(primitives: GoalsDocumentUiPrimitives, shared: EventFormShared) {
  const { translate: L, escapeHtml } = primitives;
  const { fieldError } = shared;
  function renderReportForm(doc: GoalEventDocumentView, type: GoalEventTypeDefinition): string {
    const fields = type.fields.map((field) => {
      const input = field.format === "longtext"
        ? `<textarea id="report-field-${escapeHtml(field.field_id)}" data-report-field name="${escapeHtml(field.field_id)}" rows="4"${field.required ? " required" : ""}></textarea>`
        : `<input id="report-field-${escapeHtml(field.field_id)}" data-report-field name="${escapeHtml(field.field_id)}" type="text"${field.required ? " required" : ""}>`;
      return `<label><span>${escapeHtml(field.name)}${field.required ? L("（必填）") : L("（可选）")}</span><small>${escapeHtml(field.purpose)}</small>${input}${fieldError(field.field_id)}</label>`;
    }).join("");
    const bound = doc.state.requirements.filter((item) => item.bound_type_ids.includes(type.type_id));
    const judgments = bound.length
      ? `<label><span>${L("关联完成要求")}</span><select data-judgment-requirement name="judgment_requirement_id"><option value="">${L("只记录，不作完成判断")}</option>${
        bound.map((item) => `<option value="${escapeHtml(item.requirement_id)}">${escapeHtml(item.statement)}</option>`).join("")
      }</select></label>
        <label data-judgment-row hidden><span>${L("对这项要求的判断")}</span><select data-judgment-verdict name="judgment_verdict" disabled><option value="">${L("默认只记录")}</option><option value="supports">${L("报告支持")}</option><option value="unknown">${L("仍无法判断")}</option><option value="contradicts">${L("尚未达到")}</option></select><small>${L("支持只表示报告者的判断，不是独立验收。")}</small></label>`
      : `<p class="form-note">${L("这个类型还没有绑定完成要求。保存只记录事实。")}</p>`;
    return `<form class="event-form mw-form" data-event-form="report" data-type-id="${escapeHtml(type.type_id)}" data-type-version="${type.version}" hidden>
      <header class="event-form-heading"><button type="button" class="mw-btn mw-btn--link" data-event-reader="planning">${L("返回记录模板")}</button><h2>${escapeHtml(type.name)}</h2>
      <p class="form-lead">${escapeHtml(type.purpose)}</p></header>
      <div class="event-form-body"><label><span>${L("一句话标题")}</span><input data-event-title name="event_title" required maxlength="200">${fieldError("event_title")}</label>
      ${fields}
      ${judgments}

      <p class="event-form-help">${L("失败会保留你刚填的内容，可原样重试。")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("保存记录")}</button></footer></div>
    </form>`;
  }

  function renderPlanning(doc: GoalEventDocumentView, owned = true): string {
    const adopted = doc.state.config.adopted_planning;
    const source = adopted.length
      ? adopted.map((item) => `${item.source} · ${item.method_id} v${item.version}`).join("；")
      : L("未采用模板。这是空白起点，不会暗中补选默认规划。");
    const types = doc.types.length
      ? `<ul class="planning-types">${doc.types.map((type) => `<li><div><strong>${escapeHtml(type.name)}</strong><small>${escapeHtml(type.purpose)} · v${type.version}</small></div>${owned ? `<span><button type="button" class="mw-btn mw-btn--secondary" data-event-report="${escapeHtml(type.type_id)}">${L("记录")}</button><button type="button" class="mw-btn mw-btn--link" data-event-form-open="type-edit" data-type-id="${escapeHtml(type.type_id)}">${L("改这一版")}</button></span>` : ""}</li>`).join("")}</ul>`
      : `<p class="form-note">${owned ? L("还没有可记录的事件类型。") : L("没有可记录的事件类型。")}</p>`;
    return `<div class="event-reader-panel" data-event-panel="planning">
      <p class="reader-lead">${escapeHtml(source)}</p>
      <h3>${L("可记录类型")}</h3>
      ${types}
      ${owned ? `<div class="event-actions">
        <button type="button" class="mw-btn mw-btn--secondary" data-event-reader="type">${L("新增事件类型")}</button>
        <button type="button" class="mw-btn mw-btn--secondary" data-event-form-open="adopt">${L("采用规划方法")}</button>
        ${doc.transfer.kind === "resume_cancelled" || doc.transfer.kind === "reopen_event_completed"
          ? `<button type="button" class="mw-btn mw-btn--primary" data-event-form-open="resume">${doc.transfer.kind === "resume_cancelled" ? L("显式继续") : L("继续此目标")}</button>` : ""}
      </div>` : ""}
    </div>`;
  }

  function renderProgressForm(state: GoalEventStateView): string {
    return `<form class="event-form mw-form" data-event-form="progress" hidden>
      <header class="event-form-heading"><h2>${L("同步进展")}</h2>
      <p class="form-lead">${L("更新 Goal 信息中的当前进展，并把这次更新留在时间线。")}</p></header>
      <div class="event-form-body"><label><span>${L("现在做到哪了")}</span><textarea name="summary" rows="4" required></textarea></label>
      <label><span>${L("下一步（可选）")}</span><input name="next_step"></label>
      <label><span>${L("谁来做（可选）")}</span><input name="next_actor"></label>
      <input type="hidden" name="based_on_cursor" value="${state.goal_event_cursor}"></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("保存进展")}</button></footer></div>
    </form>`;
  }

  function renderResumeForm(doc: GoalEventDocumentView): string {
    if (doc.transfer.kind !== "resume_cancelled" && doc.transfer.kind !== "reopen_event_completed") return "";
    const completed = doc.transfer.kind === "reopen_event_completed";
    return `<form class="event-form mw-form" data-event-form="resume" hidden>
      <header class="event-form-heading"><h2>${completed ? L("继续此目标") : L("继续已取消的目标")}</h2>
      <p class="form-lead">${completed ? L("原完成事实和来源会保留。明确继续后开启新一轮工作。") : L("不会被普通记录自动恢复。")}</p></header>
      <div class="event-form-body"><label><span>${L("理由")}</span><textarea name="reason" rows="3" required></textarea></label></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("显式继续")}</button></footer></div>
    </form>`;
  }

  function renderAdoptForm(doc: GoalEventDocumentView): string {
    const methods = doc.planning_methods.filter((item) => item.enabled !== false);
    const options = methods.map((item) => `<option value="${escapeHtml(item.method_id)}" data-version="${item.version}" data-source="${item.scope === "project" ? "project" : item.scope === "personal" ? "personal" : "built_in"}">${escapeHtml(item.name)} · ${escapeHtml(item.scope)} v${item.version}</option>`).join("");
    const defaults = methods.flatMap((item) => item.default_requirements.map((req) => `<label class="check-row" data-adopt-method="${escapeHtml(item.method_id)}"${item.method_id === methods[0]?.method_id ? '' : ' hidden'}><input type="checkbox" name="adopt_default_requirement_ids" value="${escapeHtml(req.requirement_id)}"><span>${escapeHtml(item.name)} · ${escapeHtml(req.statement)}</span></label>`)).join("");
    return `<form class="event-form mw-form" data-event-form="adopt" data-config-version="${doc.state.config.version}" data-agreement-version="${doc.state.agreement.version}" hidden>
      <header class="event-form-heading"><button type="button" class="mw-btn mw-btn--link" data-event-reader="planning">${L("返回记录模板")}</button><h2>${L("采用规划方法")}</h2>
      <p class="form-lead">${L("只作用于当前 Goal。空白起点不会暗中补选。启用完成要求是分开的选择。")}</p></header>
      <div class="event-form-body"><label><span>${L("方法")}</span><select name="method_id">${options || `<option value="">${L("当前没有可选用的方法")}</option>`}</select></label>
      ${defaults ? `<fieldset><legend>${L("同时采用完成要求（可选）")}</legend>${defaults}<p class="form-note" data-adopt-empty${methods[0]?.default_requirements.length ? ' hidden' : ''}>${L("这个规划没有预设完成要求。")}</p></fieldset>` : ""}</div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit"${methods.length ? '' : ' disabled'}>${L("采用到当前 Goal")}</button></footer></div>
    </form>`;
  }

  function renderNoteForm(doc?: GoalEventDocumentView | null): string {
    return `<form class="event-form mw-form" data-event-form="note" hidden>
      <header class="event-form-heading"><h2>${L("随手备注")}</h2>
      <p class="form-lead">${L("只在时间线留下一笔。要让 AI 继续工作，请到 Runtime 中发送指令。")}</p></header>
      <div class="event-form-body">${doc?.types.length ? `<details class="record-templates"><summary>${L("使用记录模板")}</summary><div class="event-actions">${doc.types.map((type) => `<button type="button" class="mw-btn mw-btn--secondary" data-event-report="${escapeHtml(type.type_id)}">${escapeHtml(type.name)}</button>`).join("")}</div></details>` : ""}
      <label for="event-note">${L("备注")}</label>
      <textarea id="event-note" name="note" rows="3" maxlength="5000" required placeholder="${L("补充事实、想法，或说说你希望调整什么…")}"></textarea>
      <p class="event-form-help">${L("保存到时间线，不会发送给 AI，也不会更改完成要求。")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("保存记录")}</button></footer></div>
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
