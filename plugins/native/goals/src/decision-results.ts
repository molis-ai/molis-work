import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { allGoalViews } from "./proposal-ui-model.js";
import type { GoalsDecisionItem, GoalsDecisionView, GoalsDecisionEvent } from "./decision-view.js";
import type { GoalsDecisionPresentationPrimitives } from "./decision-common-ui.js";

export interface RecentDecisionResult {
  event: GoalsDecisionEvent;
  kind: "goalTree";
  kindLabel: string;
  state: string;
  title: string;
  effects: string[];
  links: Array<{ href: string; label: string }>;
  reason?: string;
  reasonLabel?: string;
}

export function createGoalsDecisionResults(_L: GoalsDecisionPresentationPrimitives["translate"]) {

function eventPayload(event: GoalsDecisionEvent): Record<string, unknown> {
  return event.payload != null && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function goalResultHref(item: GoalsDecisionItem, anchor: string): string {
  const base = item.goal.trashed_at
    ? "/trash/goals/"
    : item.goal.archived_at
      ? "/archive/goals/"
      : "/goals/";
  return `${base}${encodeURIComponent(item.goal.goal_id)}#${encodeURIComponent(anchor)}`;
}

function recentDecisionResults(view: GoalsDecisionView): RecentDecisionResult[] {
  const results: RecentDecisionResult[] = [];
  const seen = new Set<string>();
  const allGoals = allGoalViews(view);
  const goalById = new Map(allGoals.map((item) => [item.goal.goal_id, item]));
  const goalTreeById = new Map(view.snapshot.goal_tree_proposals.map((proposal) => [proposal.proposal_id, proposal]));

  for (const event of view.events) {
    if (results.length >= 6) break;
    const seenKey = `${event.object_type}:${event.object_id}`;
    if (seen.has(seenKey)) continue;
    if (event.type === "goal_tree_proposal.decided") {
      const proposal = goalTreeById.get(event.object_id);
      if (!proposal) continue;
      seen.add(seenKey);
      const payload = eventPayload(event);
      const applied = stringList(payload.applied_item_ids).length;
      const rejected = stringList(payload.rejected_item_ids).length;
      const revised = stringList(payload.revised_item_ids).length;
      const conflicts = stringList(payload.conflict_item_ids).length;
      const effects = [
        ...(applied ? [uiText.text("goals.decision-results.applied-count-change-s", { count: applied })] : []),
        ...(rejected ? [uiText.text("goals.decision-results.sent-back-count-change-s", { count: rejected })] : []),
        ...(revised ? [uiText.text("goals.decision-results.count-item-s-need-be-revised", { count: revised })] : []),
        ...(conflicts ? [uiText.text("goals.decision-results.count-item-s-were-not-applied-because-current", { count: conflicts })] : []),
      ];
      const stateLabels: Record<string, string> = {
        approved: uiText.text("goals.decision-results.applied"),
        partially_applied: uiText.text("goals.decision-results.partially-handled"),
        rejected: uiText.text("goals.decision-results.sent-back"),
        closed: uiText.text("goals.decision-results.handled"),
        pending: uiText.text("goals.decision-results.partially-handled"),
      };
      const root = goalById.get(proposal.root_goal_id ?? "");
      const reasons = [...new Set(proposal.decisions.filter((decision) => decision.created_at === event.at).map((decision) => decision.reason).filter(Boolean))];
      results.push({
        event,
        kind: "goalTree",
        kindLabel: uiText.text("goals.decision-results.goal-proposal"),
        state: stateLabels[proposal.state] ?? uiText.text("goals.decision-results.handled"),
        title: proposal.summary,
        effects: effects.length ? effects : [uiText.text("goals.decision-results.decision-was-saved-did-not-produce-new-goal")],
        links: root ? [{ href: goalResultHref(root, `goal-description-${root.goal.goal_id}`), label: uiText.text("goals.decision-results.view-title", { title: root.goal.title }) }] : [],
        reason: reasons.join("；") || event.reason,
      });
    }
  }
  return results;
}
return { recentDecisionResults };
}
