import { randomUUID } from "node:crypto";
import type { GoalEventFieldDefinition, GoalEventStateView, GoalEventTypeDefinition } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import type { GoalEventDocumentView } from "./event-document-model.js";

export function createEventDocumentForms(primitives: GoalsDocumentUiPrimitives) {
  const { translate: L, escapeHtml } = primitives;

  function fieldError(id: string): string {
    return `<p class="event-field-error" data-field-error="${escapeHtml(id)}" hidden></p>`;
  }

  function newToken(prefix: string): string {
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  }

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
      ? `<label data-concern-accept hidden><span>${L("引用的用户决定（接受风险时需要）")}</span><select name="cited_decision_id"><option value="">${L("不引用")}</option>${
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
      <fieldset><legend>${L("明确影响范围")}</legend>
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
      <label><span>${L("结果说明")}</span><textarea name="result" rows="2"></textarea></label>
      <label><span>${L("理由")}</span><textarea name="reason" rows="3" required></textarea></label>
      <input type="hidden" name="expected_config_version" value="${state.config.version}">
      <input type="hidden" name="expected_agreement_version" value="${state.agreement.version}">
      <p class="form-note">${L("如果约定已经变化，会停下来让你对照当前版本后重试，不会自动换版本提交旧判断。")}</p></div>
      <div class="event-form-bottom"><p class="event-form-status" data-form-status role="status" hidden></p><footer class="event-form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-event-back>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("提交收尾")}</button></footer></div>
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
    renderTypeForm,
    renderPlanning,
    renderProgressForm,
    renderConcernForm,
    renderDecisionForm,
    renderClosureForm,
    renderResumeForm,
    renderNoteForm,
    renderAdoptForm,
    renderAgreementForm,
    renderTypeEditForms,
    renderRequirementForm,
  };
}
