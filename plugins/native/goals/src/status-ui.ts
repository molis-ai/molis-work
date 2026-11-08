import { renderStateRing } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalDisplayStatus } from "./tree-order.js";
import type { GoalPresentationState } from "./tree-order.js";
import type { GoalsTreeItem } from "./tree-ui-model.js";
import { visibleGoalStatus } from "./tree-presentation.js";
import { createGoalStateExplainer, type GoalStatusTranslate } from "./goal-state-explanation.js";
import { createGoalActionPresenter } from "./action-presentation.js";
import { STATUS_MARKS, DISPLAY_STATUS_MARKS } from "./status-rings.js";
export type GoalStatusIcon = "status-todo" | "status-progress" | "status-waiting" | "status-needs-you" | "status-blocked" | "status-done" | "status-cancelled" | "waiting" | "user" | "tree" | "play" | "blocked" | "ready" | "completed" | "review" | "refresh" | "alert" | "archive" | "trash";
export interface GoalsStatusPrimitives {
    translate: GoalStatusTranslate;
    escapeHtml(value: string): string;
    icon(name: GoalStatusIcon): string;
}
function createStatusRenderer(primitives: GoalsStatusPrimitives) {
    const { translate, escapeHtml } = primitives;
    const { explainWorkState } = createGoalStateExplainer(translate);
    const { goalDisplayStatusLabel } = createGoalActionPresenter(translate);
    function renderStatus(status: GoalPresentationState, attributes = "", labelAttributes = ""): string {
        const explanation = explainWorkState(status);
        return `<span class="goal-status goal-status--${status}"${attributes ? ` ${attributes}` : ""} title="${escapeHtml(explanation.meaning)}">${renderStateRing({ state: STATUS_MARKS[status] })}<span${labelAttributes ? ` ${labelAttributes}` : ""}>${escapeHtml(explanation.label)}</span></span>`;
    }
    function renderActionStatus(status: GoalDisplayStatus, attributes = "", labelAttributes = ""): string {
        const label = goalDisplayStatusLabel(status);
        return `<span class="goal-status goal-status--${status}"${attributes ? ` ${attributes}` : ""} title="${escapeHtml(label)}">${renderStateRing({ state: DISPLAY_STATUS_MARKS[status] })}<span${labelAttributes ? ` ${labelAttributes}` : ""}>${escapeHtml(label)}</span></span>`;
    }
    function renderVisibleGoalStatus(item: Pick<GoalsTreeItem, "status" | "display_status"> & { status_label?: string }, attributes = "", labelAttributes = ""): string {
        const status = visibleGoalStatus(item);
        if (status === "archived" || status === "trashed") {
            return renderStatus(status, attributes, labelAttributes);
        }
        const label = item.status_label ? translate(item.status_label) : goalDisplayStatusLabel(status as GoalDisplayStatus); // The projection words it in Chinese (VUX-40).
        const state = item.status === "executing" && status === "in_progress" ? "running" : DISPLAY_STATUS_MARKS[status as GoalDisplayStatus];
        return `<span class="goal-status goal-status--${status}"${attributes ? ` ${attributes}` : ""} title="${escapeHtml(label)}">${renderStateRing({ state })}<span${labelAttributes ? ` ${labelAttributes}` : ""}>${escapeHtml(label)}</span></span>`;
    }
    function visibleGoalStatusIcon(item: Pick<GoalsTreeItem, "status" | "display_status">): string {
        const status = visibleGoalStatus(item);
        return renderStateRing({ state: status === "archived" || status === "trashed"
            ? STATUS_MARKS[status]
            : item.status === "executing" && status === "in_progress" ? "running" : DISPLAY_STATUS_MARKS[status] });
    }
    return { renderStatus, renderActionStatus, renderVisibleGoalStatus, visibleGoalStatusIcon };
}
export type GoalsStatusRenderer = ReturnType<typeof createStatusRenderer>;
export const GOALS_STATUS_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.status.v1";
export type GoalsStatusUiModel = {
    primitives: GoalsStatusPrimitives;
} & ({
    kind: "status";
    args: Parameters<GoalsStatusRenderer["renderStatus"]>;
} | {
    kind: "action";
    args: Parameters<GoalsStatusRenderer["renderActionStatus"]>;
} | {
    kind: "visible";
    args: Parameters<GoalsStatusRenderer["renderVisibleGoalStatus"]>;
} | {
    kind: "icon";
    args: Parameters<GoalsStatusRenderer["visibleGoalStatusIcon"]>;
});
/** Which surface each renderer method mounts (W5-06): the shell builds its renderer from this, and the descriptor lists these. */
export const GOALS_STATUS_UI_SURFACES = { renderStatus: "status", renderActionStatus: "action", renderVisibleGoalStatus: "visible", visibleGoalStatusIcon: "icon" } as const satisfies Record<keyof GoalsStatusRenderer, GoalsStatusUiModel["kind"]>;
export const goalsStatusUiContribution: UiContribution<GoalsStatusUiModel> = {
    descriptor: {
        contribution_id: GOALS_STATUS_UI_CONTRIBUTION_ID, kind: "embedded", label: "Goal status",
        surfaces: Object.values(GOALS_STATUS_UI_SURFACES).map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })), slots: [],
    },
    render({ surface, model }) {
        if (surface !== model.kind)
            throw new Error("Goals status surface does not match its model");
        const renderer = createStatusRenderer(model.primitives);
        switch (model.kind) {
            case "status": return renderer.renderStatus(...model.args);
            case "action": return renderer.renderActionStatus(...model.args);
            case "visible": return renderer.renderVisibleGoalStatus(...model.args);
            case "icon": return renderer.visibleGoalStatusIcon(...model.args);
        }
    },
};
