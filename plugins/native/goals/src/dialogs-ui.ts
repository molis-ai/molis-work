import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { sortGoalTreeItems } from "./tree-order.js";
import type { GoalDisplayStatus } from "./tree-order.js";
import type { GoalPresentationState } from "./tree-order.js";
export interface GoalsDialogItem {
    status: GoalPresentationState;
    display_status?: GoalDisplayStatus;
    goal: {
        goal_id: string;
        title: string;
        priority: number;
        created_at: string;
    };
}
export interface GoalsDialogPrimitives {
    translate(text: string, values?: Record<string, string | number>): string;
    escapeHtml(value: string): string;
    icon(name: "archive" | "x" | "plus" | "info"): string;
}
function createDialogsRenderer(primitives: GoalsDialogPrimitives) {
    const { translate: L, escapeHtml, icon } = primitives;
    function renderGoalTrashDialog(): string {
        return `<dialog class="create-dialog goal-trash-dialog mw-dialog mw-dialog--alert" data-goal-trash-dialog aria-labelledby="goal-trash-dialog-title">
    <form method="dialog" class="dialog-shell mw-form mw-dialog__shell" data-goal-trash-form data-live-form="goal-trash">
      <header class="mw-form__header"><div><span class="dialog-icon dialog-icon--danger" data-goal-trash-icon>${icon("archive")}</span><div><h2 id="goal-trash-dialog-title" data-goal-trash-title>${L("移入回收站")}</h2><p data-goal-trash-description>${L("请先确认这条 Goal 和本次操作原因。")}</p></div></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-close-goal-trash aria-label="${L("关闭")}">${icon("x")}</button></header>
      <div class="dialog-body mw-form__body">
        <p class="goal-trash-target"><strong data-goal-trash-target-title>${L("未选择 Goal")}</strong><small data-goal-trash-target-id></small></p>
        <p class="goal-trash-note" data-goal-trash-note>${L("该操作可恢复：Goal 历史会保留，当前仍生效的关联关系会暂时停止。若这条 Goal 仍有未结束的历史活动记录，系统不会改动它，而会指出还挡着的记录。")}</p>
        <label class="mw-field"><span class="mw-field__label" data-goal-trash-reason-label>${L("移入原因")}</span><textarea class="mw-textarea" name="reason" rows="3" required maxlength="4000" placeholder="${L("说明为什么暂时不再保留这条 Goal")}"></textarea></label>
        <p class="form-error mw-alert mw-alert--danger" data-goal-trash-error role="alert" hidden></p>
      </div>
      <footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-close-goal-trash>${L("取消")}</button><button class="mw-btn mw-btn--danger" type="submit" data-goal-trash-submit>${L("移入回收站")}</button></footer>
    </form>
  </dialog>`;
    }
    function renderCreateDialog(goals: GoalsDialogItem[]): string {
        const options = sortGoalTreeItems(goals)
            .map((item) => `<option value="${escapeHtml(item.goal.goal_id)}" data-goal-name="${escapeHtml(item.goal.title)}">${escapeHtml(item.goal.title)} · ${escapeHtml(item.goal.goal_id)}</option>`)
            .join("");
        const dependencyOptions = sortGoalTreeItems(goals)
            .map((item) => `<label class="goal-choice"><input type="checkbox" name="dependency_goal_ids" value="${escapeHtml(item.goal.goal_id)}" data-goal-name="${escapeHtml(item.goal.title)}"><span><strong>${escapeHtml(item.goal.title)}</strong><small>${escapeHtml(item.goal.goal_id)}</small></span></label>`)
            .join("");
        return `<dialog class="create-dialog mw-sheet" data-create-dialog aria-labelledby="create-dialog-title">
    <form method="dialog" class="dialog-shell mw-form mw-sheet__shell" data-create-form>
      <header class="mw-form__header"><div><span class="dialog-icon">${icon("plus")}</span><div><h2 id="create-dialog-title">${L("新建目标")}</h2><p>${L("先记录你的想法，再补全目标说明。规划可选。")}</p></div></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-close-create aria-label="${L("关闭")}">${icon("x")}</button></header>
      <div class="dialog-body mw-form__body">
        <label class="mw-field"><span class="mw-field__label">${L("目标名称")}</span><input class="mw-input" name="title" required maxlength="120" placeholder="${L("一句话说明要完成什么")}"></label>
        <label class="mw-field"><span class="mw-field__label">${L("要得到的结果 ")}<small>${L("可稍后补")}</small></span><textarea class="mw-textarea" name="outcome" rows="2" placeholder="${L("完成后，用户或系统获得什么可观察结果")}"></textarea></label>
        <details class="form-disclosure mw-collapsible"><summary>${L("补充说明与验收条件")}</summary>
        <label class="mw-field"><span class="mw-field__label">${L("为什么做 ")}<small>${L("可稍后补")}</small></span><textarea class="mw-textarea" name="why" rows="2" placeholder="${L("这个问题为什么值得现在解决")}"></textarea></label>
        <label class="mw-field"><span class="mw-field__label">${L("它会怎样运转 ")}<small>${L("可稍后补")}</small></span><textarea class="mw-textarea" name="business_logic" rows="3" placeholder="${L("用简单语言说明实际使用方式和边界")}"></textarea></label>
        <label class="mw-field"><span class="mw-field__label">${L("验收条件 ")}<small>${L("每行一条，可稍后补")}</small></span><textarea class="mw-textarea" name="acceptance_criteria" rows="3" placeholder="${L("例如：可以创建 Goal，并在左侧 Tree 中立即看到")}"></textarea></label>
        </details><details class="form-disclosure mw-collapsible"><summary>${L("归属与完成依赖")}</summary>
        <section class="relation-field" aria-labelledby="parent-relation-title">
          <div class="relation-field-heading"><span>${L("目录层级")}</span><div><h3 id="parent-relation-title">${L("它属于哪个更大的 Goal？ ")}<small>${L("可选")}</small></h3><p id="parent-relation-hint">${L("表示“它是这个 Goal 的一部分”，只决定 Tree 中放在哪里，不要求上级 Goal 先完成。")}</p></div></div>
          <label class="mw-field"><span class="mw-field__label">${L("所属上级 Goal")}</span><select class="mw-select" name="parent_goal_id" aria-describedby="parent-relation-hint parent-relation-preview"><option value="">${L("作为独立 Goal，不指定上级")}</option>${options}</select></label>
          <p class="relation-preview" id="parent-relation-preview" data-parent-preview>${L("关系预览：新 Goal 将作为独立 Goal 出现在 Tree 中。")}</p>
        </section>
        <fieldset class="relation-field mw-fieldset" aria-describedby="dependency-relation-hint dependency-relation-preview">
          <legend><span>${L("执行前置")}</span><div><strong>${L("收尾前需要哪些 Goal 先完成？ ")}<small>${L("可选")}</small></strong><small id="dependency-relation-hint">${L("只有确实要等对方完成后才能收尾时才选择。普通笔记和准备仍可先做。")}</small></div></legend>
          <div class="goal-choice-list">${dependencyOptions}</div>
          <p class="relation-preview" id="dependency-relation-preview" data-dependency-preview>${L("关系预览：当前没有执行前置，Goal 可以独立推进。")}</p>
        </fieldset>
        </details><details class="form-disclosure mw-collapsible"><summary>${L("标识与优先级")}</summary>
        <div class="field-row field-row--split"><label class="mw-field"><span class="mw-field__label">Goal ID <small>${L("可选")}</small></span><input class="mw-input" name="goal_id" autocomplete="off" placeholder="${L("例如 GOAL-AUTHORING")}"></label><label class="mw-field"><span class="mw-field__label">${L("优先级")}</span><input class="mw-input" name="priority" type="number" min="0" max="100" value="50"></label></div>
        </details>
        <p class="form-error mw-alert mw-alert--danger" data-create-error role="alert" hidden></p>
      </div>
      <footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-close-create>${L("取消")}</button><button class="mw-btn mw-btn--primary" type="submit">${L("创建 Goal")}</button></footer>
    </form>
  </dialog>`;
    }
    return { renderGoalTrashDialog, renderCreateDialog };
}
export type GoalsDialogsRenderer = ReturnType<typeof createDialogsRenderer>;
export const GOALS_DIALOGS_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.dialogs.v1";
export type GoalsDialogsUiModel = {
    primitives: GoalsDialogPrimitives;
} & ({
    kind: "create";
    args: Parameters<GoalsDialogsRenderer["renderCreateDialog"]>;
} | {
    kind: "trash";
    args: Parameters<GoalsDialogsRenderer["renderGoalTrashDialog"]>;
});
export const goalsDialogsUiContribution: UiContribution<GoalsDialogsUiModel> = {
    descriptor: { contribution_id: GOALS_DIALOGS_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.goals", kind: "embedded", label: "Goal dialogs",
        surfaces: ["create", "trash"].map(surface_id => ({ surface_id, target_slot_id: "workbench.overlay", format: "declarative-html" })), slots: [] },
    render({ surface, model }) {
        if (surface !== model.kind)
            throw new Error("Goal dialog surface does not match its model");
        const renderer = createDialogsRenderer(model.primitives);
        return model.kind === "create" ? renderer.renderCreateDialog(...model.args) : renderer.renderGoalTrashDialog(...model.args);
    },
};
