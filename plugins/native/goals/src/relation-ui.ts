import type { GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_RELATION_LABELS as RELATION_LABELS, GOALS_RELATION_TYPES as RELATION_TYPES } from "./relation-presentation.js";
import { sortGoalTreeItems as sortGoals } from "./tree-order.js";
import type { GoalsRelationItem, GoalsRelationView, GoalsRelationUiPrimitives } from "./relation-ui-model.js";

export const GOALS_RELATION_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.relations.v1";
function createRelationRenderer(primitives: GoalsRelationUiPrimitives) {
  const { translate: L, escapeHtml, icon } = primitives;
function relationRow(
  relation: GoalRelationRecord,
  item: GoalsRelationItem,
  view: GoalsRelationView,
  editable = true,
): string {
  const outgoing = relation.from_goal_id === item.goal.goal_id;
  const relatedId = outgoing ? relation.to_goal_id : relation.from_goal_id;
  const related = [...view.goals, ...view.archived_goals].find(
    (candidate) => candidate.goal.goal_id === relatedId,
  );
  const relatedName = related?.goal.title ?? relatedId;
  const rawLabels = RELATION_LABELS[relation.type] ?? { out: relation.type, in: relation.type };
  const labels = { out: L(rawLabels.out), in: L(rawLabels.in) };
  const path = outgoing
    ? L("当前 Goal → {type} → {name}", { type: labels.out, name: relatedName })
    : L("{name} → {type} → 当前 Goal", { name: relatedName, type: labels.out });
  const deactivated = item.events.find(
    (event) => event.type === "relation.deactivated" && event.object_id === relation.relation_id,
  );
  const stateLabel = relation.state === "active" ? L("生效") : relation.state === "proposed" ? L("待确认") : L("已解除");
  const deactivateId = `relation-deactivate-${relation.relation_id}`;
  return `<div class="relation-record relation-record--${escapeHtml(relation.state)}" id="relation-${escapeHtml(relation.relation_id)}" data-relation-id="${escapeHtml(relation.relation_id)}">
    <button class="relation-row" type="button" data-select-goal="${escapeHtml(relatedId)}" aria-label="${L("打开")} ${escapeHtml(relatedName)}">
      <span class="relation-kind">${escapeHtml(outgoing ? labels.out : labels.in)}</span>
      <span class="relation-copy"><span class="relation-heading"><strong>${escapeHtml(relatedName)}</strong><small class="relation-goal-id">${escapeHtml(relatedId)}</small></span><small class="relation-path">${escapeHtml(path)}</small><small class="relation-reason">${L("建立原因：")}${escapeHtml(relation.reason)}${deactivated ? ` · ${L("解除原因：")}${escapeHtml(deactivated.reason)}` : ""}</small></span>
      <span class="relation-state relation-state--${escapeHtml(relation.state)}">${escapeHtml(stateLabel)}</span>
      ${icon("chevron-right")}
    </button>
    ${editable && relation.state === "active" && !item.goal.archived_at ? `<button class="relation-deactivate-open" type="button" data-relation-deactivate-open aria-expanded="false" aria-controls="${escapeHtml(deactivateId)}">${L("解除")}</button>` : ""}
    ${editable && relation.state === "active" && !item.goal.archived_at ? `<form class="relation-deactivate-form" id="${escapeHtml(deactivateId)}" data-relation-deactivate-form data-live-form="relation-deactivate-${escapeHtml(relation.relation_id)}" data-relation-id="${escapeHtml(relation.relation_id)}" hidden>
      <label><span>${L("解除原因")}</span><textarea name="reason" rows="2" required placeholder="${L("说明为什么这条关系不再成立；历史记录会保留")}"></textarea></label>
      <p class="form-error" data-relation-deactivate-error role="alert" hidden></p>
      <footer><button type="button" data-relation-deactivate-cancel>${L("取消")}</button><button class="button-danger" type="submit">${L("确认解除")}</button></footer>
    </form>` : ""}
  </div>`;
}

function relationGroup(
  title: string,
  hint: string,
  relations: GoalRelationRecord[],
  item: GoalsRelationItem,
  view: GoalsRelationView,
  editable = true,
): string {
  return `<section class="relation-group"><header><h3>${escapeHtml(L(title))} <span>${relations.length}</span></h3><p>${escapeHtml(L(hint))}</p></header><div>${
    relations.length
      ? relations.map((relation) => relationRow(relation, item, view, editable)).join("")
      : `<p class="empty-row">${L("暂无关系")}</p>`
  }</div></section>`;
}

function renderRelations(item: GoalsRelationItem, view: GoalsRelationView, editable = true, dependencyHistoryHtml = ""): string {
  const relations = item.relations.filter((relation) => relation.state !== "inactive");
  const inactive = item.relations.filter((relation) => relation.state === "inactive");
  const spineTypes = new Set(["depends_on", "part_of"]);
  const upstream = relations.filter(
    (relation) => relation.from_goal_id === item.goal.goal_id && spineTypes.has(relation.type),
  );
  const downstream = relations.filter(
    (relation) => relation.to_goal_id === item.goal.goal_id && spineTypes.has(relation.type),
  );
  const other = relations.filter(
    (relation) => !upstream.includes(relation) && !downstream.includes(relation),
  );
  return `<div class="relation-layout">
    ${relationGroup("上游", "这个 Goal 的归属与完成依赖", upstream, item, view, editable)}
    ${relationGroup("下游", "哪些 Goal 等待或包含它", downstream, item, view, editable)}
    ${relationGroup("其他关联", "扩展、替代、修正或风险关系", other, item, view, editable)}
  </div>
  ${editable ? renderRelationEditor(item, view) : ""}
  ${inactive.length ? `<details class="relation-inactive-history" data-persist-open="inactive-relations-${escapeHtml(item.goal.goal_id)}"><summary><span>${icon("history")}<strong>${L("已解除关系")}</strong><small>${inactive.length} ${L("条，保留方向与变更原因")}</small></span>${icon("chevron-down")}</summary><div>${inactive.map((relation) => relationRow(relation, item, view, false)).join("")}</div></details>` : ""}
  ${dependencyHistoryHtml}`;
}

function renderRelationForm(item: GoalsRelationItem, view: GoalsRelationView): string {
  if (item.goal.archived_at) return "";
  const targets = sortGoals(view.goals).filter(
    (candidate) => candidate.goal.goal_id !== item.goal.goal_id,
  );
  if (!targets.length) {
    return `<div class="relation-editor-empty">${icon("link")}<span><strong>${L("还没有可关联的其他 Goal")}</strong><small>${L("先新建另一个 Goal，再回来建立层级、依赖或语义关系。")}</small></span></div>`;
  }
  const targetOptions = targets
    .map(
      (target) =>
        `<option value="${escapeHtml(target.goal.goal_id)}" data-goal-name="${escapeHtml(target.goal.title)}">${escapeHtml(target.goal.title)} · ${escapeHtml(target.goal.goal_id)}</option>`,
    )
    .join("");
  const typeOptions = RELATION_TYPES.map(({ type, label, description }) => {
    const labels = RELATION_LABELS[type];
    return `<option value="${escapeHtml(type)}"${type === "depends_on" ? " selected" : ""} data-out-label="${escapeHtml(L(labels.out))}" data-in-label="${escapeHtml(L(labels.in))}" data-description="${escapeHtml(L(description))}">${escapeHtml(L(label))}</option>`;
  }).join("");
  const firstTarget = targets[0]!.goal;
  return `<form class="relation-form" data-relation-form data-live-form="relation-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" data-current-goal-name="${escapeHtml(item.goal.title)}" novalidate>
      <div class="relation-authority"><span>${icon("shield")}</span><p><strong>${L("你正在直接修改 Goal 关系")}</strong><small>${L("保存后立即生效并进入历史。执行工具提出的关系变化仍会先进入")}<a href="/decisions">${L("Inbox")}</a>${L("，由你确认后才生效。")}</small></p></div>
      <div class="relation-builder">
        <label><span>${L("这条关系表示什么")}</span><select name="relation_intent"><option value="needs">${L("当前 Goal 收尾前需要它完成")}</option><option value="belongs">${L("当前 Goal 属于它")}</option><option value="enables">${L("它收尾前需要当前 Goal 完成")}</option><option value="contains">${L("它属于当前 Goal")}</option><option value="other">${L("其他关系")}</option></select></label>
        <label><span>${L("另一个 Goal")}</span><select name="target_goal_id">${targetOptions}</select></label>
      </div>
      <div class="relation-live-preview" data-relation-live-preview><small>${L("保存后会形成")}</small><strong>${escapeHtml(item.goal.title)} <span>${L("→ 依赖 →")}</span> ${escapeHtml(firstTarget.title)}</strong><p>${L("另一个 Goal 完成前，当前 Goal 还不能收尾。普通笔记和准备仍可先做。")}</p></div>
      <label class="relation-reason-field"><span>${L("为什么需要这条关系")}</span><textarea name="reason" rows="3" required placeholder="${L("写清两条 Goal 为什么需要这样关联，方便之后判断关系是否仍然成立")}"></textarea></label>
      <details class="factor-advanced" data-progressive-fields>
        <summary><span><strong>${L("查看准确方向和关系类型")}</strong><small>${L("只有上面的常用选项不适用时才需要修改")}</small></span>${icon("chevron-down")}</summary>
        <div class="factor-advanced-grid">
          <label><span>${L("准确方向")}</span><select name="direction" required><option value="">${L("请选择方向")}</option><option value="outgoing" selected>${L("当前 Goal → 另一个 Goal")}</option><option value="incoming">${L("另一个 Goal → 当前 Goal")}</option></select></label>
          <label><span>${L("准确关系类型")}</span><select name="type" required><option value="">${L("请选择关系类型")}</option>${typeOptions}</select></label>
        </div>
      </details>
      <p class="form-error" data-relation-error role="alert" hidden></p>
      <footer><p>${L("提交后直接生效并写入事件历史；不会创建或启动 Runtime。")}</p><button class="button-primary" type="submit">${L("建立关系")}</button></footer>
    </form>`;
}

function renderRelationEditor(item: GoalsRelationItem, view: GoalsRelationView): string {
  const editorKey = `relation-editor-${item.goal.goal_id}`;
  const form = renderRelationForm(item, view);
  if (!form || form.includes("relation-editor-empty")) return form;
  return `<details class="relation-editor" data-relation-editor data-persist-open="${escapeHtml(editorKey)}" data-live-form="${escapeHtml(editorKey)}">
    <summary><span class="relation-editor-icon">${icon("link")}</span><span><strong>${L("维护关系")}</strong><small>${L("新增关系，或在上方解除已有关系")}</small></span><span class="relation-editor-action">${L("打开编辑器")}</span>${icon("chevron-down")}</summary>
    ${form}
  </details>`;
}


  return { renderRelations, renderRelationForm };
}
export type GoalsRelationRenderer = ReturnType<typeof createRelationRenderer>;
export type GoalsRelationUiModel = { primitives: GoalsRelationUiPrimitives } & (
  | { kind: "relations"; args: Parameters<GoalsRelationRenderer["renderRelations"]> }
  | { kind: "form"; args: Parameters<GoalsRelationRenderer["renderRelationForm"]> }
);

export const goalsRelationUiContribution: UiContribution<GoalsRelationUiModel> = {
  descriptor: { contribution_id: GOALS_RELATION_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.goals", kind: "embedded", label: "Goal relations",
    surfaces: ["relations", "form"].map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })), slots: [] },
  render({ surface, model }) {
    if (surface !== model.kind) throw new Error("Goals relation surface does not match its model");
    const renderer = createRelationRenderer(model.primitives);
    return model.kind === "form" ? renderer.renderRelationForm(...model.args) : renderer.renderRelations(...model.args);
  },
};
