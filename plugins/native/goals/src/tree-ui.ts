import { format as uiFormat, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { presentationOwnerHue, renderPresentationForm } from "@molis-ai/molis-work-plugin-sdk/ui";
import { goalsPresentation } from "./presentation.js";
import { GOALS_PLUGIN_ID } from "./identity.js";
import type { GoalCollectionModel } from "./collection-model.js";
import type { GoalsTreeItem, GoalsTreeView, GoalsTreeUiPrimitives, GoalVisibleStatus } from "./tree-ui-model.js";
import { sortGoalTreeItems as sortGoals } from "./tree-order.js";
import { activeOutgoingDependsOn, findGoalTreeItem as findGoalView, goalWorkSatisfied, isBlockedWorkStatus, unsatisfiedOutgoingDependencies, goalTreeCreatorHue, goalTreeCreatorInitial, treeDependencySearchText, visibleGoalStatus } from "./tree-presentation.js";

export const GOALS_TREE_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.tree.v1";
const treeObject = { ...goalsPresentation.objects[0], owner: GOALS_PLUGIN_ID };
const treeOwner = { name: "Goals", icon: "target", hue: presentationOwnerHue(GOALS_PLUGIN_ID) } as const;

function createTreeRenderer(primitives: GoalsTreeUiPrimitives) {
  const { escapeHtml, listJoin, icon, renderStatus, renderActionStatus, renderVisibleGoalStatus, displayStatuses: GOAL_DISPLAY_STATUSES } = primitives;
  function renderGoalRootEntry(count: number, active: boolean): string {
    return `<button class="desktop-module-item${active ? " is-current" : ""}" type="button" data-work-surface-open="goals"${active ? ' aria-current="page"' : ""}>${icon("target")}<span><strong>Goals</strong><small>${uiText("goals.tree-ui.count-count", { count: count })}</small></span>${icon("chevron-right")}</button>`;
  }
function quotedGoalNames(names: string[]): string {
  const [open, close] = [uiText.text("goals.quote.open"), uiText.text("goals.quote.close")];
  return listJoin(names.map((name) => `${open}${name}${close}`));
}


function renderTreeDependencies(item: GoalsTreeItem, view: GoalsTreeView): string {
  const relations = activeOutgoingDependsOn(item);
  if (!relations.length) return `<span class="tree-relations is-empty" aria-hidden="true"></span>`;
  const targets = relations.map((relation) => ({
    relation,
    target: findGoalView(view, relation.to_goal_id),
  }));
  const waiting = targets.filter(({ target }) => !target || !goalWorkSatisfied(target));
  const blocked = waiting.filter(({ target }) => target && isBlockedWorkStatus(target.status));
  const tone = blocked.length ? "is-blocked" : waiting.length ? "is-waiting" : "is-ready";
  const health = blocked.length
    ? uiText.text("goals.tree-ui.count-blocked", { count: blocked.length })
    : waiting.length
      ? uiText.text("goals.tree-ui.count-incomplete", { count: waiting.length })
      : uiText.text("goals.tree-ui.ready");
  const countLabel = uiText.text("goals.tree-ui.count-count-2", { count: relations.length });
  const copy = waiting.length ? `${countLabel} · ${health}` : countLabel;
  return `<details class="tree-relations ${tone}" data-tree-relations>
    <summary aria-label="${uiText("goals.tree-ui.view-count-count", { count: relations.length })}">
      <span class="tree-relations-copy">${escapeHtml(copy)}</span>
    </summary>
    <div class="tree-deps">${targets
    .map(({ relation, target }) => {
      const title = target?.goal.title ?? relation.to_goal_id;
      const satisfied = target ? goalWorkSatisfied(target) : false;
      const blocked = Boolean(target && isBlockedWorkStatus(target.status));
      const waiters = target && !satisfied ? unsatisfiedOutgoingDependencies(target, view) : [];
      const state = satisfied ? "is-ready" : blocked ? "is-blocked" : "is-waiting";
      const statusLine = satisfied
        ? uiText.text("goals.tree-ui.done-no-longer-blocking")
        : waiters.length
          ? `${uiText.text("goals.tree-ui.still-waiting")} · ${uiText.text("goals.tree-ui.still-needs-names", { names: quotedGoalNames(waiters.map((waiter) => waiter.goal.title)) })}`
          : uiText.text("goals.tree-ui.still-waiting");
      return `<button class="tree-dep ${state}" type="button" data-select-goal="${escapeHtml(relation.to_goal_id)}" aria-label="${uiText("goals.tree-ui.open-dependency")} ${escapeHtml(title)}">
        <span class="tree-dep-mark" aria-hidden="true">${icon("link")}</span>
        <span class="tree-dep-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(relation.reason)}</small></span>
        <em>${escapeHtml(statusLine)}</em>
      </button>`;
    })
    .join("")}</div>
  </details>`;
}

function renderTreeProgress(item: GoalsTreeItem, children: readonly GoalsTreeItem[]): string {
  const units = children.length ? children : [item];
  const done = units.filter(goalWorkSatisfied).length;
  const blocked = units.filter((unit) => isBlockedWorkStatus(unit.status)).length;
  const progress = Math.round((done / units.length) * 100);
  const label = blocked
    ? uiText.text("goals.tree-ui.done-total-done-blocked-blocked", { done, total: units.length, blocked })
    : uiText.text("goals.tree-ui.done-total-done", { done, total: units.length });
  return `<span class="tree-progress${blocked ? " is-blocked" : ""}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
    <span>${done}/${units.length}</span><i aria-hidden="true"><b style="--tree-progress:${progress}%"></b></i>
  </span>`;
}

function renderGoalTree(
  view: GoalsTreeView,
  selectedGoalId: string,
  items: readonly GoalsTreeItem[] = view.goals,
  rootToken = "data-tree-root",
): string {
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
    const createdLabel = item.goal.created_at ? uiFormat.date(item.goal.created_at, "month-day") : "";
    const creatorId = item.created_by?.trim() || item.goal.accepted_by?.trim() || "";
    const creatorInitial = creatorId ? goalTreeCreatorInitial(creatorId) : "";
    const avatar = creatorId
      ? `<span class="tree-avatar" title="${escapeHtml(creatorId)}" aria-label="${uiText("goals.tree-ui.creator")} ${escapeHtml(creatorId)}" style="--tree-avatar-hue:${goalTreeCreatorHue(creatorId)}">${escapeHtml(creatorInitial)}</span>`
      : `<span class="tree-avatar is-unknown" aria-hidden="true"></span>`;
    const created = createdLabel
      ? `<time class="tree-created" datetime="${escapeHtml(item.goal.created_at)}" title="${escapeHtml(item.goal.created_at)}">${createdLabel}</time>`
      : `<time class="tree-created is-empty" aria-hidden="true"></time>`;
    const title = escapeHtml(item.goal.title);
    const chip = item.presentation_status && renderPresentationForm(treeObject, "chip", { locale: primitives.presentationLocale?.() ?? null,
      ownerDisplay: treeOwner, read: { state: "ok", values: { title: item.goal.title, status: item.presentation_status } } });
    const choose = (label: string) => `<button class="tree-node${selected ? " is-selected" : ""}" type="button" draggable="true"
      data-frame-asset="goal" data-frame-asset-id="${escapeHtml(item.goal.goal_id)}" data-select-goal="${escapeHtml(item.goal.goal_id)}" aria-pressed="${selected}">${label}</button>`;
    return `<li class="tree-item${depth > 0 ? "" : " tree-item--root"}" style="--tree-depth:${depth}" data-tree-item data-tree-depth="${depth}" data-goal-id="${escapeHtml(item.goal.goal_id)}" data-goal-search="${escapeHtml(searchValue)}" data-goal-status="${escapeHtml(visibleGoalStatus(item))}">
      <div class="tree-row">
        <div class="tree-entry directory-list-row${selected ? " is-selected" : ""}">
          <div class="tree-leading">
            ${
              hasChildren
                ? `<button class="tree-toggle" type="button" data-tree-toggle aria-expanded="true" aria-label="${uiText("goals.tree-ui.toggle")} ${escapeHtml(item.goal.title)}">${icon("chevron-down")}</button>`
                : `<span class="tree-guide" aria-hidden="true"></span>`
            }
            ${chip ? `<div class="tree-presentation-name" title="${title}"><div aria-hidden="true">${chip}</div>${choose(`<strong class="mw-sr-only">${title}</strong>`)}</div>`
              : choose(`<span class="tree-copy"><span class="tree-title-line"><strong title="${title}">${title}</strong></span></span>`)}
          </div>
          <span class="directory-row-state">${renderVisibleGoalStatus(item)}</span>
          ${renderTreeProgress(item, nodeChildren)}
          ${renderTreeDependencies(item, view)}
          <span class="tree-created-meta" data-select-goal="${escapeHtml(item.goal.goal_id)}">${created}${avatar}</span>
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
  return `<section class="tree-filter" id="tree-status-filter" data-tree-filter hidden aria-label="${uiText("goals.tree-ui.filter-status")}">
    <header><strong>${uiText("goals.tree-ui.filter-status")}</strong><button class="mw-btn mw-btn--link" type="button" data-clear-status-filter disabled>${uiText("goals.tree-ui.clear")}</button></header>
    <p>${uiText("goals.tree-ui.select-more-than-one-status")}</p>
    <div class="tree-filter-options" role="group" aria-label="${uiText("goals.tree-ui.goal-status")}">
      ${options.length ? options.map((status) => `<label class="tree-filter-option"><input type="checkbox" value="${status}" data-status-filter><span>${status === "archived" || status === "trashed" ? renderStatus(status) : renderActionStatus(status)}</span><small>${counts.get(status)}</small></label>`).join("") : `<p class="empty-row">${uiText("goals.tree-ui.there-no-goal-filter")}</p>`}
    </div>
    <p class="tree-filter-summary" data-tree-filter-summary aria-live="polite">${uiText("goals.tree-ui.showing-every-status")}</p>
  </section>`;
}

function renderCollectionFold(
  view: GoalsTreeView,
  selectedId: string,
  kind: "current" | "archive" | "trash",
  items: readonly GoalsTreeItem[],
  open: boolean,
): string {
  const title = kind === "current" ? uiText.text("goals.tree-ui.current") : kind === "archive" ? uiText.text("goals.tree-ui.archive") : uiText.text("goals.tree-ui.trash");
  const empty = kind === "current" ? uiText.text("goals.tree-ui.no-goals-yet") : kind === "archive" ? uiText.text("goals.tree-ui.no-archived-goals") : uiText.text("goals.tree-ui.trash-empty");
  const persist = kind === "current" ? "goal-collection-current" : kind === "archive" ? "goal-collection-archive" : "goal-collection-trash";
  const mark = kind === "current" ? "target" : kind === "archive" ? "archive" : "trash";
  const treeToken = kind === "current" ? "data-tree-root" : `data-collection-tree="${kind}"`;
  const tree = items.length ? renderGoalTree(view, selectedId, items, treeToken) : "";
  const filterEmpty = kind === "current"
    ? `<div class="tree-filter-empty" data-tree-filter-empty hidden><p>${uiText("goals.tree-ui.no-goal-matches-current-filters")}</p><button class="mw-btn mw-btn--link" type="button" data-clear-tree-filter>${uiText("goals.tree-ui.clear-all-filters")}</button></div>`
    : "";
  const body = items.length ? `${tree}${filterEmpty}` : `<p class="goal-collection-empty">${empty}</p>`;
  return `<details class="goal-collection-fold" data-goal-collection-fold="${kind}" data-persist-open="${persist}"${open ? " open data-collection-open" : ""}>
    <summary>
      <span class="goal-collection-caret" aria-hidden="true">${icon("chevron-down")}</span>
      <span class="goal-collection-mark" aria-hidden="true">${icon(mark)}</span>
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
      <button class="mw-btn mw-btn--primary tree-create" type="button" data-open-create>${icon("plus")}<span>${uiText("goals.tree-ui.new-goal")}</span></button>
      <div class="tree-filter-control">
        <button class="mw-btn mw-btn--ghost tree-filter-trigger" type="button" data-tree-filter-trigger aria-expanded="false" aria-controls="tree-status-filter" aria-label="${uiText("goals.tree-ui.filter-goals")}" title="${uiText("goals.tree-ui.filter-goals")}">${icon("filter")}<span>${uiText("goals.tree-ui.status")}</span></button>
      </div>
      ${renderTreeStatusFilter(view.goals)}
    </div>
  </header>`;
}

function renderTreeFooter(view: GoalsTreeView, collection: GoalCollectionModel<GoalsTreeItem>): string {
  const { collectionSuffix, collectionNote } = collection;
  return `<footer class="tree-footer" data-tree-footer><span data-tree-filter-count data-tree-suffix="${escapeHtml(collectionSuffix)}">${uiText("goals.tree-ui.count-suffix-goals", { count: view.goals.length, suffix: "" })}</span><small>${collectionNote}</small></footer>`;
}

function renderGoalStageList(view: GoalsTreeView, collection: GoalCollectionModel<GoalsTreeItem>, proposals = ""): string {
  const { selectedId, archiveView, trashView } = collection;
  return `<div class="goal-stage-list" data-goal-stage-list data-tree-scroll tabindex="0" aria-label="${uiText("goals.tree-ui.goal-list")}"><div class="goal-list-view" data-goal-list-view>${archiveView || trashView ? "" : proposals}${renderGoalList(view, selectedId, archiveView, trashView)}</div></div>`;
}

function renderGoalDirectory(_view: GoalsTreeView, _collection: GoalCollectionModel<GoalsTreeItem>, _initiallyOpen: boolean): string {
  return "";
}

function renderGoalRefreshDirectory(view: GoalsTreeView, collection: GoalCollectionModel<GoalsTreeItem>, proposals = ""): string {
  const { selectedId, archiveView, trashView } = collection;
  return `<div data-refresh-tree-chrome hidden>${renderTreeChrome(view)}</div>
    <div data-tree-scroll>${archiveView || trashView ? "" : proposals}${renderGoalList(view, selectedId, archiveView, trashView)}</div>
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
/** Which surface each renderer method mounts (W5-06): the shell builds its renderer from this, and the descriptor lists these. */
export const GOALS_TREE_UI_SURFACES = { renderGoalRootEntry: "root-entry", renderGoalTree: "tree", renderTreeChrome: "chrome", renderGoalDirectory: "directory", renderGoalRefreshDirectory: "refresh", renderGoalStageList: "stage-list" } as const satisfies Record<keyof GoalsTreeRenderer, GoalsTreeUiModel["kind"]>;
export const goalsTreeUiContribution: UiContribution<GoalsTreeUiModel> = {
  descriptor: {
    contribution_id: GOALS_TREE_UI_CONTRIBUTION_ID,
    kind: "embedded", label: "Goal Tree",
    surfaces: Object.values(GOALS_TREE_UI_SURFACES).map(surface_id => ({ surface_id, target_slot_id: "workbench.directory", format: "declarative-html" })),
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
