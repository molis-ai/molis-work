import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalsDocumentView as WebGoalView } from "../document-view.js";
import { isAppliedGoalCompletion } from "../decision-view.js";
import type { GoalsPageView } from "./view.js";
import type { CapsuleGoalItem, CapsuleState, CapsuleStateKind, CapsuleTab, CapsuleTabKind } from "./capsule-view.js";

export function createCapsuleItemProjection() {
  function activeGoalViews(view: GoalsPageView): WebGoalView[] {
    return view.goals.filter((item) => item.display_status === "in_progress");
  }

  function latestGoalActivity(item: WebGoalView): string {
    return [
      item.goal.updated_at,
      ...item.events.map((event) => event.at),
    ].sort().at(-1) ?? "";
  }

  function newestFirst(items: WebGoalView[]): WebGoalView[] {
    return [...items].sort((left, right) =>
      latestGoalActivity(right).localeCompare(latestGoalActivity(left)) ||
      left.goal.goal_id.localeCompare(right.goal.goal_id)
    );
  }

  /** The Goal whose completion applied most recently, while it is still complete. */
  function recentCompletedGoal(
    view: GoalsPageView,
    now: Date,
    visibleForMs: number,
  ): { item: WebGoalView; at: string } | null {
    let newest: { item: WebGoalView; at: string; seq: number } | null = null;
    for (const item of [...view.goals, ...view.archived_goals]) {
      if (item.display_status !== "completed") continue;
      for (const event of item.events) {
        if (!isAppliedGoalCompletion(event)) continue;
        const at = Date.parse(event.at);
        if (!Number.isFinite(at) || now.getTime() - at < 0 || now.getTime() - at > visibleForMs) continue;
        if (!newest || event.seq > newest.seq) newest = { item, at: event.at, seq: event.seq };
      }
    }
    return newest && { item: newest.item, at: newest.at };
  }

  function goalPath(view: GoalsPageView, goalId: string): string {
    return `${view.route_prefix}/goals/${encodeURIComponent(goalId)}`;
  }

  function decisionPath(view: GoalsPageView, goalId: string): string {
    return goalPath(view, goalId);
  }

  function projectPath(view: GoalsPageView): string {
    return view.route_prefix || "/";
  }

  function goalWhy(item: WebGoalView): string {
    return item.goal.why.trim() || item.goal.outcome.trim() || uiText.text("goals.capsule-items.goal-does-not-have-summary-yet");
  }

  function primaryBlocker(): { message: string; remediation: string | null } {
    return { message: uiText.text("goals.capsule-items.open-goal-see-what-blocking"), remediation: null };
  }

  function itemBase(
    view: GoalsPageView,
    item: WebGoalView,
    input: Omit<CapsuleGoalItem, "goal_id" | "goal_title" | "goal_path" | "why">,
  ): CapsuleGoalItem {
    return {
      goal_id: item.goal.goal_id,
      goal_title: item.goal.title,
      goal_path: goalPath(view, item.goal.goal_id),
      why: goalWhy(item),
      ...input,
    };
  }

  function decisionItem(view: GoalsPageView, item: WebGoalView, decisionCount: number): CapsuleGoalItem {
    const actionPath = decisionCount > 0
      ? decisionPath(view, item.goal.goal_id)
      : goalPath(view, item.goal.goal_id);
    return itemBase(view, item, {
      tab_kind: "waiting_user",
      kind: "needs_you",
      status_label: item.status_label,
      status_since: null,
      current: item.action_summary,
      blocker: uiText.text("goals.capsule-items.related-work-will-not-continue-until-step-done"),
      next_step: item.main_action_label,
      next: decisionCount > 0
        ? uiText.text("goals.capsule-items.open-decisions-approve-revise-reject-them")
        : item.action_summary,
      action_label: item.main_action_label,
      action_path: actionPath,
    });
  }

  function activeTone(item: WebGoalView): CapsuleStateKind {
    return item.display_status === "waiting_user" || item.status.includes("review") ? "checking" : "working";
  }

  function activeItem(view: GoalsPageView, item: WebGoalView): CapsuleGoalItem {
    return itemBase(view, item, {
      tab_kind: "in_progress",
      kind: activeTone(item),
      status_label: item.status_label,
      status_since: null,
      current: item.action_summary,
      blocker: null,
      next_step: item.main_action_label,
      next: uiText.text("goals.capsule-items.open-goal-see-latest-progress-next-step"),
      action_label: item.main_action_label,
      action_path: goalPath(view, item.goal.goal_id),
    });
  }

  function availableItem(
    view: GoalsPageView,
    item: WebGoalView,
  ): CapsuleGoalItem {
    return itemBase(view, item, {
      tab_kind: "continue",
      kind: "ready",
      status_label: item.status_label,
      status_since: null,
      current: item.action_summary,
      blocker: null,
      next_step: item.main_action_label,
      next: item.action_summary,
      action_label: item.main_action_label,
      action_path: goalPath(view, item.goal.goal_id),
    });
  }

  function blockedItem(view: GoalsPageView, item: WebGoalView): CapsuleGoalItem {
    const blocker = primaryBlocker();
    return itemBase(view, item, {
      tab_kind: "blocked",
      kind: "blocked",
      status_label: item.status_label,
      status_since: null,
      current: item.action_summary,
      blocker: blocker.message,
      next_step: blocker.remediation ?? item.main_action_label,
      next: blocker.remediation ?? item.action_summary,
      action_label: item.main_action_label,
      action_path: goalPath(view, item.goal.goal_id),
    });
  }

  function waitingItem(view: GoalsPageView, item: WebGoalView): CapsuleGoalItem {
    return itemBase(view, item, {
      tab_kind: "waiting",
      kind: "waiting",
      status_label: item.status_label,
      status_since: null,
      current: item.action_summary,
      blocker: null,
      next_step: item.main_action_label,
      next: item.action_summary,
      action_label: item.main_action_label,
      action_path: goalPath(view, item.goal.goal_id),
    });
  }

  function completeItem(view: GoalsPageView, item: WebGoalView, at: string): CapsuleGoalItem {
    return itemBase(view, item, {
      tab_kind: "completed",
      kind: "complete",
      status_label: item.status_label,
      status_since: at,
      current: uiText.text("goals.capsule-items.goal-now-meets-all-completion-criteria"),
      blocker: null,
      next_step: uiText.text("goals.capsule-items.review-completed-result"),
      next: uiText.text("goals.capsule-items.confirm-result-meets-expectations-then-continue-next-goal"),
      action_label: uiText.text("goals.capsule-items.view-result"),
      action_path: goalPath(view, item.goal.goal_id),
    });
  }

  const TAB_ORDER: CapsuleTabKind[] = [
    "waiting_user",
    "in_progress",
    "continue",
    "waiting",
    "blocked",
    "completed",
  ];

  function tabMeta(kind: CapsuleTabKind): Pick<CapsuleTab, "label" | "tone"> {
    switch (kind) {
      case "waiting_user": return { label: uiText.text("goals.capsule-items.needs"), tone: "needs_you" };
      case "in_progress": return { label: uiText.text("goals.capsule-items.running"), tone: "working" };
      case "continue": return { label: uiText.text("goals.capsule-items.continue"), tone: "ready" };
      case "waiting": return { label: uiText.text("goals.capsule-items.waiting"), tone: "waiting" };
      case "blocked": return { label: uiText.text("goals.capsule-items.blocked"), tone: "blocked" };
      case "completed": return { label: uiText.text("goals.capsule-items.completed"), tone: "complete" };
    }
  }

  function menuBarTitle(tabs: CapsuleTab[], selected: CapsuleGoalItem): string {
    const tab = tabs.find((candidate) => candidate.kind === selected.tab_kind);
    const count = tab?.items.length ?? 1;
    return count > 1 ? uiText.text("goals.capsule-items.status-count", { label: tab?.label ?? selected.status_label, count }) : selected.status_label;
  }

  function stateFromItem(
    view: GoalsPageView,
    tabs: CapsuleTab[],
    selected: CapsuleGoalItem,
    runningCount: number,
  ): CapsuleState {
    const title = menuBarTitle(tabs, selected);
    return {
      kind: selected.kind,
      label: selected.status_label,
      goal_id: selected.goal_id,
      goal_title: selected.goal_title,
      goal_path: selected.goal_path,
      action_label: selected.action_label,
      action_path: selected.action_path,
      status_since: selected.status_since,
      why: selected.why,
      current: selected.current,
      blocker: selected.blocker ?? uiText.text("goals.capsule-items.nothing-needs-attention-right-now"),
      next: selected.next,
      running_count: runningCount,
      additional_running: Math.max(0, runningCount - (selected.tab_kind === "in_progress" ? 1 : 0)),
      menu_bar_title: title,
      menu_bar_tooltip: `${view.project?.display_name ?? uiText.text("goals.capsule-items.current-project")} · ${selected.goal_title} · ${title}`,
    };
  }
  return { activeGoalViews, newestFirst, recentCompletedGoal, projectPath, decisionItem, activeItem, availableItem, blockedItem, waitingItem, completeItem, TAB_ORDER, tabMeta, stateFromItem };
}
