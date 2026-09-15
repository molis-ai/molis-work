import type { GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsTreeItem, GoalsTreeView, GoalVisibleStatus } from "./tree-ui-model.js";
import type { GoalPresentationState } from "./tree-order.js";

/** Presentation only: consume recorded state, never resolve execution eligibility. */
export function findGoalTreeItem<T extends GoalsTreeItem>(view: GoalsTreeView<T>, goalId: string): T | null {
  return [...view.goals, ...view.archived_goals].find(item => item.goal.goal_id === goalId) ?? null;
}
export function visibleGoalStatus(item: Pick<GoalsTreeItem, "status" | "display_status">): GoalVisibleStatus {
  if (item.status === "archived" || item.status === "trashed") {
    return item.status;
  }
  return item.display_status;
}

export function treeDependencySearchText(item: GoalsTreeItem, view: GoalsTreeView): string {
  return activeOutgoingDependsOn(item)
    .map((relation) => {
      const target = findGoalTreeItem(view, relation.to_goal_id);
      return `${relation.to_goal_id} ${target?.goal.title ?? ""} ${relation.reason}`;
    })
    .join(" ");
}

export function activeOutgoingDependsOn(item: GoalsTreeItem): GoalRelationRecord[] {
  return item.relations.filter(
    (relation) =>
      relation.type === "depends_on" &&
      relation.state === "active" &&
      relation.from_goal_id === item.goal.goal_id,
  );
}

export function goalWorkSatisfied(item: GoalsTreeItem): boolean {
  return (
    item.display_status === "completed" ||
    item.goal.fulfillment_state === "satisfied"
  );
}

/**
 * Presentation progress follows the authoritative Goal result. Evidence remains
 * a separate fact: a compound Goal can be satisfied through its children and a
 * human decision without producing one direct Evidence row per criterion.
 */
export function displayedPassedCriterionIds(item: GoalsTreeItem): string[] {
  const criterionIds = item.goal.acceptance_criteria.map((criterion) => criterion.criterion_id);
  if (goalWorkSatisfied(item)) return criterionIds;
  const knownCriterionIds = new Set(criterionIds);
  return [...new Set(item.passed_criteria.filter((criterionId) => knownCriterionIds.has(criterionId)))];
}

export function isBlockedWorkStatus(status: GoalPresentationState): boolean {
  return status.endsWith("_blocked") || status === "invalidated";
}

export function partOfChildViews<T extends GoalsTreeItem>(parentId: string, view: GoalsTreeView<T>): T[] {
  return view.snapshot.relations
    .filter(
      (relation) =>
        relation.type === "part_of" &&
        relation.state === "active" &&
        relation.to_goal_id === parentId,
    )
    .map((relation) => findGoalTreeItem(view, relation.from_goal_id))
    .filter((item): item is T => item != null);
}

export function firstBlockedDescendant<T extends GoalsTreeItem>(
  item: T,
  view: GoalsTreeView<T>,
  seen = new Set<string>(),
): T | null {
  if (seen.has(item.goal.goal_id)) return null;
  seen.add(item.goal.goal_id);
  const children = partOfChildViews(item.goal.goal_id, view);
  const blocked = children.find((child) => isBlockedWorkStatus(child.status));
  if (blocked) return blocked;
  for (const child of children) {
    const nested = firstBlockedDescendant(child, view, seen);
    if (nested) return nested;
  }
  return null;
}

export function unsatisfiedOutgoingDependencies<T extends GoalsTreeItem>(item: T, view: GoalsTreeView<T>): T[] {
  return activeOutgoingDependsOn(item)
    .map((relation) => findGoalTreeItem(view, relation.to_goal_id))
    .filter((target): target is T => target != null && !goalWorkSatisfied(target));
}

export function goalTreeReferenceLabel(goalId: string): string | null {
  const normalized = goalId.trim();
  const hierarchicalCode = normalized
    .split(/[-_.:/\s]+/)
    .find((segment) => /^g\d+[a-z]?$/i.test(segment));
  if (hierarchicalCode) return hierarchicalCode.toUpperCase();
  if (/^[a-z]{1,3}\d+[a-z]?$/i.test(normalized)) return normalized.toUpperCase();
  return null;
}

const GOAL_REFERENCE_GENERIC_SUFFIXES = new Set([
  "ai",
  "baseline",
  "goal",
  "kol",
  "list",
  "quality",
  "roster",
]);

function goalTreeReferenceSuffix(goalId: string, referenceLabel: string): { compact: string; full: string } {
  const segments = goalId.trim().split(/[-_.:/\s]+/).filter(Boolean);
  const referenceIndex = segments.findIndex((segment) => segment.toUpperCase() === referenceLabel);
  if (referenceIndex < 0) return { compact: "", full: "" };
  const suffix = segments.slice(referenceIndex + 1);
  return {
    compact: suffix.filter((segment) => !GOAL_REFERENCE_GENERIC_SUFFIXES.has(segment.toLowerCase())).join("-").toUpperCase(),
    full: suffix.join("-").toUpperCase(),
  };
}

export function goalTreeReferenceLabels(goalIds: readonly string[]): Map<string, string> {
  const labels = new Map<string, string>();
  const groups = new Map<string, string[]>();
  for (const goalId of goalIds) {
    const base = goalTreeReferenceLabel(goalId);
    if (!base) continue;
    groups.set(base, [...(groups.get(base) ?? []), goalId]);
  }
  for (const [base, groupedGoalIds] of groups) {
    if (groupedGoalIds.length === 1) {
      labels.set(groupedGoalIds[0]!, base);
      continue;
    }
    const suffixes = groupedGoalIds.map((goalId) => ({ goalId, ...goalTreeReferenceSuffix(goalId, base) }));
    const baseEntry = suffixes
      .filter((entry) => !entry.compact)
      .sort((left, right) => left.full.length - right.full.length || left.goalId.localeCompare(right.goalId))[0];
    if (baseEntry) labels.set(baseEntry.goalId, base);
    const usedDiscriminators = new Set<string>();
    const entriesToDisambiguate = suffixes
      .filter((entry) => entry.goalId !== baseEntry?.goalId)
      .map((entry) => ({ ...entry, source: entry.compact || entry.full || entry.goalId.toUpperCase() }))
      .sort((left, right) => left.source.length - right.source.length || left.source.localeCompare(right.source));
    for (const entry of entriesToDisambiguate) {
      let length = entry.source.length <= 3 ? entry.source.length : 1;
      let discriminator = entry.source.slice(0, length);
      while (usedDiscriminators.has(discriminator) && length < entry.source.length) {
        length += 1;
        discriminator = entry.source.slice(0, length);
      }
      if (usedDiscriminators.has(discriminator)) discriminator = entry.goalId.toUpperCase();
      usedDiscriminators.add(discriminator);
      labels.set(entry.goalId, `${base}/${discriminator}`);
    }
  }
  return labels;
}
