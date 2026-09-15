import type {
  GoalChangeImpact,
  GoalRecord,
  GoalRelationRecord,
  PlanningGraphIssue,
  PlanningMetric,
  PlanningProposalItem,
  PlanningRelationChange,
} from "@molis-ai/molis-work-contracts/modules/goals";

export type {
  GoalChangeImpact,
  PlanningGraphIssue,
  PlanningMetric,
  PlanningRelationChange,
} from "@molis-ai/molis-work-contracts/modules/goals";

type ActiveRelation = Pick<GoalRelationRecord, "relation_id" | "from_goal_id" | "to_goal_id" | "type" | "state">;

function relationKey(relation: Pick<ActiveRelation, "from_goal_id" | "to_goal_id" | "type">): string {
  return `${relation.from_goal_id}\u0000${relation.to_goal_id}\u0000${relation.type}`;
}

export function projectPlanningRelations(
  relations: readonly ActiveRelation[],
  changes: readonly PlanningRelationChange[] = [],
): ActiveRelation[] {
  let projected = relations.filter((relation) => relation.state === "active").map((relation) => ({ ...relation }));
  for (const change of changes) {
    if (change.action === "deactivate") {
      projected = projected.filter((relation) => change.relation_id
        ? relation.relation_id !== change.relation_id
        : relationKey(relation) !== relationKey(change));
      continue;
    }
    projected.push({
      relation_id: change.relation_id?.trim() || `projected:${relationKey(change)}`,
      from_goal_id: change.from_goal_id,
      to_goal_id: change.to_goal_id,
      type: change.type,
      state: "active",
    });
  }
  return projected;
}

type ProposalItem = PlanningProposalItem;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

const RELATION_TYPES = new Set<GoalRelationRecord["type"]>([
  "part_of", "depends_on", "conflicts_with", "mitigates", "extends",
  "replaces", "corrects", "invalidates", "migrates_from",
]);

function proposalRelationValues(item: ProposalItem): Record<string, unknown>[] {
  if (item.kind !== "relation") return [];
  const payload = object(item.payload);
  if (!payload) return [];
  const nested = payload.relations ?? payload.relation;
  const values = Array.isArray(nested) ? nested : nested == null ? [payload] : [nested];
  return values.map(object).filter((value): value is Record<string, unknown> => value != null);
}

export function validatePlanningProposalGraph(
  currentGoals: readonly Pick<GoalRecord, "goal_id" | "trashed_at">[],
  currentRelations: readonly ActiveRelation[],
  items: readonly ProposalItem[],
): PlanningGraphIssue[] {
  const goals = new Map(currentGoals.map((goal) => [goal.goal_id, goal]));
  const changes: PlanningRelationChange[] = [];
  for (const item of items) {
    if (item.kind === "goal") {
      const payload = object(item.payload);
      const goal = object(payload?.goal) ?? payload;
      const goalId = String(goal?.goal_id ?? payload?.goal_id ?? "").trim();
      if (goalId && item.operation !== "deactivate") goals.set(goalId, { goal_id: goalId, trashed_at: null });
    }
    if (item.kind !== "relation") continue;
    for (const [index, relation] of proposalRelationValues(item).entries()) {
      const type = String(relation.type ?? "") as GoalRelationRecord["type"];
      if (!RELATION_TYPES.has(type)) continue;
      const from = String(relation.from_goal_id ?? "").trim();
      const to = String(relation.to_goal_id ?? "").trim();
      if (!from || !to) continue;
      changes.push({
        action: item.operation === "deactivate" || relation.action === "deactivate" ? "deactivate" : "add",
        relation_id: String(relation.relation_id ?? "").trim() || `proposal:${item.item_id ?? "item"}:${index}`,
        from_goal_id: from,
        to_goal_id: to,
        type,
        reason: String(relation.reason ?? ""),
      });
    }
  }
  return validatePlanningGraph([...goals.values()], projectPlanningRelations(currentRelations, changes));
}

function addEdge(edges: Map<string, Set<string>>, from: string, to: string): void {
  if (!edges.has(from)) edges.set(from, new Set());
  edges.get(from)!.add(to);
  if (!edges.has(to)) edges.set(to, new Set());
}

function edgesFor(relations: readonly ActiveRelation[], mode: "part_of" | "depends_on" | "execution"): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  for (const relation of relations) {
    if (relation.type === "part_of" && mode !== "depends_on") addEdge(edges, relation.from_goal_id, relation.to_goal_id);
    if (relation.type === "depends_on" && mode !== "part_of") addEdge(edges, relation.to_goal_id, relation.from_goal_id);
  }
  return edges;
}

