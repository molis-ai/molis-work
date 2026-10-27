import type {
  GoalEventScope,
} from "@molis-ai/molis-work-contracts/modules/goals";

export const EMPTY_SCOPE: GoalEventScope = {
  requirement_ids: [],
  event_ids: [],
  concern_ids: [],
  action: null,
};

export function normalizeScope(raw?: Partial<GoalEventScope> | null): GoalEventScope {
  return {
    requirement_ids: uniqueStrings(raw?.requirement_ids),
    event_ids: uniqueStrings(raw?.event_ids),
    concern_ids: uniqueStrings(raw?.concern_ids),
    action: raw?.action?.trim() ? raw.action.trim() : null,
  };
}

export function scopeIsSubset(inner: GoalEventScope, outer: GoalEventScope): boolean {
  const outerRequirements = new Set(outer.requirement_ids);
  const outerEvents = new Set(outer.event_ids);
  const outerConcerns = new Set(outer.concern_ids);
  if (inner.requirement_ids.some((id) => !outerRequirements.has(id))) return false;
  if (inner.event_ids.some((id) => !outerEvents.has(id))) return false;
  if (inner.concern_ids.some((id) => !outerConcerns.has(id))) return false;
  if (inner.action && outer.action && inner.action !== outer.action) return false;
  if (inner.action && !outer.action && (outer.requirement_ids.length > 0 || outer.event_ids.length > 0 || outer.concern_ids.length > 0)) {
    return false;
  }
  return true;
}

export function emptyScope(scope: GoalEventScope): boolean {
  return scope.requirement_ids.length === 0
    && scope.event_ids.length === 0
    && scope.concern_ids.length === 0
    && !scope.action;
}

function uniqueStrings(values?: string[]): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}
