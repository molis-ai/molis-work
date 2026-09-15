import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalDisplayStatus } from "./tree-order.js";
import type { GoalPresentationState } from "./tree-order.js";
import type { GoalsTreeItem } from "./tree-ui-model.js";
import { visibleGoalStatus } from "./tree-presentation.js";
import { createGoalStateExplainer, type GoalStatusTranslate } from "./goal-state-explanation.js";
import { createGoalActionPresenter } from "./action-presentation.js";
export type GoalStatusIcon = "waiting" | "user" | "tree" | "play" | "blocked" | "ready" | "completed" | "review" | "refresh" | "alert" | "archive";
export interface GoalsStatusPrimitives {
    translate: GoalStatusTranslate;
    escapeHtml(value: string): string;
    icon(name: GoalStatusIcon): string;
}
const STATUS_ICONS: Record<GoalPresentationState, GoalStatusIcon> = {
    waiting_for_human: "user",
    executing: "play",
    execution_blocked: "blocked",
    execution_pending: "ready",
    satisfied: "completed",
    invalidated: "alert",
    trashed: "archive",
    archived: "archive",
};
const DISPLAY_STATUS_ICONS: Record<GoalDisplayStatus, GoalStatusIcon> = {
    continue: "ready",
    in_progress: "play",
    waiting_user: "user",
    waiting: "waiting",
    blocked: "blocked",
    completed: "completed",
};
function createStatusRenderer(primitives: GoalsStatusPrimitives) {
    const { translate, escapeHtml, icon } = primitives;
    const { explainWorkState } = createGoalStateExplainer(translate);
    const { goalDisplayStatusLabel } = createGoalActionPresenter(translate);
    function renderStatus(status: GoalPresentationState, attributes = "", labelAttributes = ""): string {
        const explanation = explainWorkState(status);
        return `<span class="goal-status goal-status--${status}"${attributes ? ` ${attributes}` : ""} title="${escapeHtml(explanation.meaning)}">${icon(STATUS_ICONS[status])}<span${labelAttributes ? ` ${labelAttributes}` : ""}>${escapeHtml(explanation.label)}</span></span>`;
    }
    function renderActionStatus(status: GoalDisplayStatus, attributes = "", labelAttributes = ""): string {
        const label = goalDisplayStatusLabel(status);
        return `<span class="goal-status goal-status--${status}"${attributes ? ` ${attributes}` : ""} title="${escapeHtml(label)}">${icon(DISPLAY_STATUS_ICONS[status])}<span${labelAttributes ? ` ${labelAttributes}` : ""}>${escapeHtml(label)}</span></span>`;
    }
    function renderVisibleGoalStatus(item: Pick<GoalsTreeItem, "status" | "display_status"> & { status_label?: string }, attributes = "", labelAttributes = ""): string {
        const status = visibleGoalStatus(item);
        if (status === "archived" || status === "trashed") {
            return renderStatus(status, attributes, labelAttributes);
        }
        if (item.status_label) {
            return `<span class="goal-status goal-status--${status}"${attributes ? ` ${attributes}` : ""} title="${escapeHtml(item.status_label)}">${icon(DISPLAY_STATUS_ICONS[status as GoalDisplayStatus])}<span${labelAttributes ? ` ${labelAttributes}` : ""}>${escapeHtml(item.status_label)}</span></span>`;
        }
        return renderActionStatus(status as GoalDisplayStatus, attributes, labelAttributes);
    }
    function visibleGoalStatusIcon(item: Pick<GoalsTreeItem, "status" | "display_status">): string {
        const status = visibleGoalStatus(item);
        return icon(status === "archived" || status === "trashed"
            ? STATUS_ICONS[status]
            : DISPLAY_STATUS_ICONS[status]);
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
export const goalsStatusUiContribution: UiContribution<GoalsStatusUiModel> = {
    descriptor: {
        contribution_id: GOALS_STATUS_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.goals", kind: "embedded", label: "Goal status",
        surfaces: ["status", "action", "visible", "icon"].map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })), slots: [],
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
