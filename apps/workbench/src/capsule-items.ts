import { isAppliedGoalCompletion, type GoalsDocumentView as WebGoalView } from "@molis-ai/molis-work-plugin-goals";
import type { MolisWorkWebView } from "./page-view.js";
import type { WorkbenchRendererPorts } from "./renderer.js";
import type { CapsuleGoalItem, CapsuleState, CapsuleStateKind, CapsuleTab, CapsuleTabKind } from "./capsule-view.js";

export function createCapsuleItemProjection(L: WorkbenchRendererPorts["locale"]["L"]) {
  function activeGoalViews(view: MolisWorkWebView): WebGoalView[] {
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
    view: MolisWorkWebView,
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

  function goalPath(view: MolisWorkWebView, goalId: string): string {
    return `${view.route_prefix}/goals/${encodeURIComponent(goalId)}`;
  }

  function decisionPath(view: MolisWorkWebView, goalId: string): string {
    return goalPath(view, goalId);
  }

  function projectPath(view: MolisWorkWebView): string {
    return view.route_prefix || "/";
  }

  function goalWhy(item: WebGoalView): string {
    return item.goal.why.trim() || item.goal.outcome.trim() || L("这项目标还没有补充说明");
  }

  function primaryBlocker(): { message: string; remediation: string | null } {
    return { message: L("打开目标详情查看具体原因"), remediation: null };
  }

  function itemBase(
    view: MolisWorkWebView,
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

  function decisionItem(view: MolisWorkWebView, item: WebGoalView, decisionCount: number): CapsuleGoalItem {
    const actionPath = decisionCount > 0
      ? decisionPath(view, item.goal.goal_id)
      : goalPath(view, item.goal.goal_id);
    return itemBase(view, item, {
      tab_kind: "waiting_user",
      kind: "needs_you",
      status_label: item.status_label,
      status_since: null,
      current: item.action_summary,
      blocker: L("完成这一步前，相关工作不会继续"),
      next_step: item.main_action_label,
      next: decisionCount > 0
        ? L("打开对应事项，确认采用、修改或拒绝")
        : item.action_summary,
      action_label: item.main_action_label,
      action_path: actionPath,
    });
  }

  function activeTone(item: WebGoalView): CapsuleStateKind {
    return item.display_status === "waiting_user" || item.status.includes("review") ? "checking" : "working";
  }

  function activeItem(view: MolisWorkWebView, item: WebGoalView): CapsuleGoalItem {
    return itemBase(view, item, {
      tab_kind: "in_progress",
      kind: activeTone(item),
      status_label: item.status_label,
      status_since: null,
      current: item.action_summary,
      blocker: null,
      next_step: item.main_action_label,
      next: L("打开这条 Goal，查看最新进展和下一步。"),
      action_label: item.main_action_label,
      action_path: goalPath(view, item.goal.goal_id),
    });
  }

  function availableItem(
    view: MolisWorkWebView,
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

  function blockedItem(view: MolisWorkWebView, item: WebGoalView): CapsuleGoalItem {
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

  function waitingItem(view: MolisWorkWebView, item: WebGoalView): CapsuleGoalItem {
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

  function completeItem(view: MolisWorkWebView, item: WebGoalView, at: string): CapsuleGoalItem {
    return itemBase(view, item, {
      tab_kind: "completed",
      kind: "complete",
      status_label: item.status_label,
      status_since: at,
      current: L("这项目标已满足全部完成条件"),
      blocker: null,
      next_step: L("查看完成结果"),
      next: L("确认结果符合预期后，可以继续下一项工作"),
      action_label: L("查看结果"),
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
      case "waiting_user": return { label: L("等你"), tone: "needs_you" };
      case "in_progress": return { label: L("进行中"), tone: "working" };
      case "continue": return { label: L("可继续"), tone: "ready" };
      case "waiting": return { label: L("等待中"), tone: "waiting" };
      case "blocked": return { label: L("受阻"), tone: "blocked" };
      case "completed": return { label: L("已完成"), tone: "complete" };
    }
  }

  function menuBarTitle(tabs: CapsuleTab[], selected: CapsuleGoalItem): string {
    const tab = tabs.find((candidate) => candidate.kind === selected.tab_kind);
    const count = tab?.items.length ?? 1;
    return count > 1 ? L("{label} · {count}", { label: tab?.label ?? selected.status_label, count }) : selected.status_label;
  }

  function stateFromItem(
    view: MolisWorkWebView,
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
      blocker: selected.blocker ?? L("目前没有需要你处理的事项"),
      next: selected.next,
      running_count: runningCount,
      additional_running: Math.max(0, runningCount - (selected.tab_kind === "in_progress" ? 1 : 0)),
      menu_bar_title: title,
      menu_bar_tooltip: `${view.project?.display_name ?? L("当前项目")} · ${selected.goal_title} · ${title}`,
    };
  }
  return { activeGoalViews, newestFirst, recentCompletedGoal, projectPath, decisionItem, activeItem, availableItem, blockedItem, waitingItem, completeItem, TAB_ORDER, tabMeta, stateFromItem };
}
