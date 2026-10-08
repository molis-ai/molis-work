export interface McpResumeGoal {
  goal_id: string;
  title: string;
  work_status: "open" | "completed" | "cancelled";
  completion_effect: boolean;
  can_record: boolean;
  next_hint: string;
  unmet_requirement_count: number;
  pending_decision_count: number;
  blocking_concern_count: number;
  updated_at: string;
}

export interface McpResumeFacts {
  goals: readonly McpResumeGoal[];
  observed_event_cursor?: number;
}

/** Where the Goals plugin's own work stands, for picking a session back up; not an overview of the whole project. It derives no new lifecycle facts. */
export function buildMcpResumeView(
  facts: McpResumeFacts,
  explicitGoalId: string | null,
  sessionGoalId: string | null,
) {
  const goalsById = new Map(facts.goals.map((goal) => [goal.goal_id, goal]));
  const preferred = [
    { goal_id: explicitGoalId, source: "host_focus" },
    { goal_id: sessionGoalId, source: "session_focus" },
  ].find((candidate) => candidate.goal_id && goalsById.has(candidate.goal_id));
  const ordered = [...facts.goals].sort((left, right) => {
    const rank = (goal: McpResumeGoal): number => {
      if (goal.work_status === "open" && goal.pending_decision_count > 0) return 0;
      if (goal.work_status === "open" && goal.can_record) return 1;
      if (goal.work_status === "open") return 2;
      if (goal.work_status === "cancelled") return 3;
      return 4;
    };
    return rank(left) - rank(right)
      || right.updated_at.localeCompare(left.updated_at)
      || left.goal_id.localeCompare(right.goal_id);
  });
  const focused = preferred
    ? goalsById.get(preferred.goal_id!)!
    : ordered[0] ?? null;
  const source = preferred?.source ?? (focused ? "project_recovery_order" : null);
  const nextGoals = ordered
    .filter((goal) => goal.goal_id !== focused?.goal_id && goal.work_status !== "completed")
    .slice(0, 5)
    .map((goal) => ({
      goal_id: goal.goal_id,
      title: goal.title,
      next_hint: goal.next_hint,
      work_status: goal.work_status,
    }));
  return {
    focus: focused
      ? {
          goal_id: focused.goal_id,
          title: focused.title,
          source,
          next_hint: focused.next_hint,
          work_status: focused.work_status,
          can_record: focused.can_record,
        }
      : null,
    next_goals: nextGoals,
  };
}
