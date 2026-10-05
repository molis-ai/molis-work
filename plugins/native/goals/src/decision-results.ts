import { allGoalViews } from "./proposal-ui-model.js";
import { goalRiskStateEffect, RISK_STATE_LABELS } from "./risk-presentation.js";
import type { GoalsDecisionView, GoalsDecisionEvent } from "./decision-view.js";
import type { GoalsSafetyItem } from "./safety-ui-model.js";
import type { GoalsDecisionPresentationPrimitives } from "./decision-common-ui.js";

export interface RecentDecisionResult {
  event: GoalsDecisionEvent;
  kind: "risk" | "goalTree";
  kindLabel: string;
  state: string;
  title: string;
  effects: string[];
  links: Array<{ href: string; label: string }>;
  reason?: string;
  reasonLabel?: string;
}

export function createGoalsDecisionResults(L: GoalsDecisionPresentationPrimitives["translate"]) {
const riskStateEffect = (blockingMode: Parameters<typeof goalRiskStateEffect>[1], state: Parameters<typeof goalRiskStateEffect>[2]) => goalRiskStateEffect(L, blockingMode, state);

function eventPayload(event: GoalsDecisionEvent): Record<string, unknown> {
  return event.payload != null && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function goalResultHref(item: GoalsSafetyItem, anchor: string): string {
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
  const riskById = new Map(view.snapshot.risks.map((risk) => [risk.risk_id, risk]));
  const goalTreeById = new Map(view.snapshot.goal_tree_proposals.map((proposal) => [proposal.proposal_id, proposal]));

  for (const event of view.events) {
    if (results.length >= 6) break;
    const seenKey = `${event.object_type}:${event.object_id}`;
    if (seen.has(seenKey)) continue;
    if (["risk.open", "risk.triggered", "risk.resolved", "risk.accepted", "risk.expired"].includes(event.type)) {
      const risk = riskById.get(event.object_id);
      if (!risk) continue;
      seen.add(seenKey);
      const payload = eventPayload(event);
      const linkedGoalIds = stringList(payload.linked_goal_ids);
      const goalIds = linkedGoalIds.length
        ? linkedGoalIds
        : allGoals.filter((item) => item.risks.some((candidate) => candidate.risk_id === risk.risk_id)).map((item) => item.goal.goal_id);
      const links = goalIds
        .map((goalId) => goalById.get(goalId))
        .filter((item): item is GoalsSafetyItem => Boolean(item))
        .map((item) => ({
          href: goalResultHref(item, `risk-${risk.risk_id}`),
          label: L("查看「{title}」中的风险", { title: item.goal.title }),
        }));
      const stateEffect = riskStateEffect(risk.blocking_mode, risk.state);
      results.push({
        event,
        kind: "risk",
        kindLabel: L("风险处理"),
        state: L(RISK_STATE_LABELS[risk.state]),
        title: risk.description,
        effects: [L("历史结果：{state}。{effect}", {
              state: L(RISK_STATE_LABELS[risk.state]),
              effect: stateEffect,
            })],
        links,
      });
      continue;
    }
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
        ...(applied ? [L("已采用 {count} 项变化。", { count: applied })] : []),
        ...(rejected ? [L("已退回 {count} 项变化。", { count: rejected })] : []),
        ...(revised ? [L("有 {count} 项需要重新整理。", { count: revised })] : []),
        ...(conflicts ? [L("有 {count} 项因当前内容已变化而未写入。", { count: conflicts })] : []),
      ];
      const stateLabels: Record<string, string> = {
        approved: L("已采用"),
        partially_applied: L("部分已处理"),
        rejected: L("已退回"),
        closed: L("已处理"),
        pending: L("部分已处理"),
      };
      const root = goalById.get(proposal.root_goal_id ?? "");
      const reasons = [...new Set(proposal.decisions.filter((decision) => decision.created_at === event.at).map((decision) => decision.reason).filter(Boolean))];
      results.push({
        event,
        kind: "goalTree",
        kindLabel: L("Goal 方案"),
        state: stateLabels[proposal.state] ?? L("已处理"),
        title: proposal.summary,
        effects: effects.length ? effects : [L("决定已经记录，当前 Goal Tree 没有产生新的变化。")],
        links: root ? [{ href: goalResultHref(root, `goal-description-${root.goal.goal_id}`), label: L("查看「{title}」", { title: root.goal.title }) }] : [],
        reason: reasons.join("；") || event.reason,
      });
    }
  }
  return results;
}
return { recentDecisionResults };
}
