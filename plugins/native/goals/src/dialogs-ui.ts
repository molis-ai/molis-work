import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
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
    const { escapeHtml, icon } = primitives;
    function renderGoalTrashDialog(): string {
        return `<dialog class="create-dialog goal-trash-dialog mw-dialog mw-dialog--alert" data-goal-trash-dialog aria-labelledby="goal-trash-dialog-title">
    <form method="dialog" class="dialog-shell mw-form mw-dialog__shell" data-goal-trash-form data-live-form="goal-trash">
      <header class="mw-form__header"><div><span class="dialog-icon dialog-icon--danger" data-goal-trash-icon>${icon("archive")}</span><div><h2 id="goal-trash-dialog-title" data-goal-trash-title>${uiText("goals.dialogs-ui.move-trash")}</h2><p data-goal-trash-description>${uiText("goals.dialogs-ui.confirm-goal-reason-action")}</p></div></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-close-goal-trash aria-label="${uiText("goals.dialogs-ui.close")}">${icon("x")}</button></header>
      <div class="dialog-body mw-form__body">
        <p class="goal-trash-target"><strong data-goal-trash-target-title>${uiText("goals.dialogs-ui.no-goal-selected")}</strong><small data-goal-trash-target-id></small></p>
        <p class="goal-trash-note" data-goal-trash-note>${uiText("goals.dialogs-ui.can-be-undone-goal-history-kept-currently-active")}</p>
        <label class="mw-field"><span class="mw-field__label" data-goal-trash-reason-label>${uiText("goals.dialogs-ui.why-move")}</span><textarea class="mw-textarea" name="reason" rows="3" required maxlength="4000" placeholder="${uiText("goals.dialogs-ui.say-why-goal-should-leave-everyday-list-now")}"></textarea></label>
        <p class="form-error mw-alert mw-alert--danger" data-goal-trash-error role="alert" hidden></p>
      </div>
      <footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-close-goal-trash>${uiText("goals.dialogs-ui.cancel")}</button><button class="mw-btn mw-btn--danger" type="submit" data-goal-trash-submit>${uiText("goals.dialogs-ui.move-trash")}</button></footer>
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
        return `<dialog class="create-dialog mw-dialog mw-dialog--form" data-create-dialog aria-labelledby="create-dialog-title">
    <form method="dialog" class="dialog-shell mw-form mw-dialog__shell" data-create-form>
      <header class="mw-form__header"><h2 id="create-dialog-title">${uiText("goals.dialogs-ui.new-goal")}</h2><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-close-create aria-label="${uiText("goals.dialogs-ui.close")}">${icon("x")}</button></header>
      <div class="dialog-body mw-form__body">
        <div class="create-compose">
          <input class="create-compose-title" data-plain-field name="title" required autocomplete="off" placeholder="${uiText("goals.dialogs-ui.what-do-want-make-real")}" aria-label="${uiText("goals.dialogs-ui.goal-title")}">
          <p class="create-compose-example" data-create-example>${uiText("goals.dialogs-ui.example-new-user-knows-what-do-next-right")}</p>
          <textarea class="create-compose-outcome" data-plain-field data-fit name="outcome" rows="2" placeholder="${uiText("goals.dialogs-ui.what-will-be-different-once-done-can-leave")}" aria-label="${uiText("goals.dialogs-ui.result-want")}"></textarea>
        </div>
        <details class="form-disclosure mw-collapsible create-more"><summary>${uiText("goals.dialogs-ui.notes-placement-priority")}</summary>
        <section class="create-more-group">
          <label class="mw-field"><span class="mw-field__label">${uiText("goals.dialogs-ui.why-do")}</span><textarea class="mw-textarea" name="why" rows="2" placeholder="${uiText("goals.dialogs-ui.why-problem-worth-solving-now")}"></textarea></label>
          <label class="mw-field"><span class="mw-field__label">${uiText("goals.dialogs-ui.how-works")}</span><textarea class="mw-textarea" name="business_logic" rows="3" placeholder="${uiText("goals.dialogs-ui.explain-practical-flow-boundaries-plain-language")}"></textarea></label>
          <label class="mw-field"><span class="mw-field__label">${uiText("goals.dialogs-ui.acceptance-criteria")}<small>${uiText("goals.dialogs-ui.one-per-line-can-be-filled-later")}</small></span><textarea class="mw-textarea" name="acceptance_criteria" rows="3" placeholder="${uiText("goals.dialogs-ui.example-goal-can-be-created-appears-left-tree")}"></textarea></label>
        </section>
        <section class="create-more-group" aria-labelledby="parent-relation-title">
          <h3 id="parent-relation-title">${uiText("goals.dialogs-ui.which-larger-goal-does-belong")}<small>${uiText("goals.dialogs-ui.optional")}</small></h3>
          <p id="parent-relation-hint">${uiText("goals.dialogs-ui.means-part-that-goal-only-decides-tree-placement")}</p>
          <label class="mw-field"><select class="mw-select" name="parent_goal_id" aria-label="${uiText("goals.dialogs-ui.parent-goal")}" aria-describedby="parent-relation-hint parent-relation-preview"><option value="">${uiText("goals.dialogs-ui.stand-alone-goal-no-parent")}</option>${options}</select></label>
          <p class="relation-preview" id="parent-relation-preview" data-parent-preview>${uiText("goals.dialogs-ui.preview-new-goal-will-appear-tree-its-own")}</p>
        </section>
        <fieldset class="create-more-group relation-field mw-fieldset" aria-describedby="dependency-relation-hint dependency-relation-preview">
          <legend>${uiText("goals.dialogs-ui.which-goals-must-finish-before-one-can-close")}<small>${uiText("goals.dialogs-ui.optional")}</small></legend>
          <p id="dependency-relation-hint">${uiText("goals.dialogs-ui.choose-only-when-other-result-actually-required-before")}</p>
          <div class="goal-choice-list">${dependencyOptions}</div>
          <p class="relation-preview" id="dependency-relation-preview" data-dependency-preview>${uiText("goals.dialogs-ui.preview-there-no-execution-prerequisite-goal-can-move")}</p>
        </fieldset>
        <section class="create-more-group">
          <div class="field-row field-row--split"><label class="mw-field"><span class="mw-field__label">Goal ID <small>${uiText("goals.dialogs-ui.optional")}</small></span><input class="mw-input" name="goal_id" autocomplete="off" placeholder="${uiText("goals.dialogs-ui.generated-if-empty")}"></label><label class="mw-field"><span class="mw-field__label">${uiText("goals.dialogs-ui.priority")}</span><input class="mw-input" name="priority" type="number" min="0" max="100" value="50"></label></div>
        </section>
        </details>
        <p class="form-error mw-alert mw-alert--danger" data-create-error role="alert" hidden></p>
      </div>
      <footer class="mw-form__footer"><kbd class="dialog-submit-hint" aria-hidden="true">⌘<span>↵</span></kbd><button class="mw-btn mw-btn--secondary" type="button" data-close-create>${uiText("goals.dialogs-ui.cancel")}</button><button class="mw-btn mw-btn--primary" type="submit" data-create-submit>${uiText("goals.dialogs-ui.create-goal")}</button></footer>
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
/** Which surface each renderer method mounts (W5-06): the shell builds its renderer from this, and the descriptor lists these. */
export const GOALS_DIALOGS_UI_SURFACES = { renderCreateDialog: "create", renderGoalTrashDialog: "trash" } as const satisfies Record<keyof GoalsDialogsRenderer, GoalsDialogsUiModel["kind"]>;
export const goalsDialogsUiContribution: UiContribution<GoalsDialogsUiModel> = {
    descriptor: { contribution_id: GOALS_DIALOGS_UI_CONTRIBUTION_ID, kind: "embedded", label: "Goal dialogs",
        surfaces: Object.values(GOALS_DIALOGS_UI_SURFACES).map(surface_id => ({ surface_id, target_slot_id: "workbench.overlay", format: "declarative-html" })), slots: [] },
    render({ surface, model }) {
        if (surface !== model.kind)
            throw new Error("Goal dialog surface does not match its model");
        const renderer = createDialogsRenderer(model.primitives);
        return model.kind === "create" ? renderer.renderCreateDialog(...model.args) : renderer.renderGoalTrashDialog(...model.args);
    },
};
