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
  items: GoalsTreeItem[] = view.goals,
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
  return `<ul class="goal-tree" data-tree-root>${rendered}${leftovers}</ul>`;
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
    <p>${L("可同时选择多个状态；会与关键词搜索一起生效。")}</p>
    <div class="tree-filter-options" role="group" aria-label="${L("Goal 状态")}">
      ${options.length ? options.map((status) => `<label class="tree-filter-option"><input type="checkbox" value="${status}" data-status-filter><span>${status === "archived" || status === "trashed" ? renderStatus(status) : renderActionStatus(status)}</span><small>${counts.get(status)}</small></label>`).join("") : `<p class="empty-row">${L("当前没有可筛选的 Goal。")}</p>`}
    </div>
    <p class="tree-filter-summary" data-tree-filter-summary aria-live="polite">${L("显示全部状态")}</p>
  </section>`;
}

function renderTreeChrome(
  view: GoalsTreeView,
  visibleGoals: readonly GoalsTreeItem[],
  archiveView: boolean,
  trashView: boolean,
  searchPlaceholder: string,
  searchLabel: string,
): string {
  const archiveHref = archiveView ? "/" : "/archive";
  const trashHref = trashView ? "/" : "/trash";
  const archiveLabel = archiveView ? L("返回 Goal Tree") : L("查看已归档 Goal");
  const trashLabel = trashView ? L("返回 Goal Tree") : L("查看回收站");
  const archiveCount = archiveView ? "" : `<small>${view.archived_goals.length}</small>`;
  const trashCount = trashView ? "" : `<small>${view.trashed_goals.length}</small>`;
  const archiveText = archiveView ? L("返回") : L("归档");
  const trashText = trashView ? L("返回") : L("回收站");
  return `<header class="tree-chrome" data-tree-chrome>
    ${!archiveView && !trashView ? `<div class="navigator-view-switch" role="tablist" aria-label="${L("Goal 视图")}">
      <button class="is-active" type="button" role="tab" aria-selected="true" data-navigator-view="list">${icon("list")}<span>${L("目标工作区")}</span></button>
      <button type="button" role="tab" aria-selected="false" data-navigator-view="graph">${icon("workflow")}<span>${L("关系画布")}</span></button>
    </div>` : ""}
    <label class="tree-search">${icon("search")}<input type="search" data-global-search placeholder="${searchPlaceholder}" aria-label="${searchLabel}"><kbd>⌘F</kbd></label>
    <div class="tree-tools">
      <div class="tree-filter-control">
        <button class="tree-tool" type="button" data-tree-filter-trigger aria-expanded="false" aria-controls="tree-status-filter" aria-label="${L("筛选目标")}" title="${L("筛选目标")}">${icon("filter")}<span>${L("状态")}</span></button>
        ${renderTreeStatusFilter(visibleGoals)}
      </div>
        <button class="tree-tool" type="button" data-open-create aria-label="${L("新建目标")}" title="${L("新建目标")}">${icon("plus")}<span>${L("新建")}</span></button>
      <a class="tree-tool${archiveView ? " is-current" : ""}" data-archive-link href="${archiveHref}" aria-label="${archiveLabel}" title="${archiveLabel}"${archiveView ? ' aria-current="page"' : ""}>${icon(archiveView ? "tree" : "archive")}<span>${archiveText}</span>${archiveCount}</a>
      <a class="tree-tool${trashView ? " is-current" : ""}" data-trash-link href="${trashHref}" aria-label="${trashLabel}" title="${trashLabel}"${trashView ? ' aria-current="page"' : ""}>${icon(trashView ? "tree" : "trash")}<span>${trashText}</span>${trashCount}</a>
      <button class="tree-tool" type="button" data-collapse-all aria-label="${L("折叠全部")}" title="${L("折叠全部")}">${icon("tree")}<span>${L("折叠全部")}</span></button>
    </div>
  </header>`;
}



function renderGoalDirectory(view: GoalsTreeView, collection: GoalCollectionModel<GoalsTreeItem>, initiallyOpen: boolean): string {
  const { visibleGoals, selectedId, collectionTitle, collectionSuffix, collectionView, collectionNote, archiveView, trashView, searchPlaceholder, searchLabel } = collection;
  return `<section class="desktop-directory-panel desktop-goal-directory" data-directory-panel="goals"${initiallyOpen ? "" : " hidden"}>
          <header class="desktop-directory-heading"><button type="button" data-directory-back aria-label="${L("返回上一级")}">${icon("back")}</button><span><strong>${collectionTitle === L("Goal Tree") ? "Goals" : collectionTitle}</strong><small>${collectionView ? collectionNote : L("Goal Tree")}</small></span></header>
          ${renderTreeChrome(view, visibleGoals, archiveView, trashView, searchPlaceholder, searchLabel)}
          <div class="tree-scroll" data-tree-scroll tabindex="0" aria-label="${collectionTitle} ${L("目标列表")}"><div class="goal-list-view" data-goal-list-view>${renderGoalTree(view, selectedId, visibleGoals)}<div class="tree-filter-empty" data-tree-filter-empty hidden><p>${L("没有符合当前筛选条件的 Goal。")}</p><button type="button" data-clear-tree-filter>${L("清除所有筛选")}</button></div></div></div>
          <footer class="tree-footer" data-tree-footer><span data-tree-filter-count data-tree-suffix="${escapeHtml(collectionSuffix)}">${L("共 {count} 个{suffix}目标", { count: visibleGoals.length, suffix: collectionSuffix ? `${collectionSuffix} ` : "" })}</span><small>${collectionNote}</small></footer>
        </section>`;
}

function renderGoalRefreshDirectory(view: GoalsTreeView, collection: GoalCollectionModel<GoalsTreeItem>): string {
  const { visibleGoals, selectedId, collectionSuffix, collectionNote, archiveView, trashView, searchPlaceholder, searchLabel } = collection;
  const tree = `${renderGoalTree(view, selectedId, visibleGoals)}<div class="tree-filter-empty" data-tree-filter-empty hidden><p>${L("没有符合当前筛选条件的 Goal。")}</p><button type="button" data-clear-tree-filter>${L("清除所有筛选")}</button></div>`;
  return `<div data-refresh-tree-chrome hidden>${renderTreeChrome(view, visibleGoals, archiveView, trashView, searchPlaceholder, searchLabel)}</div>
    <div data-tree-scroll>${tree}</div>
    <footer data-tree-footer><span data-tree-filter-count data-tree-suffix="${escapeHtml(collectionSuffix)}">${L("共 {count} 个{suffix}目标", { count: visibleGoals.length, suffix: collectionSuffix ? `${collectionSuffix} ` : "" })}</span><small>${collectionNote}</small></footer>`;
}

  return { renderGoalTree, renderTreeChrome, renderGoalDirectory, renderGoalRefreshDirectory, renderGoalRootEntry };
}
export type GoalsTreeRenderer = ReturnType<typeof createTreeRenderer>;
export type GoalsTreeUiModel = { primitives: GoalsTreeUiPrimitives } & (
  | { kind: "root-entry"; args: Parameters<GoalsTreeRenderer["renderGoalRootEntry"]> }
  | { kind: "tree"; args: Parameters<GoalsTreeRenderer["renderGoalTree"]> }
  | { kind: "chrome"; args: Parameters<GoalsTreeRenderer["renderTreeChrome"]> }
  | { kind: "directory"; args: Parameters<GoalsTreeRenderer["renderGoalDirectory"]> }
  | { kind: "refresh"; args: Parameters<GoalsTreeRenderer["renderGoalRefreshDirectory"]> }
);
export const goalsTreeUiContribution: UiContribution<GoalsTreeUiModel> = {
  descriptor: {
    contribution_id: GOALS_TREE_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.goals",
    kind: "embedded", label: "Goal Tree",
    surfaces: ["root-entry", "tree", "chrome", "directory", "refresh"].map(surface_id => ({ surface_id, target_slot_id: "workbench.directory", format: "declarative-html" })),
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
    }
  },
};
