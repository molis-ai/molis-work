import type { GoalEventStateView } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import type { GoalEventDocumentView } from "./event-document-model.js";
import type { EventFormShared } from "./event-forms-shared.js";
import { createDecisionForm } from "./event-forms-decision.js";

/** 约定相关的表单：要求、关切、决定、收尾、约定与拟改变化；由 createEventDocumentForms 组合。 */
export function createAgreementForms(primitives: GoalsDocumentUiPrimitives, shared: EventFormShared) {
  const { translate: L, escapeHtml } = primitives;
  const { newToken } = shared;
  const renderDecisionForm = createDecisionForm(primitives);
  function renderRequirementForm(doc: GoalEventDocumentView): string {
    return `<form class="event-form mw-form" data-event-form="requirement" data-config-version="${doc.state.config.version}" data-agreement-version="${doc.state.agreement.version}" hidden>
      <header class="event-form-heading"><button type="button" class="mw-btn mw-btn--link" data-event-reader="planning">${L("返回记录模板")}</button><h3>${L("增加完成要求")}</h3>
      <p class="form-lead">${L("启用完成要求是单独操作，不会因为登记了类型就自动出现。")}</p></header>
      <div class="event-form-body"><input type="hidden" name="requirement_id" value="${newToken("req")}">
      <label><span>${L("具体结果")}</span><textarea name="statement" rows="2" required></textarea></label>
      <label><span>${L("绑定类型（可选）")}</span><select name="bound_type_id"><option value="">${L("不绑定")}</option>${
        doc.types.map((type) => `<option value="${escapeHtml(type.type_id)}">${escapeHtml(type.name)}</option>`).join("")
      }</select></label>
      <label class="check-row"><input type="checkbox" name="human_decision_required"><span>${L("需要用户验收")}</span></label>
      <p class="form-note">${L("不勾选时，Runtime 报告支持即可参与完成判断。勾选后必须有仍然有效的用户结论。")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("保存要求")}</button></footer></div>
    </form>`;
  }

  function renderConcernForm(state: GoalEventStateView): string {
    const open = state.concerns.filter((item) => item.status === "open");
    const existing = open.length
      ? `<label><span>${L("已有问题")}</span><select name="concern_id"><option value="">${L("记录新问题")}</option>${
        open.map((item) => `<option value="${escapeHtml(item.concern_id)}">${escapeHtml(item.title)}</option>`).join("")
      }</select></label>
        <label data-concern-existing hidden><span>${L("处理结果")}</span><select name="action"><option value="open">${L("新开")}</option><option value="resolve">${L("已解决")}</option><option value="accept">${L("接受风险")}</option><option value="overturn">${L("反证推翻")}</option></select></label>`
      : `<input type="hidden" name="action" value="open">`;
    const requirements = state.requirements.map((item) => `<label class="check-row"><input type="checkbox" name="requirement_ids" value="${escapeHtml(item.requirement_id)}"><span>${escapeHtml(item.statement)}</span></label>`).join("");
    const decisions = state.current_decisions.length
      ? `<label data-concern-decision hidden><span>${L("引用的用户决定（接受风险时需要）")}</span><select name="cited_decision_id"><option value="">${L("不引用")}</option>${
        state.current_decisions.map((item) => `<option value="${escapeHtml(item.decision_id)}">${escapeHtml(item.conclusion)} · ${escapeHtml(item.actor_id)}</option>`).join("")
      }</select></label>`
      : `<p class="form-note" data-concern-accept hidden>${L("接受风险前需要一条覆盖该范围的用户决定。")}</p>`;
    return `<form class="event-form mw-form" data-event-form="concern" hidden>
      <header class="event-form-heading"><h2>${L("问题与风险")}</h2>
      <p class="form-lead">${L("记录需要跟进的问题，或更新已有问题的处理结果。")}</p></header>
      <div class="event-form-body">${existing}
      <label data-concern-new><span>${L("问题标题")}</span><input name="title" required placeholder="${L("发生了什么，需要跟进什么")}"></label>
      <label data-concern-new><span>${L("说明")}</span><textarea name="statement" rows="3" required></textarea></label>
      <label data-concern-existing hidden><span>${L("处理理由")}</span><textarea name="reason" rows="2"></textarea></label>
      <label data-concern-evidence hidden><span>${L("处理证据（后续事件 ID）")}</span><input name="supporting_event_ids" placeholder="gevt-…"><small>${L("引用本 Goal 在问题提出后记录的事件；多个 ID 用空格或逗号分开。")}</small></label>
      <fieldset data-concern-new><legend>${L("明确影响范围")}</legend>
        <p class="form-note">${L("请说明影响哪项要求、哪条事件或哪个动作。")}</p>
        ${requirements || `<p class="form-note">${L("当前没有完成要求。仍可指定事件或动作。")}</p>`}
        <details class="form-disclosure"><summary>${L("关联具体事件或动作（可选）")}</summary><label><span>${L("相关事件 ID")}</span><input name="event_ids" placeholder="gevt-…"></label>
        <label><span>${L("相关动作（可选）")}</span><input name="scope_action" placeholder="${L("例如 complete（完成目标），或约定的动作名称")}"></label></details>
      </fieldset>
      ${decisions}
      <label class="check-row" data-concern-new><input type="checkbox" name="blocks_closure" checked><span>${L("会挡住完成")}</span></label></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("保存问题")}</button></footer></div>
    </form>`;
  }

  function renderClosureForm(state: GoalEventStateView): string {
    return `<form class="event-form mw-form" data-event-form="closure" hidden>
      <header class="event-form-heading"><h2>${L("显式收尾")}</h2></header>
      <div class="event-form-body"><label><span>${L("结论")}</span><select name="kind"><option value="complete">${L("完成")}</option><option value="cancel">${L("取消")}</option></select></label>
      <label><span>${L("结果说明")}</span><textarea name="result" rows="2"></textarea></label><fieldset class="closure-deliverables" data-closure-deliverables><legend>${L("交付物")}</legend><p class="form-note">${L("选成果库里的版本，或把目标的资料当场固定一版；选中的记在目标下，之后原对象怎么改都不影响它。")}</p><div data-closure-deliverable-list></div><p class="form-note" data-deliverable-read-status role="status" hidden></p><button type="button" class="mw-btn mw-btn--secondary" data-reconcile-deliverables hidden>${L("核对交付物")}</button></fieldset>
      <label><span>${L("理由")}</span><textarea name="reason" rows="3" required></textarea></label>
      <input type="hidden" name="expected_config_version" value="${state.config.version}">
      <input type="hidden" name="expected_agreement_version" value="${state.agreement.version}">
      <p class="form-note">${L("如果约定已经变化，会停下来让你对照当前版本后重试，不会自动换版本提交旧判断。")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("提交收尾")}</button></footer></div>
    </form>`;
  }

  function renderAgreementForm(state: GoalEventStateView): string {
    const rows = state.requirements.map((item) => `<fieldset data-requirement-edit="${escapeHtml(item.requirement_id)}">
      <legend>${escapeHtml(item.statement)}</legend>
      <input type="hidden" name="requirement_id" value="${escapeHtml(item.requirement_id)}">
      <label><span>${L("当前要求")}</span><textarea name="requirement_statement" rows="2">${escapeHtml(item.statement)}</textarea></label>
      <label class="check-row"><input type="checkbox" name="human_decision_required"${item.human_decision_required ? " checked" : ""}><span>${L("需要用户验收")}</span></label>
      <label class="check-row"><input type="checkbox" name="retire_requirement"><span>${L("退休这项要求（历史保留）")}</span></label>
      ${item.human_decision_required ? `<p class="form-note">${L("取消人工验收需要你亲自确认这一份变化。")}</p>` : ""}
    </fieldset>`).join("");
    return `<form class="event-form mw-form" data-event-form="agreement" hidden>
      <header class="event-form-heading"><h2>${L("修改当前约定")}</h2></header>
      <div class="event-form-body"><label><span>${L("预期结果")}</span><textarea name="outcome" rows="3" required>${escapeHtml(state.agreement.outcome)}</textarea></label>
      ${rows || `<p class="form-note">${L("还没有可修订的当前要求。")}</p>`}
      <input type="hidden" name="expected_config_version" value="${state.config.version}">
      <input type="hidden" name="expected_agreement_version" value="${state.agreement.version}">
      <p class="form-note">${L("会同时核对约定版本和配置版本。改已有结果或要求原文、退休要求、取消人工验收都是可审阅的具体变化。冲突时停下来对照，不会自动换版本。")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("保存约定")}</button></footer></div>
    </form>`;
  }

  return {
    renderRequirementForm,
    renderConcernForm,
    renderDecisionForm,
    renderClosureForm,
    renderAgreementForm,
  };
}
