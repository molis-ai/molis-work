import type { GoalMomentumGoalInput, GoalMomentumRelationInput, GoalMomentumView, GoalMomentumEdge, GoalMomentumNode, GoalMomentumGroup, GoalMomentumAction } from "./momentum-model.js";
import { compareGoal, uniqueSorted, insertSorted, assignDependencyRows } from "./momentum-layout.js";
import { time, windowStart, goalActivityTimes, firstSatisfiedAt, cadenceFor } from "./momentum-cadence.js";

// Read-only presentation: queue hints never authorize Claim/Run or update facts.
export function buildGoalMomentumView(
  goals: readonly GoalMomentumGoalInput[],
  relations: readonly GoalMomentumRelationInput[],
  selectedGoalId?: string,
  now = new Date(),
): GoalMomentumView {
  const orderedGoals = [...goals].sort(compareGoal);
  const byId = new Map(orderedGoals.map((goal) => [goal.goal_id, goal]));
  const goalIds = new Set(byId.keys());
  const selectedGoalIdResolved = goalIds.has(selectedGoalId ?? "")
    ? selectedGoalId!
    : orderedGoals[0]?.goal_id ?? "";
  const activeRelations = relations
    .filter((relation) => relation.state === "active")
    .sort((left, right) =>
      left.type.localeCompare(right.type) ||
      left.from_goal_id.localeCompare(right.from_goal_id) ||
      left.to_goal_id.localeCompare(right.to_goal_id) ||
      left.relation_id.localeCompare(right.relation_id)
    );
  const relevantRelations = activeRelations.filter((relation) =>
    relation.type === "depends_on" || relation.type === "part_of"
  );
  const danglingRelationIds = relevantRelations
    .filter((relation) => !goalIds.has(relation.from_goal_id) || !goalIds.has(relation.to_goal_id))
    .map((relation) => relation.relation_id);
  const validRelations = relevantRelations.filter((relation) =>
    goalIds.has(relation.from_goal_id) && goalIds.has(relation.to_goal_id)
  );

  const dependencyEdges: GoalMomentumEdge[] = validRelations
    .filter((relation) => relation.type === "depends_on")
    .map((relation) => ({
      relation_id: relation.relation_id,
      provider_goal_id: relation.to_goal_id,
      consumer_goal_id: relation.from_goal_id,
      reason: relation.reason,
    }))
    .sort((left, right) =>
      left.provider_goal_id.localeCompare(right.provider_goal_id) ||
      left.consumer_goal_id.localeCompare(right.consumer_goal_id) ||
      left.relation_id.localeCompare(right.relation_id)
    );
  const providers = new Map<string, string[]>();
  const consumers = new Map<string, string[]>();
  for (const goalId of goalIds) {
    providers.set(goalId, []);
    consumers.set(goalId, []);
  }
  for (const edge of dependencyEdges) {
    providers.set(edge.consumer_goal_id, uniqueSorted([...(providers.get(edge.consumer_goal_id) ?? []), edge.provider_goal_id]));
    consumers.set(edge.provider_goal_id, uniqueSorted([...(consumers.get(edge.provider_goal_id) ?? []), edge.consumer_goal_id]));
  }

  const indegree = new Map([...goalIds].map((goalId) => [goalId, providers.get(goalId)?.length ?? 0]));
  const levels = new Map([...goalIds].map((goalId) => [goalId, 0]));
  const queue = orderedGoals.filter((goal) => indegree.get(goal.goal_id) === 0).map((goal) => goal.goal_id);
  const processed = new Set<string>();
  while (queue.length) {
    const providerId = queue.shift()!;
    processed.add(providerId);
    for (const consumerId of consumers.get(providerId) ?? []) {
      levels.set(consumerId, Math.max(levels.get(consumerId) ?? 0, (levels.get(providerId) ?? 0) + 1));
      const remaining = (indegree.get(consumerId) ?? 0) - 1;
      indegree.set(consumerId, remaining);
      if (remaining === 0) insertSorted(queue, consumerId, byId);
    }
  }
  const cycleGoalIds = orderedGoals.filter((goal) => !processed.has(goal.goal_id)).map((goal) => goal.goal_id);
  if (cycleGoalIds.length) {
    const fallbackLevel = Math.max(0, ...levels.values()) + (processed.size ? 1 : 0);
    for (const goalId of cycleGoalIds) levels.set(goalId, fallbackLevel);
  }

  const parentCandidates = new Map<string, string[]>();
  for (const relation of validRelations) {
    if (relation.type !== "part_of") continue;
    parentCandidates.set(
      relation.from_goal_id,
      uniqueSorted([...(parentCandidates.get(relation.from_goal_id) ?? []), relation.to_goal_id]),
    );
  }
  const multiParentGoalIds = [...parentCandidates]
    .filter(([, candidates]) => candidates.length > 1)
    .map(([goalId]) => goalId)
    .sort();
  const parent = new Map([...parentCandidates].map(([goalId, candidates]) => [goalId, candidates[0]!]));
  const parentGoalIds = new Set(parent.values());
  const partOfCycleGoalIds = new Set<string>();
  const groupRootFor = (goalId: string): string | null => {
    let current = goalId;
    const path: string[] = [];
    while (parent.has(current)) {
      if (path.includes(current)) {
        path.slice(path.indexOf(current)).forEach((id) => partOfCycleGoalIds.add(id));
        return [...path.slice(path.indexOf(current))].sort()[0] ?? current;
      }
      path.push(current);
      current = parent.get(current)!;
    }
    if (current !== goalId || parentGoalIds.has(goalId)) return current;
    return null;
  };
  const groupIdByGoal = new Map<string, string>();
  for (const goal of orderedGoals) groupIdByGoal.set(goal.goal_id, groupRootFor(goal.goal_id) ?? "__standalone__");
  const groupedGoals = new Map<string, GoalMomentumGoalInput[]>();
  for (const goal of orderedGoals) {
    const groupId = groupIdByGoal.get(goal.goal_id)!;
    groupedGoals.set(groupId, [...(groupedGoals.get(groupId) ?? []), goal]);
  }
  const orderedGroupIds = [...groupedGoals.keys()].sort((left, right) => {
    if (left === "__standalone__") return -1;
    if (right === "__standalone__") return 1;
    return compareGoal(byId.get(left)!, byId.get(right)!);
  });

  const downstreamByGoal = new Map<string, string[]>();
  const downstreamFor = (goalId: string): string[] => {
    const cached = downstreamByGoal.get(goalId);
    if (cached) return cached;
    const reached = new Set<string>();
    const pending = [...(consumers.get(goalId) ?? [])];
    while (pending.length) {
      const current = pending.shift()!;
      if (current === goalId || reached.has(current)) continue;
      reached.add(current);
      pending.push(...(consumers.get(current) ?? []));
    }
    const result = uniqueSorted(reached);
    downstreamByGoal.set(goalId, result);
    return result;
  };

  const rowByGoal = new Map<string, number>();
  const groups: GoalMomentumGroup[] = [];
  let rowCursor = 1;
  for (const groupId of orderedGroupIds) {
    const members = groupedGoals.get(groupId) ?? [];
    const membersByLevel = new Map<number, GoalMomentumGoalInput[]>();
    for (const member of members) {
      const level = levels.get(member.goal_id) ?? 0;
      membersByLevel.set(level, [...(membersByLevel.get(level) ?? []), member]);
    }
    for (const levelMembers of membersByLevel.values()) levelMembers.sort(compareGoal);
    const rowCount = Math.max(1, ...[...membersByLevel.values()].map((levelMembers) => levelMembers.length));
    const alignedRows = assignDependencyRows(membersByLevel, providers, consumers);
    for (const member of members) {
      rowByGoal.set(member.goal_id, rowCursor + (alignedRows.get(member.goal_id) ?? 0));
    }
    const memberLevels = members.map((member) => levels.get(member.goal_id) ?? 0);
    groups.push({
      group_id: groupId,
      title: groupId === "__standalone__" ? "项目级独立事项" : byId.get(groupId)?.title ?? groupId,
      root_goal_id: groupId === "__standalone__" ? null : groupId,
      goal_count: members.length,
      level_start: memberLevels.length ? Math.min(...memberLevels) : 0,
      level_end: Math.max(0, ...memberLevels),
      row_start: rowCursor,
      row_end: rowCursor + rowCount - 1,
    });
    rowCursor += rowCount + 1;
  }

  const nowMs = now.getTime();
  const staleStart = windowStart(now, 7);
  const nodes = orderedGoals.map((goal): GoalMomentumNode => {
    const providerGoalIds = providers.get(goal.goal_id) ?? [];
    const unsatisfiedProviderGoalIds = providerGoalIds.filter((providerId) => !byId.get(providerId)?.completed);
    const downstreamGoalIds = downstreamFor(goal.goal_id);
    const downstreamOpenCount = downstreamGoalIds.filter((consumerId) => !byId.get(consumerId)?.completed).length;
    const blocked = goal.display_status === "blocked";
    const activity = goalActivityTimes(goal);
    const historySufficient = activity.length > 0 || firstSatisfiedAt(goal) !== null;
    const createdAt = time(goal.created_at);
    const stale = !goal.completed && historySufficient && createdAt !== null && createdAt < staleStart &&
      activity.every((activityAt) => activityAt < staleStart || activityAt > nowMs);
    return {
      ...goal,
      level: levels.get(goal.goal_id) ?? 0,
      row: rowByGoal.get(goal.goal_id) ?? 1,
      group_id: groupIdByGoal.get(goal.goal_id) ?? "__standalone__",
      provider_goal_ids: providerGoalIds,
      consumer_goal_ids: consumers.get(goal.goal_id) ?? [],
      unsatisfied_provider_goal_ids: unsatisfiedProviderGoalIds,
      downstream_goal_ids: downstreamGoalIds,
      downstream_open_count: downstreamOpenCount,
      completion_ratio: goal.completed ? 1 : 0,
      blocked,
      startable: !goal.completed && goal.display_status === "continue" && unsatisfiedProviderGoalIds.length === 0,
      stale,
      history_sufficient: historySufficient,
    };
  });
  const nodesById = new Map(nodes.map((node) => [node.goal_id, node]));
  const actions = nodes
    .filter((node) => !node.completed)
    .map((node): GoalMomentumAction => {
      const waitingForHuman = node.display_status === "waiting_user";
      const nearComplete = node.display_status === "in_progress" || node.completion_ratio >= .6;
      if (waitingForHuman) {
        return { goal_id: node.goal_id, tier: 1, kind: "decide", downstream_open_count: node.downstream_open_count, unsatisfied_provider_goal_ids: node.unsatisfied_provider_goal_ids };
      }
      if (nearComplete && node.display_status !== "blocked" && node.display_status !== "waiting") {
        return { goal_id: node.goal_id, tier: 2, kind: "finish", downstream_open_count: node.downstream_open_count, unsatisfied_provider_goal_ids: node.unsatisfied_provider_goal_ids };
      }
      if (node.startable && node.downstream_open_count >= 2) {
        return { goal_id: node.goal_id, tier: 3, kind: "start_high_impact", downstream_open_count: node.downstream_open_count, unsatisfied_provider_goal_ids: [] };
      }
      if (node.stale && node.startable && node.downstream_open_count <= 1) {
        return { goal_id: node.goal_id, tier: 5, kind: "revive", downstream_open_count: node.downstream_open_count, unsatisfied_provider_goal_ids: node.unsatisfied_provider_goal_ids };
      }
      if (node.startable) {
        return { goal_id: node.goal_id, tier: 4, kind: "start", downstream_open_count: node.downstream_open_count, unsatisfied_provider_goal_ids: [] };
      }
      return { goal_id: node.goal_id, tier: 5, kind: "waiting", downstream_open_count: node.downstream_open_count, unsatisfied_provider_goal_ids: node.unsatisfied_provider_goal_ids };
    })
    .sort((left, right) => {
      const leftGoal = nodesById.get(left.goal_id)!;
      const rightGoal = nodesById.get(right.goal_id)!;
      return left.tier - right.tier ||
        right.downstream_open_count - left.downstream_open_count ||
        rightGoal.priority - leftGoal.priority ||
        compareGoal(leftGoal, rightGoal);
    });

  return {
    selected_goal_id: selectedGoalIdResolved,
    level_count: Math.max(0, ...levels.values()) + (orderedGoals.length ? 1 : 0),
    grid_rows: Math.max(0, rowCursor - 1),
    nodes,
    edges: dependencyEdges,
    groups,
    actions,
    cadence: {
      7: cadenceFor(orderedGoals, now, 7),
      30: cadenceFor(orderedGoals, now, 30),
    },
    integrity: {
      dangling_relation_ids: danglingRelationIds,
      dependency_cycle_goal_ids: cycleGoalIds,
      multi_parent_goal_ids: multiParentGoalIds,
      part_of_cycle_goal_ids: [...partOfCycleGoalIds].sort(),
    },
  };
}
