import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalsMomentumItem, GoalsMomentumBoardView, GoalsMomentumUiPrimitives } from "./momentum-ui-model.js";
import { sortGoalTreeItems } from "./tree-order.js";
import { buildGoalMomentumView } from "./momentum-view.js";

export const GOALS_MOMENTUM_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.momentum.v1";

function createMomentumRenderer(primitives: GoalsMomentumUiPrimitives) {
  const { translate: L, escapeHtml, icon, renderVisibleGoalStatus } = primitives;
  function renderGoalMomentum(view: GoalsMomentumBoardView, selectedGoalId: string, items: readonly GoalsMomentumItem[]): string {
    const byId = new Map(items.map((item) => [item.goal.goal_id, item]));
  const momentum = buildGoalMomentumView(
    items.map((item) => ({
      goal_id: item.goal.goal_id,
      title: item.goal.title,
      status: item.status,
      work_state: item.work_state ?? item.status,
      display_status: item.display_status,
      priority: item.goal.priority,
      created_at: item.goal.created_at,
      updated_at: item.goal.updated_at,
      completed: item.goal.fulfillment_state === "satisfied" || item.status === "archived" || item.work_state === "archived",
      acceptance_criteria_count: item.goal.acceptance_criteria.length,
      passed_criteria_count: item.passed_criteria.length,
      reasons: (item.reasons ?? []).map((reason) => ({ code: reason.code })),
      runs: item.runs.map((run) => ({
        role: run.role,
        state: run.state,
        started_at: run.started_at,
        ended_at: run.ended_at,
      })),
      evidence: item.evidence.map((evidence) => ({ captured_at: evidence.captured_at })),
      reviews: item.reviews.map((review) => ({ submitted_at: review.submitted_at })),
      risks: item.risks.map((risk) => ({
        risk_id: risk.risk_id,
        state: risk.state,
        blocking_mode: risk.blocking_mode,
        created_at: risk.created_at,
        updated_at: risk.updated_at,
      })),
      events: item.events.map((event) => ({ type: event.type, at: event.at })),
    })),
    view.snapshot.relations,
    selectedGoalId,
  );
    const preferred = sortGoalTreeItems([...items]).find(item => item.display_status === "continue" && (item.goal.decomposition_state !== "closed_compound" || item.event_work))
      || items.find(item => item.display_status === "in_progress") || byId.get(selectedGoalId) || items[0];
    const edges = momentum.edges.map((edge) => `<g data-graph-edge data-edge-from="${escapeHtml(edge.provider_goal_id)}" data-edge-to="${escapeHtml(edge.consumer_goal_id)}"><path marker-end="url(#momentum-arrow)"></path><title>${escapeHtml(`${byId.get(edge.provider_goal_id)?.goal.title} → ${byId.get(edge.consumer_goal_id)?.goal.title} · ${edge.reason}`)}</title></g>`).join("");
    const nodes = momentum.nodes.map((node) => {
      const item = byId.get(node.goal_id)!;
      const parent = view.snapshot.relations.find((relation) => relation.state === "active" && relation.type === "part_of" && relation.from_goal_id === node.goal_id);
      const parentTitle = parent ? byId.get(parent.to_goal_id)?.goal.title : "";
      return `<article tabindex="0" role="group" class="goal-canvas-node${node.completed ? " is-complete" : ""}" data-graph-node data-momentum-node data-goal-id="${escapeHtml(node.goal_id)}" data-node-x="${node.level * 340 + 40}" data-node-y="${node.row * 232 + 70}" aria-label="${escapeHtml(L("选择 Goal：{title}", { title: node.title }))}">
        ${renderVisibleGoalStatus(item)}<button class="goal-canvas-frame" type="button" data-graph-frame aria-label="${escapeHtml(L("打开 Frame：{title}", { title: node.title }))}" title="${L("打开 Frame")}">${icon("frame")}</button><button class="goal-canvas-open" type="button" data-graph-open aria-label="${escapeHtml(L("展开 Goal：{title}", { title: node.title }))}" title="${L("打开 Goal")}">${icon("maximize")}</button><strong>${escapeHtml(node.title)}</strong>
        <span class="goal-canvas-node-outcome">${escapeHtml(item.goal.outcome || L("还没有写清预期结果"))}</span>
        ${parentTitle ? `<small>${escapeHtml(L("属于：{title}", { title: parentTitle }))}</small>` : ""}
      </article>`;
    }).join("");
    const integrityCount = Object.values(momentum.integrity).reduce((count, values) => count + values.length, 0);
    return `<section class="goal-momentum goal-canvas-map" id="goal-momentum-pane" data-goal-momentum data-loaded="true" data-default-goal="${escapeHtml(preferred?.goal.goal_id || "")}" aria-label="${L("Goal 关系画布")}">
      <header class="goal-canvas-map-heading"><h1>${L("目标关系")}</h1><p>${L("{count} 个目标 · 箭头从前置成果指向后续工作", { count: nodes ? momentum.nodes.length : 0 })}</p>${integrityCount ? `<p role="status">${L("部分关系不完整，已保留可读取的目标。")}</p>` : ""}</header>
      <div class="goal-canvas-viewport" data-graph-viewport tabindex="0" aria-label="${L("拖动空白处移动画布，方向键平移，加减键缩放")}">
        <div class="goal-canvas-world" data-graph-stage data-graph-scale="1"><svg class="goal-canvas-edges" data-graph-edges aria-hidden="true"><defs><marker id="momentum-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>${edges}</svg>${nodes}</div>
      </div>
      ${nodes ? "" : `<div class="goal-canvas-empty"><h2>${L("还没有目标")}</h2><p>${L("创建第一条 Goal，从想要的结果开始。")}</p><button type="button" data-open-create>${L("创建 Goal")}</button></div>`}
      <footer class="goal-canvas-tools"><span>${L("单击看血缘 · 双击或右上角打开")}</span><div role="group" aria-label="${L("画布缩放")}"><button type="button" data-graph-zoom="out" aria-label="${L("缩小")}">−</button><output data-graph-zoom-value>100%</output><button type="button" data-graph-zoom="in" aria-label="${L("放大")}">+</button><button type="button" data-graph-zoom="fit" aria-label="${L("适应全部目标")}">${icon("maximize")}</button></div></footer>
      <p data-goal-momentum-status role="status" hidden></p><button type="button" data-retry-goal-momentum hidden>${L("重试")}</button>
    </section>`;
  }
  function renderMomentumPlaceholder(): string {
    return `<section class="goal-momentum goal-canvas-map" id="goal-momentum-pane" data-goal-momentum data-loaded="false" aria-label="${L("Goal 关系画布")}"><p class="goal-canvas-loading" data-goal-momentum-status role="status">${L("正在读取目标关系…")}</p><button type="button" data-retry-goal-momentum hidden>${L("重试")}</button></section>`;
  }
  return { renderGoalMomentum, renderMomentumPlaceholder };
}
export type GoalsMomentumRenderer = ReturnType<typeof createMomentumRenderer>;
export type GoalsMomentumUiModel = { primitives: GoalsMomentumUiPrimitives } & (
  | { kind: "momentum"; args: Parameters<GoalsMomentumRenderer["renderGoalMomentum"]> }
  | { kind: "placeholder"; args: [] }
);
export const goalsMomentumUiContribution: UiContribution<GoalsMomentumUiModel> = {
  descriptor: {
    contribution_id: GOALS_MOMENTUM_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.goals", kind: "embedded", label: "Goal momentum",
    surfaces: ["momentum", "placeholder"].map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })), slots: [],
  },
  render({ surface, model }) {
    if (surface !== model.kind) throw new Error("Goals momentum surface does not match its model");
    const renderer = createMomentumRenderer(model.primitives);
    return model.kind === "momentum" ? renderer.renderGoalMomentum(...model.args) : renderer.renderMomentumPlaceholder();
  },
};