function findCycle(edges: Map<string, Set<string>>): string[] | null {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const visit = (node: string): string[] | null => {
    state.set(node, 1);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if ((state.get(next) ?? 0) === 0) {
        const nested = visit(next);
        if (nested) return nested;
      } else if (state.get(next) === 1) {
        const start = stack.lastIndexOf(next);
        return [...stack.slice(start), next];
      }
    }
    stack.pop();
    state.set(node, 2);
    return null;
  };
  for (const node of edges.keys()) {
    if ((state.get(node) ?? 0) !== 0) continue;
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

function relationIdsForPath(relations: readonly ActiveRelation[], path: readonly string[], mode: "part_of" | "depends_on" | "execution"): string[] {
  const ids: string[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index]!;
    const to = path[index + 1]!;
    const relation = relations.find((candidate) => {
      if (candidate.type === "part_of" && mode !== "depends_on") return candidate.from_goal_id === from && candidate.to_goal_id === to;
      if (candidate.type === "depends_on" && mode !== "part_of") return candidate.to_goal_id === from && candidate.from_goal_id === to;
      return false;
    });
    if (relation) ids.push(relation.relation_id);
  }
  return ids;
}

export function validatePlanningGraph(
  goals: readonly Pick<GoalRecord, "goal_id" | "trashed_at">[],
  relations: readonly ActiveRelation[],
): PlanningGraphIssue[] {
  const issues: PlanningGraphIssue[] = [];
  const goalsById = new Map(goals.map((goal) => [goal.goal_id, goal]));
  const seen = new Map<string, ActiveRelation>();
  for (const relation of relations.filter((item) => item.state === "active")) {
    const endpoints = [relation.from_goal_id, relation.to_goal_id];
    const missing = endpoints.filter((goalId) => !goalsById.has(goalId));
    if (missing.length) {
      issues.push({ code: "planning.goal_missing", message: `关系引用了不存在的 Goal：${missing.join("、")}`, goal_ids: missing, relation_ids: [relation.relation_id], path: endpoints });
      continue;
    }
    const trashed = endpoints.filter((goalId) => goalsById.get(goalId)?.trashed_at);
    if (trashed.length) issues.push({ code: "planning.goal_trashed", message: `生效关系引用了回收站 Goal：${trashed.join("、")}`, goal_ids: trashed, relation_ids: [relation.relation_id], path: endpoints });
    if (relation.from_goal_id === relation.to_goal_id) issues.push({ code: "planning.relation_self_reference", message: `Goal「${relation.from_goal_id}」不能关联自身`, goal_ids: [relation.from_goal_id], relation_ids: [relation.relation_id], path: endpoints });
    const key = relationKey(relation);
    const prior = seen.get(key);
    if (prior) issues.push({ code: "planning.relation_duplicate", message: `重复的生效关系：${relation.from_goal_id} → ${relation.to_goal_id}`, goal_ids: endpoints, relation_ids: [prior.relation_id, relation.relation_id], path: endpoints });
    else seen.set(key, relation);
  }

  const active = relations.filter((relation) => relation.state === "active");
  const partCycle = findCycle(edgesFor(active, "part_of"));
  if (partCycle) issues.push({ code: "planning.part_of_cycle", message: `父子关系形成循环：${partCycle.join(" → ")}`, goal_ids: [...new Set(partCycle)], relation_ids: relationIdsForPath(active, partCycle, "part_of"), path: partCycle });
  const dependencyCycle = findCycle(edgesFor(active, "depends_on"));
  if (dependencyCycle) issues.push({ code: "planning.dependency_cycle", message: `依赖关系形成循环：${dependencyCycle.join(" → ")}`, goal_ids: [...new Set(dependencyCycle)], relation_ids: relationIdsForPath(active, dependencyCycle, "depends_on"), path: dependencyCycle });
  if (!partCycle && !dependencyCycle) {
    const executionCycle = findCycle(edgesFor(active, "execution"));
    if (executionCycle) issues.push({ code: "planning.execution_cycle", message: `父子与依赖组合后形成执行循环：${executionCycle.join(" → ")}`, goal_ids: [...new Set(executionCycle)], relation_ids: relationIdsForPath(active, executionCycle, "execution"), path: executionCycle });
  }
  return issues;
}

function reachable(edges: Map<string, Set<string>>, start: string): Set<string> {
  const found = new Set<string>();
  const pending = [...(edges.get(start) ?? [])];
  while (pending.length) {
    const current = pending.shift()!;
    if (found.has(current)) continue;
    found.add(current);
    pending.push(...(edges.get(current) ?? []));
  }
  return found;
}

export type PlanningWorkStatus = "open" | "completed" | "cancelled";

function currentWorkStatus(
  goalId: string,
  currentWork?: ReadonlyMap<string, PlanningWorkStatus>,
): PlanningWorkStatus {
  return currentWork?.get(goalId) ?? "open";
}

