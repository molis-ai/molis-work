import type { GoalEventStateView } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";

/** The user decision and its exact agreement-change comparison; the agreement form factory keeps the same public return. */
export function createDecisionForm(primitives: GoalsDocumentUiPrimitives) {
  const { translate: L, escapeHtml } = primitives;
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

  return renderDecisionForm;
}
