import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { countGoalDecisions } from "../decision-groups.js";
import type { GoalsPageView } from "./view.js";
import type { CapsuleSnapshot, CapsuleGoalItem, CapsuleTab, CapsuleTabKind } from "./capsule-view.js";
import { createCapsuleItemProjection } from "./capsule-items.js";

/** The Goals owner's existing capsule projection; the shell only displays its JSON. */
export function createGoalsCapsuleProjection() {
  const { activeGoalViews, newestFirst, recentCompletedGoal, projectPath, decisionItem, activeItem, availableItem, blockedItem, waitingItem, completeItem, TAB_ORDER, tabMeta, stateFromItem } = createCapsuleItemProjection();
  function buildCapsuleSnapshot(
    view: GoalsPageView,
    directory: { goal_id: string }[],
    now = new Date(),
    completionDisplayMs = 10_000,
  ): CapsuleSnapshot {
    if (!view.project) throw new Error("工作胶囊必须从具体项目读取状态");
    const active = activeGoalViews(view);
    const runningCount = active.length;
    const canonicalFocus = view.snapshot.board.active_goal_id;
    const assigned = new Set<string>();
    const items: CapsuleGoalItem[] = [];
    const decisionCounts = new Map(
      view.goals.map((item) => [item.goal.goal_id, countGoalDecisions(view, item.goal.goal_id)]),
    );
    const decisionItems = newestFirst(
      view.goals.filter((item) => item.display_status === "waiting_user"),
    ).map((item) => {
      assigned.add(item.goal.goal_id);
      return decisionItem(view, item, decisionCounts.get(item.goal.goal_id) ?? 0);
    });
    items.push(...decisionItems);

    const activeOrdered = newestFirst(active.filter((item) => !assigned.has(item.goal.goal_id)));
    if (canonicalFocus) {
      const focusIndex = activeOrdered.findIndex((item) => item.goal.goal_id === canonicalFocus);
      if (focusIndex > 0) activeOrdered.unshift(activeOrdered.splice(focusIndex, 1)[0]!);
    }
    const activeItems = activeOrdered.map((item) => {
      assigned.add(item.goal.goal_id);
      return activeItem(view, item);
    });
    items.push(...activeItems);

    const completed = recentCompletedGoal(view, now, completionDisplayMs);
    const completedItem = completed && !assigned.has(completed.item.goal.goal_id)
      ? completeItem(view, completed.item, completed.at)
      : null;
    if (completedItem) {
      assigned.add(completedItem.goal_id);
      items.push(completedItem);
    }

    const availableOrder = new Map<string, number>();
    directory.forEach((candidate, index) => {
      if (!availableOrder.has(candidate.goal_id)) availableOrder.set(candidate.goal_id, index);
    });
    const continueGoals = view.goals
      .filter((item) => item.display_status === "continue" && !assigned.has(item.goal.goal_id))
      .sort((left, right) =>
        (availableOrder.get(left.goal.goal_id) ?? Number.MAX_SAFE_INTEGER) -
          (availableOrder.get(right.goal.goal_id) ?? Number.MAX_SAFE_INTEGER) ||
        right.goal.priority - left.goal.priority ||
        left.goal.goal_id.localeCompare(right.goal.goal_id)
      );
    const availableItems: CapsuleGoalItem[] = [];
    for (const item of continueGoals) {
      assigned.add(item.goal.goal_id);
      const projected = availableItem(view, item);
      availableItems.push(projected);
      items.push(projected);
    }

    const blockedItems = newestFirst(view.goals.filter((item) =>
      !assigned.has(item.goal.goal_id) &&
      item.display_status === "blocked"
    )).map((item) => {
      assigned.add(item.goal.goal_id);
      return blockedItem(view, item);
    });
    items.push(...blockedItems);

    const waitingItems = newestFirst(view.goals.filter((item) =>
      !assigned.has(item.goal.goal_id) && item.display_status === "waiting"
    )).map((item) => {
      assigned.add(item.goal.goal_id);
      return waitingItem(view, item);
    });
    items.push(...waitingItems);

    const grouped = new Map<CapsuleTabKind, CapsuleGoalItem[]>();
    for (const item of items) {
      const group = grouped.get(item.tab_kind) ?? [];
      group.push(item);
      grouped.set(item.tab_kind, group);
    }
    const tabs = TAB_ORDER.flatMap((kind): CapsuleTab[] => {
      const group = grouped.get(kind);
      return group?.length ? [{ kind, ...tabMeta(kind), items: group }] : [];
    });
    const selected = decisionItems[0] ?? activeItems[0] ?? completedItem ?? availableItems[0] ?? blockedItems[0] ?? waitingItems[0] ?? null;
    if (selected) {
      return {
        observed_event_cursor: view.snapshot.cursor,
        project: view.project,
        state: stateFromItem(view, tabs, selected, runningCount),
        tabs,
        default_tab: selected.tab_kind,
        default_goal_id: selected.goal_id,
      };
    }

    const label = uiText.text("goals.capsule.nothing-ready");
    return {
      observed_event_cursor: view.snapshot.cursor,
      project: view.project,
      state: {
        kind: "empty",
        label,
        goal_id: null,
        goal_title: uiText.text("goals.capsule.no-focused-goal"),
        goal_path: projectPath(view),
        action_label: uiText.text("goals.capsule.open-molis-work"),
        action_path: projectPath(view),
        status_since: null,
        why: uiText.text("goals.capsule.there-no-running-immediately-actionable-goal"),
        current: uiText.text("goals.capsule.no-work-running-right-now"),
        blocker: uiText.text("goals.capsule.prerequisite-risk-goal-definition-may-still-need-attention"),
        next: uiText.text("goals.capsule.open-molis-work-see-which-conditions-not-yet"),
        running_count: 0,
        additional_running: 0,
        menu_bar_title: uiText.text("goals.capsule.idle"),
        menu_bar_tooltip: `${view.project.display_name} · ${label}`,
      },
      tabs: [],
      default_tab: null,
      default_goal_id: null,
    };
  }

  return { buildCapsuleSnapshot };
}