export function planningMetrics(
  goals: readonly Pick<GoalRecord, "goal_id" | "fulfillment_state" | "trashed_at">[],
  relations: readonly ActiveRelation[],
  currentWork?: ReadonlyMap<string, PlanningWorkStatus>,
): Map<string, PlanningMetric> {
  const activeGoalIds = new Set(goals.filter((goal) => !goal.trashed_at).map((goal) => goal.goal_id));
  const edges = edgesFor(relations.filter((relation) => relation.state === "active"), "execution");
  for (const goalId of activeGoalIds) if (!edges.has(goalId)) edges.set(goalId, new Set());
  const incoming = new Map<string, number>([...edges.keys()].map((goalId) => [goalId, 0]));
  for (const targets of edges.values()) for (const target of targets) incoming.set(target, (incoming.get(target) ?? 0) + 1);
  const pending = [...incoming.entries()].filter(([, count]) => count === 0).map(([goalId]) => goalId).sort();
  const level = new Map<string, number>([...edges.keys()].map((goalId) => [goalId, 0]));
  while (pending.length) {
    const current = pending.shift()!;
    for (const next of edges.get(current) ?? []) {
      level.set(next, Math.max(level.get(next) ?? 0, (level.get(current) ?? 0) + 1));
      incoming.set(next, (incoming.get(next) ?? 1) - 1);
      if (incoming.get(next) === 0) pending.push(next);
    }
    pending.sort();
  }
  const memo = new Map<string, number>();
  const longest = (goalId: string, visiting = new Set<string>()): number => {
    if (memo.has(goalId)) return memo.get(goalId)!;
    if (visiting.has(goalId)) return 0;
    visiting.add(goalId);
    const value = Math.max(0, ...[...(edges.get(goalId) ?? [])].map((next) => 1 + longest(next, visiting)));
    visiting.delete(goalId);
    memo.set(goalId, value);
    return value;
  };
  return new Map([...activeGoalIds].map((goalId) => {
    const unlocks = [...reachable(edges, goalId)].filter((candidate) => currentWorkStatus(candidate, currentWork) !== "completed").length;
    return [goalId, { goal_id: goalId, topological_level: level.get(goalId) ?? 0, unlock_count: unlocks, longest_downstream_chain: longest(goalId) }];
  }));
}

export function analyzeGoalChangeImpact(
  goals: readonly Pick<GoalRecord, "goal_id" | "decomposition_state" | "fulfillment_state" | "trashed_at">[],
  relations: readonly ActiveRelation[],
  changedGoalIds: readonly string[],
  currentWork?: ReadonlyMap<string, PlanningWorkStatus>,
): GoalChangeImpact {
  const active = relations.filter((relation) => relation.state === "active");
  const ancestors = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  const dependencies = new Map<string, Set<string>>();
  for (const relation of active) {
    if (relation.type === "part_of") addEdge(ancestors, relation.from_goal_id, relation.to_goal_id);
    if (relation.type === "depends_on") {
      addEdge(dependents, relation.to_goal_id, relation.from_goal_id);
      addEdge(dependencies, relation.from_goal_id, relation.to_goal_id);
    }
  }
  const changed = [...new Set(changedGoalIds)];
  const changedSet = new Set(changed);
  const affectedAncestors = new Set<string>();
  const affectedDependents = new Set<string>();
  const adjacentDependencies = new Set<string>();
  for (const goalId of changed) {
    for (const candidate of reachable(ancestors, goalId)) affectedAncestors.add(candidate);
    for (const candidate of reachable(dependents, goalId)) affectedDependents.add(candidate);
    for (const candidate of dependencies.get(goalId) ?? []) adjacentDependencies.add(candidate);
  }
  for (const goalId of changedSet) {
    affectedAncestors.delete(goalId);
    affectedDependents.delete(goalId);
    adjacentDependencies.delete(goalId);
  }
  const related = new Set([
    ...changed,
    ...affectedAncestors,
    ...affectedDependents,
    ...adjacentDependencies,
  ]);
  const reusable = goals.filter((goal) => related.has(goal.goal_id) && !goal.trashed_at && currentWorkStatus(goal.goal_id, currentWork) === "open").map((goal) => goal.goal_id);
  const metrics = planningMetrics(goals, active, currentWork);
  const reviewOrder = [...related].sort((left, right) => (metrics.get(left)?.topological_level ?? 0) - (metrics.get(right)?.topological_level ?? 0) || left.localeCompare(right));
  return {
    changed_goal_ids: changed,
    affected_ancestors: [...affectedAncestors].sort(),
    affected_dependents: [...affectedDependents].sort(),
    adjacent_dependencies: [...adjacentDependencies].sort(),
    reusable_open_goal_ids: reusable.sort(),
    review_order: reviewOrder,
    graph_issues: validatePlanningGraph(goals, active),
  };
}
