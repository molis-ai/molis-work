import { defineResumeSummaryAction, type ActionSubject, type ResumeItem, type ResumeSummary } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalEventDirectoryItem } from "./contract/goal-events.js";

/**
 * Where Goals' own work stands, for an outside Agent picking a session back up (batch 44 C7; it was the MCP app's `buildMcpResumeView`).
 * It derives no lifecycle facts: the order is the one the MCP view used — an open Goal waiting on a decision first, then one that can
 * record progress, other open ones, cancelled, completed; newer before older.
 */
export const goalsResumeSummaryAction = defineResumeSummaryAction("goals.resume.summary", /* @version action.goals.resume.summary */ 1, ["goal"], "目标接续摘要", ["goals:read"]);

const STATUS: Record<GoalEventDirectoryItem["work_status"], string> = { open: "进行中", completed: "已完成", cancelled: "已取消" };
const rank = (goal: GoalEventDirectoryItem): number => {
  if (goal.work_status === "open" && goal.pending_decision_count > 0) return 0;
  if (goal.work_status === "open" && goal.can_record) return 1;
  if (goal.work_status === "open") return 2;
  if (goal.work_status === "cancelled") return 3;
  return 4;
};
const itemOf = (goal: GoalEventDirectoryItem): ResumeItem => ({ subject: { kind: "goal", id: goal.goal_id }, title: goal.title, next_hint: goal.next_hint,
  status_label: STATUS[goal.work_status], open: { surface: "goals", id: goal.goal_id } });

/** The summary over the project's first page of Goals, plus the focused one when it is a Goal that page left out. */
export function goalsResumeSummary(directory: readonly GoalEventDirectoryItem[], focus: ActionSubject | undefined, read: (goalId: string) => GoalEventDirectoryItem | null): ResumeSummary {
  const goals = [...directory];
  const focusId = focus?.kind === "goal" ? focus.id.trim() : "";
  if (focusId && !goals.some(goal => goal.goal_id === focusId)) { const item = read(focusId); if (item) goals.push(item); }
  const ordered = goals.sort((left, right) => rank(left) - rank(right) || right.updated_at.localeCompare(left.updated_at) || left.goal_id.localeCompare(right.goal_id));
  const focused = ordered.find(goal => goal.goal_id === focusId) ?? ordered[0] ?? null;
  return { title: "目标", focus: focused ? itemOf(focused) : null,
    next: ordered.filter(goal => goal.goal_id !== focused?.goal_id && goal.work_status !== "completed").slice(0, 5).map(itemOf) };
}
