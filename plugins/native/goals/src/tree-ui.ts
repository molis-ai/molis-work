import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalCollectionModel } from "./collection-model.js";
import type { GoalsTreeItem, GoalsTreeView, GoalsTreeUiPrimitives, GoalVisibleStatus } from "./tree-ui-model.js";
import { sortGoalTreeItems as sortGoals } from "./tree-order.js";
import { treeDependencySearchText } from "./tree-presentation.js";
import { activeOutgoingDependsOn, findGoalTreeItem as findGoalView, goalWorkSatisfied, isBlockedWorkStatus, unsatisfiedOutgoingDependencies, goalTreeReferenceLabels, visibleGoalStatus } from "./tree-presentation.js";

export const GOALS_TREE_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.tree.v1";

function createTreeRenderer(primitives: GoalsTreeUiPrimitives) {
  const { translate: L, escapeHtml, currentLocale, listJoin, icon, renderStatus, renderActionStatus, renderVisibleGoalStatus, displayStatuses: GOAL_DISPLAY_STATUSES } = primitives;
  function renderGoalRootEntry(count: number, active: boolean): string {
    return `<button class="desktop-module-item${active ? " is-current" : ""}" type="button" data-directory-open="goals" data-work-surface-open="goal"${active ? ' aria-current="page"' : ""}>${icon("target")}<span><strong>Goals</strong><small>${L("{count} 个 Goal", { count: count })}</small></span>${icon("chevron-right")}</button>`;
  }
function quotedGoalNames(names: string[]): string {
  const quote = currentLocale() === "en" ? ["“", "”"] as const : ["「", "」"] as const;
  return listJoin(names.map((name) => `${quote[0]}${name}${quote[1]}`));
}


function renderTreeDependencies(item: GoalsTreeItem, view: GoalsTreeView): string {
  const relations = activeOutgoingDependsOn(item);
  if (!relations.length) return "";
  const targets = relations.map((relation) => ({
    relation,
    target: findGoalView(view, relation.to_goal_id),
  }));
  const waiting = targets.filter(({ target }) => !target || !goalWorkSatisfied(target));
  const blocked = waiting.filter(({ target }) => target && isBlockedWorkStatus(target.status));
  const tone = blocked.length ? "is-blocked" : waiting.length ? "is-waiting" : "is-ready";
  const health = blocked.length
    ? L("{count} 个阻塞", { count: blocked.length })
    : waiting.length
      ? L("{count} 个未完成", { count: waiting.length })
      : L("已就绪");
  return `<details class="tree-relations ${tone}" data-tree-relations>
    <summary aria-label="${L("查看 {count} 个前置依赖", { count: relations.length })}">
      <span class="tree-relations-mark" aria-hidden="true">${icon("link")}</span>
      <strong>${L("{count} 个前置", { count: relations.length })}</strong>
      <em>${escapeHtml(health)}</em>
      ${icon("chevron-down")}
    </summary>
    <div class="tree-deps">${targets
    .map(({ relation, target }) => {
      const title = target?.goal.title ?? relation.to_goal_id;
      const satisfied = target ? goalWorkSatisfied(target) : false;
      const blocked = Boolean(target && isBlockedWorkStatus(target.status));
      const waiters = target && !satisfied ? unsatisfiedOutgoingDependencies(target, view) : [];
      const state = satisfied ? "is-ready" : blocked ? "is-blocked" : "is-waiting";
      const statusLine = satisfied
        ? L("已完成，不再挡住")
        : waiters.length
          ? `${L("还在等它完成")} · ${L("它还要等 {names}", { names: quotedGoalNames(waiters.map((waiter) => waiter.goal.title)) })}`
          : L("还在等它完成");
      return `<button class="tree-dep ${state}" type="button" data-select-goal="${escapeHtml(relation.to_goal_id)}" aria-label="${L("打开依赖")} ${escapeHtml(title)}">
        <span class="tree-dep-mark" aria-hidden="true">${icon("link")}</span>
        <span class="tree-dep-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(relation.reason)}</small></span>
        <em>${escapeHtml(statusLine)}</em>
      </button>`;
    })
    .join("")}</div>
  </details>`;
}

function renderTreeChildProgress(children: readonly GoalsTreeItem[]): string {
  if (!children.length) return "";
  const done = children.filter(goalWorkSatisfied).length;
  const blocked = children.filter((child) => isBlockedWorkStatus(child.status)).length;
  const progress = Math.round((done / children.length) * 100);
  const label = blocked
    ? L("{done}/{total} 完成，{blocked} 个阻塞", { done, total: children.length, blocked })
    : L("{done}/{total} 完成", { done, total: children.length });
  return `<span class="tree-progress${blocked ? " is-blocked" : ""}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
    <span>${done}/${children.length}</span><i aria-hidden="true"><b style="--tree-progress:${progress}%"></b></i>
  </span>`;
}

function renderGoalTree(
  view: GoalsTreeView,
  selectedGoalId: string,
  items: readonly GoalsTreeItem[] = view.goals,
  rootToken = "data-tree-root",
): string {
  const referenceLabels = goalTreeReferenceLabels(view.goals.map((item) => item.goal.goal_id));
  const byId = new Map(items.map((item) => [item.goal.goal_id, item]));
  const children = new Map<string, GoalsTreeItem[]>();
  const parent = new Map<string, string>();
  for (const relation of view.snapshot.relations) {
    if (
      relation.state !== "active" ||
      relation.type !== "part_of" ||
      !byId.has(relation.from_goal_id) ||
      !byId.has(relation.to_goal_id)
    ) continue;
    parent.set(relation.from_goal_id, relation.to_goal_id);
    children.set(relation.to_goal_id, [
      ...(children.get(relation.to_goal_id) ?? []),
      byId.get(relation.from_goal_id)!,
    ]);
  }
  const visited = new Set<string>();
  const renderNode = (item: GoalsTreeItem, depth: number): string => {
    if (visited.has(item.goal.goal_id)) return "";
    visited.add(item.goal.goal_id);
    const nodeChildren = sortGoals(children.get(item.goal.goal_id) ?? []);
    const hasChildren = nodeChildren.length > 0;
    const searchValue = `${item.goal.goal_id} ${item.goal.title} ${treeDependencySearchText(item, view)}`.toLowerCase();
    const selected = item.goal.goal_id === selectedGoalId;
    const referenceLabel = referenceLabels.get(item.goal.goal_id) ?? null;
    const reference = referenceLabel == null
      ? ""
      : `<small title="Goal ID: ${escapeHtml(item.goal.goal_id)}" aria-label="${L("Goal 编号")} ${escapeHtml(referenceLabel)}">${escapeHtml(referenceLabel)}</small>`;
    return `<li class="tree-item${depth > 0 ? "" : " tree-item--root"}" data-tree-item data-goal-id="${escapeHtml(item.goal.goal_id)}" data-goal-search="${escapeHtml(searchValue)}" data-goal-status="${escapeHtml(visibleGoalStatus(item))}">
      <div class="tree-row">
        ${
          hasChildren
            ? `<button class="tree-toggle" type="button" data-tree-toggle aria-expanded="true" aria-label="${L("折叠")} ${escapeHtml(item.goal.title)}">${icon("chevron-down")}</button>`
            : `<span class="tree-guide" aria-hidden="true"></span>`
        }
        <div class="tree-entry directory-list-row${selected ? " is-selected" : ""}">
          <button class="tree-node${selected ? " is-selected" : ""}" type="button" draggable="true" data-frame-asset="goal" data-frame-asset-id="${escapeHtml(item.goal.goal_id)}" data-select-goal="${escapeHtml(item.goal.goal_id)}" aria-pressed="${selected}">
            <span class="tree-copy"><span class="tree-title-line"><strong title="${escapeHtml(item.goal.title)}">${escapeHtml(item.goal.title)}</strong></span>${reference}</span>
          </button>
          <span class="directory-row-state">${renderVisibleGoalStatus(item)}</span>
          <span class="tree-meta-line">${renderTreeChildProgress(nodeChildren)}${renderTreeDependencies(item, view)}</span>
        </div>
      </div>
      ${hasChildren ? `<ul class="tree-children">${nodeChildren.map((child) => renderNode(child, depth + 1)).join("")}</ul>` : ""}
    </li>`;
  };
  const roots = sortGoals(items.filter((item) => !parent.has(item.goal.goal_id)));
  const rendered = roots.map((item) => renderNode(item, 0)).join("");
  const leftovers = sortGoals(items.filter((item) => !visited.has(item.goal.goal_id)))
    .map((item) => renderNode(item, 0))
    .join("");
  return `<ul class="goal-tree" ${rootToken}>${rendered}${leftovers}</ul>`;
}

function renderTreeStatusFilter(items: readonly GoalsTreeItem[]): string {
  const counts = new Map<GoalVisibleStatus, number>();
  for (const item of items) {
    const status = visibleGoalStatus(item);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const options = [...GOAL_DISPLAY_STATUSES, "archived", "trashed"]
    .filter((status): status is GoalVisibleStatus => (counts.get(status as GoalVisibleStatus) ?? 0) > 0);
  return `<section class="tree-filter" id="tree-status-filter" data-tree-filter hidden aria-label="${L("按状态筛选")}">
    <header><strong>${L("按状态筛选")}</strong><button type="button" data-clear-status-filter disabled>${L("清除")}</button></header>
    <p>${L("可同时选择多个状态。")}</p>
    <div class="tree-filter-options" role="group" aria-label="${L("Goal 状态")}">
      ${options.length ? options.map((status) => `<label class="tree-filter-option"><input type="checkbox" value="${status}" data-status-filter><span>${status === "archived" || status === "trashed" ? renderStatus(status) : renderActionStatus(status)}</span><small>${counts.get(status)}</small></label>`).join("") : `<p class="empty-row">${L("当前没有可筛选的 Goal。")}</p>`}
    </div>
    <p class="tree-filter-summary" data-tree-filter-summary aria-live="polite">${L("显示全部状态")}</p>
  </section>`;
}

function renderCollectionFold(
  view: GoalsTreeView,
  selectedId: string,
  kind: "current" | "archive" | "trash",
  items: readonly GoalsTreeItem[],
  open: boolean,
): string {
  const title = kind === "current" ? L("当前") : kind === "archive" ? L("归档") : L("回收站");
  const empty = kind === "current" ? L("还没有 Goal") : kind === "archive" ? L("没有已归档的 Goal") : L("回收站是空的");
  const persist = kind === "current" ? "goal-collection-current" : kind === "archive" ? "goal-collection-archive" : "goal-collection-trash";
  const treeToken = kind === "current" ? "data-tree-root" : `data-collection-tree="${kind}"`;
  const tree = items.length ? renderGoalTree(view, selectedId, items, treeToken) : "";
  const filterEmpty = kind === "current"
    ? `<div class="tree-filter-empty" data-tree-filter-empty hidden><p>${L("没有符合当前筛选条件的 Goal。")}</p><button type="button" data-clear-tree-filter>${L("清除所有筛选")}</button></div>`
    : "";
  const body = items.length ? `${tree}${filterEmpty}` : `<p class="goal-collection-empty">${empty}</p>`;
  return `<details class="goal-collection-fold" data-goal-collection-fold="${kind}" data-persist-open="${persist}"${open ? " open data-collection-open" : ""}>
    <summary>
      <span class="goal-collection-caret" aria-hidden="true">${icon("chevron-down")}</span>
      <strong>${title}</strong>
      <small>${items.length}</small>
    </summary>
    ${body}
  </details>`;
}

function selectedInCollection(selectedId: string, items: readonly GoalsTreeItem[]): boolean {
  return Boolean(selectedId) && items.some((item) => item.goal.goal_id === selectedId);
}

function selectedOutsideCurrentTree(view: GoalsTreeView, selectedId: string, items: readonly GoalsTreeItem[]): boolean {
  return Boolean(selectedId)
    && !selectedInCollection(selectedId, view.goals)
    && selectedInCollection(selectedId, items);
}

function renderGoalList(view: GoalsTreeView, selectedId: string, archiveView: boolean, trashView: boolean): string {
  const currentOpen = selectedInCollection(selectedId, view.goals) || (!archiveView && !trashView);
  const archiveOpen = archiveView || selectedOutsideCurrentTree(view, selectedId, view.archived_goals);
  const trashOpen = trashView || selectedOutsideCurrentTree(view, selectedId, view.trashed_goals);
  return `${renderCollectionFold(view, selectedId, "current", view.goals, currentOpen)}${renderCollectionFold(view, selectedId, "archive", view.archived_goals, archiveOpen)}${renderCollectionFold(view, selectedId, "trash", view.trashed_goals, trashOpen)}`;
}

function renderTreeChrome(view: GoalsTreeView): string {
  return `<header class="tree-chrome" data-tree-chrome data-directory-list-actions>
    <div class="tree-tools">
      <button class="tree-create" type="button" data-open-create>${icon("plus")}<span>${L("新建 Goal")}</span></button>
      <div class="tree-filter-control">
        <button class="tree-filter-trigger" type="button" data-tree-filter-trigger aria-expanded="false" aria-controls="tree-status-filter" aria-label="${L("筛选目标")}" title="${L("筛选目标")}">${icon("filter")}<span>${L("状态")}</span></button>
        ${renderTreeStatusFilter(view.goals)}
      </div>
    </div>
  </header>`;
}

function renderTreeFooter(view: GoalsTreeView, collection: GoalCollectionModel<GoalsTreeItem>): string {
  const { collectionSuffix, collectionNote } = collection;
  return `<footer class="tree-footer" data-tree-footer><span data-tree-filter-count data-tree-suffix="${escapeHtml(collectionSuffix)}">${L("共 {count} 个{suffix}目标", { count: view.goals.length, suffix: "" })}</span><small>${collectionNote}</small></footer>`;
}

function renderGoalStageList(view: GoalsTreeView, collection: GoalCollectionModel<GoalsTreeItem>): string {
  const { selectedId, archiveView, trashView } = collection;
  return `<div class="goal-stage-list" data-goal-stage-list data-tree-scroll tabindex="0" aria-label="${L("目标列表")}"><div class="goal-list-view" data-goal-list-view>${renderGoalList(view, selectedId, archiveView, trashView)}</div></div>`;
}

function renderGoalDirectory(view: GoalsTreeView, collection: GoalCollectionModel<GoalsTreeItem>, initiallyOpen: boolean): string {
  const { collectionTitle } = collection;
  return `<section class="desktop-directory-panel desktop-goal-directory" data-directory-panel="goals"${initiallyOpen ? "" : " hidden"}>
          <header class="desktop-directory-heading"><button type="button" data-directory-back aria-label="${L("返回上一级")}">${icon("back")}</button><span><strong>${collectionTitle === L("Goal Tree") ? "Goals" : collectionTitle}</strong><small>${L("Goal Tree")}</small></span></header>
          ${renderTreeChrome(view)}
          ${renderTreeFooter(view, collection)}
        </section>`;
}

function renderGoalRefreshDirectory(view: GoalsTreeView, collection: GoalCollectionModel<GoalsTreeItem>): string {
  const { selectedId, archiveView, trashView } = collection;
  return `<div data-refresh-tree-chrome hidden>${renderTreeChrome(view)}</div>
    <div data-tree-scroll>${renderGoalList(view, selectedId, archiveView, trashView)}</div>
    ${renderTreeFooter(view, collection)}`;
}

  return { renderGoalTree, renderTreeChrome, renderGoalDirectory, renderGoalRefreshDirectory, renderGoalStageList, renderGoalRootEntry };
}
export type GoalsTreeRenderer = ReturnType<typeof createTreeRenderer>;
export type GoalsTreeUiModel = { primitives: GoalsTreeUiPrimitives } & (
  | { kind: "root-entry"; args: Parameters<GoalsTreeRenderer["renderGoalRootEntry"]> }
  | { kind: "tree"; args: Parameters<GoalsTreeRenderer["renderGoalTree"]> }
  | { kind: "chrome"; args: Parameters<GoalsTreeRenderer["renderTreeChrome"]> }
  | { kind: "directory"; args: Parameters<GoalsTreeRenderer["renderGoalDirectory"]> }
  | { kind: "refresh"; args: Parameters<GoalsTreeRenderer["renderGoalRefreshDirectory"]> }
  | { kind: "stage-list"; args: Parameters<GoalsTreeRenderer["renderGoalStageList"]> }
);
export const goalsTreeUiContribution: UiContribution<GoalsTreeUiModel> = {
  descriptor: {
    contribution_id: GOALS_TREE_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.goals",
    kind: "embedded", label: "Goal Tree",
    surfaces: ["root-entry", "tree", "chrome", "directory", "refresh", "stage-list"].map(surface_id => ({ surface_id, target_slot_id: "workbench.directory", format: "declarative-html" })),
    slots: [],
  },
  render({ surface, model }) {
    if (surface !== model.kind) throw new Error("Goals tree surface does not match its model");
    const renderer = createTreeRenderer(model.primitives);
    switch (model.kind) {
      case "root-entry": return renderer.renderGoalRootEntry(...model.args);
      case "tree": return renderer.renderGoalTree(...model.args);
      case "chrome": return renderer.renderTreeChrome(...model.args);
      case "directory": return renderer.renderGoalDirectory(...model.args);
      case "refresh": return renderer.renderGoalRefreshDirectory(...model.args);
      case "stage-list": return renderer.renderGoalStageList(...model.args);
    }
  },
};
