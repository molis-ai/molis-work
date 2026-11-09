import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalsMomentumItem, GoalsMomentumBoardView, GoalsMomentumUiPrimitives } from "./momentum-ui-model.js";
import { createKanbanRenderer } from "./kanban-ui.js";
import { sortGoalTreeItems } from "./tree-order.js";
import { buildGoalMomentumView } from "./momentum-view.js";
import type { GoalMomentumGoalInput } from "./momentum-model.js";

export const GOALS_MOMENTUM_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.momentum.v1";

/** The facts momentum reads from one Goal of the document collection. */
export function goalMomentumInput(item: GoalsMomentumItem): GoalMomentumGoalInput {
  return {
    goal_id: item.goal.goal_id,
    title: item.goal.title,
    status: item.status,
    work_state: item.work_state ?? item.status,
    display_status: item.display_status,
    priority: item.goal.priority,
    created_at: item.goal.created_at,
    updated_at: item.goal.updated_at,
    completed: item.goal.fulfillment_state === "satisfied" || item.status === "archived" || item.work_state === "archived",
    reasons: (item.reasons ?? []).map((reason) => ({ code: reason.code })),
    events: item.events.map((event) => ({ type: event.type, at: event.at, payload: event.payload })),
  };
}

function createMomentumRenderer(primitives: GoalsMomentumUiPrimitives) {
  const { escapeHtml, icon, renderVisibleGoalStatus } = primitives;
  function renderGoalMomentum(view: GoalsMomentumBoardView, selectedGoalId: string, items: readonly GoalsMomentumItem[]): string {
    const byId = new Map(items.map((item) => [item.goal.goal_id, item]));
    const momentum = buildGoalMomentumView(items.map(goalMomentumInput), view.snapshot.relations, selectedGoalId);
    const preferred = sortGoalTreeItems([...items]).find(item => item.display_status === "continue" && (item.goal.decomposition_state !== "closed_compound" || item.event_work))
      || items.find(item => item.display_status === "in_progress") || byId.get(selectedGoalId) || items[0];
    const edges = momentum.edges.map((edge) => `<g data-graph-edge data-edge-from="${escapeHtml(edge.provider_goal_id)}" data-edge-to="${escapeHtml(edge.consumer_goal_id)}"><path marker-end="url(#momentum-arrow)"></path><title>${escapeHtml(`${byId.get(edge.provider_goal_id)?.goal.title} → ${byId.get(edge.consumer_goal_id)?.goal.title} · ${edge.reason}`)}</title></g>`).join("");
    const nodes = momentum.nodes.map((node) => {
      const item = byId.get(node.goal_id)!;
      const parent = view.snapshot.relations.find((relation) => relation.state === "active" && relation.type === "part_of" && relation.from_goal_id === node.goal_id);
      const parentTitle = parent ? byId.get(parent.to_goal_id)?.goal.title : "";
      return `<article tabindex="0" role="group" class="goal-canvas-node${node.completed ? " is-complete" : ""}" data-graph-node data-momentum-node data-goal-id="${escapeHtml(node.goal_id)}" data-node-x="${node.level * 340 + 40}" data-node-y="${node.row * 232 + 70}" aria-label="${escapeHtml(uiText.text("goals.momentum-ui.select-goal-title", { title: node.title }))}">
        ${renderVisibleGoalStatus(item)}<button class="goal-canvas-frame" type="button" data-graph-frame aria-label="${escapeHtml(uiText.text("goals.momentum-ui.open-frame-title", { title: node.title }))}" title="${uiText("goals.momentum-ui.open-frame")}">${icon("frame")}</button><button class="goal-canvas-open" type="button" data-graph-open aria-label="${escapeHtml(uiText.text("goals.momentum-ui.open-goal-title", { title: node.title }))}" title="${uiText("goals.momentum-ui.open-goal")}">${icon("maximize")}</button><strong>${escapeHtml(node.title)}</strong>
        <span class="goal-canvas-node-outcome">${escapeHtml(item.goal.outcome || uiText.text("goals.momentum-ui.expected-result-has-not-been-defined"))}</span>
        ${parentTitle ? `<small>${escapeHtml(uiText.text("goals.momentum-ui.part-title", { title: parentTitle }))}</small>` : ""}
      </article>`;
    }).join("");
    const integrityCount = Object.values(momentum.integrity).reduce((count, values) => count + values.length, 0);
    return `<section class="goal-momentum goal-canvas-map" id="goal-momentum-pane" data-goal-momentum data-loaded="true" data-default-goal="${escapeHtml(preferred?.goal.goal_id || "")}" aria-label="${uiText("goals.momentum-ui.goal-relationship-canvas")}">
      ${integrityCount ? `<p class="goal-canvas-integrity" role="status">${uiText("goals.momentum-ui.some-relationships-incomplete-available-goals-still-shown")}</p>` : ""}
      <div class="goal-canvas-viewport" data-graph-viewport tabindex="0" aria-label="${uiText("goals.momentum-ui.drag-background-use-arrow-keys-pan-use-plus")}">
        <div class="goal-canvas-world" data-graph-stage data-graph-scale="1"><svg class="goal-canvas-edges" data-graph-edges aria-hidden="true"><defs><marker id="momentum-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 readText 10 5 readText 0 10 z"></path></marker></defs>${edges}</svg>${nodes}</div>
      </div>
      ${nodes ? "" : `<div class="goal-canvas-empty mw-empty" role="status"><span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-target"></use></svg></span><strong>${uiText("goals.momentum-ui.no-goals-yet")}</strong><p>${uiText("goals.momentum-ui.goals-dependencies-will-appear-here-nodes")}</p></div>`}
      <footer class="goal-canvas-tools"><div role="group" aria-label="${uiText("goals.momentum-ui.canvas-zoom")}"><button type="button" data-graph-zoom="out" aria-label="${uiText("goals.momentum-ui.zoom-out")}">−</button><output data-graph-zoom-value>100%</output><button type="button" data-graph-zoom="in" aria-label="${uiText("goals.momentum-ui.zoom")}">+</button><button type="button" data-graph-zoom="fit" aria-label="${uiText("goals.momentum-ui.fit-all-goals")}">${icon("maximize")}</button></div></footer>
      <p data-goal-momentum-status role="status" hidden></p><button class="mw-btn mw-btn--secondary" type="button" data-retry-goal-momentum hidden>${uiText("goals.momentum-ui.retry")}</button>
    </section>`;
  }
  function renderMomentumPlaceholder(): string {
    return `<section class="goal-momentum goal-canvas-map" id="goal-momentum-pane" data-goal-momentum data-loaded="false" aria-label="${uiText("goals.momentum-ui.goal-relationship-canvas")}"><p class="goal-canvas-loading mw-loading" data-goal-momentum-status role="status">${uiText("goals.momentum-ui.loading-goal-relationships")}</p><button class="mw-btn mw-btn--secondary" type="button" data-retry-goal-momentum hidden>${uiText("goals.momentum-ui.retry")}</button></section>`;
  }
  const { renderGoalKanban } = createKanbanRenderer(primitives);
  return { renderGoalMomentum, renderMomentumPlaceholder, renderGoalKanban };
}
export type GoalsMomentumRenderer = ReturnType<typeof createMomentumRenderer>;
export type GoalsMomentumUiModel = { primitives: GoalsMomentumUiPrimitives } & (
  | { kind: "momentum"; args: Parameters<GoalsMomentumRenderer["renderGoalMomentum"]> }
  | { kind: "placeholder"; args: [] }
  | { kind: "kanban"; args: Parameters<GoalsMomentumRenderer["renderGoalKanban"]> }
);
/** Which surface each renderer method mounts (W5-06): the shell builds its renderer from this, and the descriptor lists these. */
export const GOALS_MOMENTUM_UI_SURFACES = { renderGoalMomentum: "momentum", renderMomentumPlaceholder: "placeholder", renderGoalKanban: "kanban" } as const satisfies Record<keyof GoalsMomentumRenderer, GoalsMomentumUiModel["kind"]>;
export const goalsMomentumUiContribution: UiContribution<GoalsMomentumUiModel> = {
  descriptor: {
    contribution_id: GOALS_MOMENTUM_UI_CONTRIBUTION_ID, kind: "embedded", label: "Goal momentum",
    surfaces: Object.values(GOALS_MOMENTUM_UI_SURFACES).map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })), slots: [],
  },
  render({ surface, model }) {
    if (surface !== model.kind) throw new Error("Goals momentum surface does not match its model");
    const renderer = createMomentumRenderer(model.primitives);
    if (model.kind === "momentum") return renderer.renderGoalMomentum(...model.args);
    if (model.kind === "kanban") return renderer.renderGoalKanban(...model.args);
    return renderer.renderMomentumPlaceholder();
  },
};
