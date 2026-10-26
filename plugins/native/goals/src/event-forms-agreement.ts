import type { GoalEventStateView } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import type { GoalEventDocumentView } from "./event-document-model.js";
import type { EventFormShared } from "./event-forms-shared.js";

/** 约定相关的表单：要求、关切、决定、收尾、约定与拟改变化；由 createEventDocumentForms 组合。 */
export function createAgreementForms(primitives: GoalsDocumentUiPrimitives, shared: EventFormShared) {
  const { translate: L, escapeHtml } = primitives;
  const { newToken } = shared;
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

  function renderDecisionForm(state: GoalEventStateView): string {
    const pending = state.pending_decisions[0];
    const agreementChange = pending?.purpose === "agreement_change";
    const expired = Boolean(agreementChange && pending && agreementChangeRequestExpired(pending, state));
    const requirements = state.requirements.map((item) => `<label class="check-row"><input type="checkbox" name="requirement_ids" value="${escapeHtml(item.requirement_id)}"><span>${escapeHtml(item.statement)}</span></label>`).join("");
    const concerns = state.concerns.filter((item) => item.status === "open").map((item) => `<label class="check-row"><input type="checkbox" name="concern_ids" value="${escapeHtml(item.concern_id)}"><span>${escapeHtml(item.title)}</span></label>`).join("");
    const options = pending && !agreementChange
      ? `<fieldset><legend>${L("选项")}</legend>${pending.options.map((option) => `<label class="check-row"><input type="radio" name="selected_option_id" value="${escapeHtml(option.option_id)}"><span><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.impact)}</small></span></label>`).join("")}</fieldset>`
      : pending && agreementChange
        ? `<div class="form-note"><strong>${L("请求中的业务选项（背景，不是批准或拒绝）")}</strong><ul>${pending.options.map((option) => `<li><strong>${escapeHtml(option.label)}</strong> · ${escapeHtml(option.impact)}</li>`).join("")}</ul></div>`
        : "";
    const pendingAction = pending?.scope.action?.trim() || "";
    const effects = agreementChange
      ? `<fieldset><legend>${L("对这一份约定变更")}</legend>
        <p class="form-note">${L("必须主动选择批准或拒绝。不会根据上面的业务选项猜测。")}</p>
        <label class="check-row"><input type="radio" name="agreement_change_decision" value="authorize" required><span>${L("批准这一份约定变更")}</span></label>
        <label class="check-row"><input type="radio" name="agreement_change_decision" value="deny" required><span>${L("拒绝这一份约定变更")}</span></label>
      </fieldset>`
      : `<fieldset><legend>${L("效果")}</legend>
        <label class="check-row"><input type="checkbox" name="effect" value="accept_requirements"><span>${L("接受这些要求")}</span></label>
        <label class="check-row"><input type="checkbox" name="effect" value="reject_requirements"><span>${L("拒绝这些要求")}</span></label>
        <label class="check-row"><input type="checkbox" name="effect" value="accept_concerns"><span>${L("接受这些风险")}</span></label>
        <label class="check-row"><input type="checkbox" name="effect" value="reject_concerns"><span>${L("驳回这些问题")}</span></label>
        <label class="check-row"><input type="checkbox" name="effect" value="authorize_action"><span>${L("授权该动作")}${pendingAction ? `（${escapeHtml(pendingAction)}）` : ""}</span></label>
        <label class="check-row"><input type="checkbox" name="effect" value="deny_action"><span>${L("拒绝该动作")}</span></label>
      </fieldset>
      <fieldset><legend>${L("要求范围")}</legend>${requirements || `<p class="form-note">${L("当前没有要求。")}</p>`}</fieldset>
      <fieldset><legend>${L("问题范围")}</legend>${concerns || `<p class="form-note">${L("当前没有待处理问题。")}</p>`}</fieldset>
      ${pendingAction
        ? `<input type="hidden" name="action" value="${escapeHtml(pendingAction)}"><p class="form-note">${L("待决定动作")}：${escapeHtml(pendingAction)}</p>`
        : `<label><span>${L("相关动作（授权或拒绝时填写，不从一句话猜测）")}</span><input name="action" placeholder="complete"></label>`}`;
    return `<form class="event-form mw-form" data-event-form="decision" data-pending-action="${escapeHtml(pendingAction)}" hidden>
      <header class="event-form-heading"><h2>${L("用户决定")}</h2></header>
      <div class="event-form-body">${pending ? `<p class="reader-lead">${escapeHtml(pending.question)}</p><input type="hidden" name="request_id" value="${escapeHtml(pending.request_id)}">` : `<label><span>${L("结论")}</span><textarea name="conclusion" rows="3" required></textarea></label>`}
      ${options}
      ${pending?.proposed_change ? renderProposedChange(pending, state) : ""}
      ${expired ? `<p class="form-note">${L("这份请求所依据的结果或要求已经变化，不能按当时内容批准。请刷新或重新请求。")}</p>` : ""}
      ${effects}
      ${pending ? `<label><span>${L("结论")}</span><textarea name="conclusion" rows="2" required></textarea></label>` : ""}
      <p class="form-note">${L("效果和范围由这里的选择决定，不会从任意一句话猜测批准。")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("记录决定")}</button></footer></div>
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
      parts.push(`${L("原结果")}：${escapeHtml(from)} → ${L("拟改结果")}：${escapeHtml(change.outcome)}`);
    }
    for (const item of change.new_requirements ?? []) parts.push(`${L("新增要求")}：${escapeHtml(item.statement)}`);
    for (const item of change.revise_requirements ?? []) {
      const previous = byId.get(item.requirement_id);
      const from = previous?.statement || item.requirement_id;
      if (item.statement) {
        parts.push(`${L("原要求")}：${escapeHtml(from)} → ${L("拟改要求")}：${escapeHtml(item.statement)}`);
      }
      if (item.human_decision_required === false) {
        parts.push(`${L("取消人工验收")}：${escapeHtml(from)}`);
      }
      if (item.human_decision_required === true) {
        parts.push(`${L("改为需要用户验收")}：${escapeHtml(from)}`);
      }
    }
    for (const id of change.retire_requirement_ids ?? []) {
      const previous = byId.get(id);
      parts.push(`${L("退休要求")}：${escapeHtml(previous?.statement || id)}`);
    }
    return `<div class="reader-lead"><strong>${L("这一份约定变化")}</strong><ul>${parts.map((part) => `<li>${part}</li>`).join("")}</ul></div>`;
  }

  return {
    renderRequirementForm,
    renderConcernForm,
    renderDecisionForm,
    renderClosureForm,
    renderAgreementForm,
  };
}
