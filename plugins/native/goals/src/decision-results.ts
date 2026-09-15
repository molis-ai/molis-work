import type { GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { allGoalViews } from "./proposal-ui-model.js";
import { goalRiskStateEffect, RISK_STATE_LABELS } from "./risk-presentation.js";
import { GOALS_RELATION_LABELS as RELATION_LABELS } from "./relation-presentation.js";
import type { GoalsDecisionView, GoalsDecisionEvent } from "./decision-view.js";
import type { GoalsSafetyItem } from "./safety-ui-model.js";
import type { GoalsDecisionPresentationPrimitives } from "./decision-common-ui.js";

export interface RecentDecisionResult {
  event: GoalsDecisionEvent;
  kind: "risk" | "rewire" | "goalTree" | "contract" | "candidate" | "review";
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
  const relationById = new Map(view.snapshot.relations.map((relation) => [relation.relation_id, relation]));
  const riskById = new Map(view.snapshot.risks.map((risk) => [risk.risk_id, risk]));
  const rewireById = new Map(view.snapshot.rewires.map((rewire) => [rewire.rewire_id, rewire]));
  const contractById = new Map(view.snapshot.contract_proposals.map((proposal) => [proposal.proposal_id, proposal]));
  const candidateById = new Map(view.snapshot.candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const goalTreeById = new Map(view.snapshot.goal_tree_proposals.map((proposal) => [proposal.proposal_id, proposal]));
  const reviewById = new Map(view.snapshot.reviews.map((review) => [review.review_id, review]));
  const reviewObligationById = new Map(
    view.snapshot.review_obligations.map((obligation) => [obligation.obligation_id, obligation]),
  );

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
    if (event.type === "rewire.applied" || event.type === "rewire.rejected") {
      const rewire = rewireById.get(event.object_id);
      if (!rewire) continue;
      seen.add(seenKey);
      const payload = eventPayload(event);
      const addedIds = stringList(rewire.impact.added_relation_ids ?? payload.added_relation_ids);
      const deactivatedIds = stringList(rewire.impact.deactivated_relation_ids ?? payload.deactivated_relation_ids);
      const addedRiskIds = stringList(rewire.impact.added_risk_ids ?? payload.added_risk_ids);
      const added = addedIds.map((id) => relationById.get(id)).filter((item): item is GoalRelationRecord => Boolean(item));
      const deactivated = deactivatedIds.map((id) => relationById.get(id)).filter((item): item is GoalRelationRecord => Boolean(item));
      const relationEffect = (relation: GoalRelationRecord, action: "add" | "deactivate"): string => {
        const from = goalById.get(relation.from_goal_id)?.goal.title ?? relation.from_goal_id;
        const to = goalById.get(relation.to_goal_id)?.goal.title ?? relation.to_goal_id;
        const labels = RELATION_LABELS[relation.type] ?? { out: relation.type, in: relation.type };
        const summary = L("{from} → {type} → {to}", { from, type: L(labels.out), to });
        return action === "add"
          ? L("已新增关系：{relation}", { relation: summary })
          : L("已解除关系：{relation}", { relation: summary });
      };
      const effects = event.type === "rewire.rejected"
        ? [L("这次调整未采用，现有 Goal 关系没有改变。")]
        : [
            ...added.map((relation) => relationEffect(relation, "add")),
            ...deactivated.map((relation) => relationEffect(relation, "deactivate")),
            ...(addedRiskIds.length ? [L("同时新增了 {count} 项风险。", { count: addedRiskIds.length })] : []),
          ];
      if (event.type === "rewire.applied" && effects.length === 0) {
        effects.push(L("这次决定已记录，但没有新增或解除 Goal 关系，也没有新增风险。"));
      }
      const affectedGoalIds = [...new Set([
        ...added.flatMap((relation) => [relation.from_goal_id, relation.to_goal_id]),
        ...deactivated.flatMap((relation) => [relation.from_goal_id, relation.to_goal_id]),
        String(rewire.proposal.formal_goal_id ?? ""),
      ].filter(Boolean))];
      const relationIdsByGoal = new Map<string, string>();
      for (const relation of [...added, ...deactivated]) {
        if (!relationIdsByGoal.has(relation.from_goal_id)) relationIdsByGoal.set(relation.from_goal_id, relation.relation_id);
        if (!relationIdsByGoal.has(relation.to_goal_id)) relationIdsByGoal.set(relation.to_goal_id, relation.relation_id);
      }
      const links = affectedGoalIds
        .map((goalId) => goalById.get(goalId))
        .filter((item): item is GoalsSafetyItem => Boolean(item))
        .map((item) => ({
          href: goalResultHref(item, relationIdsByGoal.has(item.goal.goal_id)
            ? `relation-${relationIdsByGoal.get(item.goal.goal_id)}`
            : `goal-factor-panel-relations-${item.goal.goal_id}`),
          label: L("查看「{title}」中的关系", { title: item.goal.title }),
        }));
      results.push({
        event,
        kind: "rewire",
        kindLabel: L("Goal 关系"),
        state: event.type === "rewire.applied" ? L("已应用") : L("未采用"),
        title: event.type === "rewire.applied" ? L("Goal 关系调整已应用") : L("Goal 关系调整未采用"),
        effects,
        links,
      });
      continue;
    }
    if (event.type === "contract_proposal.approved" || event.type === "contract_proposal.rejected") {
      const proposal = contractById.get(event.object_id);
      if (!proposal) continue;
      seen.add(seenKey);
      const goal = goalById.get(proposal.goal_id);
      results.push({
        event,
        kind: "contract",
        kindLabel: L("目标说明"),
        state: event.type.endsWith("approved") ? L("已确认") : L("已退回"),
        title: proposal.proposed_goal.title,
        effects: [event.type.endsWith("approved")
          ? L("目标、范围和完成标准已成为正式依据；满足其他条件后可以开始。")
          : L("这份修改没有写入正式目标；修改意见已保留。")],
        links: goal ? [{ href: goalResultHref(goal, `goal-description-${goal.goal.goal_id}`), label: L("查看「{title}」的目标说明", { title: goal.goal.title }) }] : [],
      });
      continue;
    }
    if (event.type === "candidate.approved" || event.type === "candidate.rejected") {
      const candidate = candidateById.get(event.object_id);
      if (!candidate) continue;
      seen.add(seenKey);
      const createdGoalId = String(candidate.decision?.formal_goal_id ?? candidate.proposed_goal.goal_id ?? "");
      const goal = goalById.get(createdGoalId);
      results.push({
        event,
        kind: "candidate",
        kindLabel: L("新发现的工作"),
        state: event.type.endsWith("approved") ? L("已加入") : L("未加入"),
        title: candidate.proposed_goal.title,
        effects: [event.type.endsWith("approved")
          ? L("这项工作已经成为独立 Goal；如果还要调整关系，会继续出现在待决定中。")
          : L("这项工作没有加入 Goal Tree；你的意见已保留。")],
        links: goal ? [{ href: goalResultHref(goal, `goal-description-${goal.goal.goal_id}`), label: L("查看新 Goal「{title}」", { title: goal.goal.title }) }] : [],
      });
      continue;
    }
    if (event.type === "review.submitted") {
      const review = reviewById.get(event.object_id);
      if (!review) continue;
      seen.add(seenKey);
      const goal = goalById.get(review.goal_id);
      const runtimeReview = reviewObligationById.get(review.obligation_id)?.role !== "human_approver";
      const verdictLabels: Record<string, string> = {
        pass: L("已通过"),
        needs_changes: L("需要修改"),
        fail: L("未通过"),
        inconclusive: L("证据不足"),
      };
      results.push({
        event,
        kind: "review",
        kindLabel: runtimeReview ? L("Runtime 复核") : L("结果确认"),
        state: verdictLabels[review.verdict] ?? review.verdict,
        title: goal?.goal.title ?? review.goal_id,
        effects: [runtimeReview
          ? review.verdict === "pass"
            ? L("本次 Runtime 复核已通过；它不能代替用户验收，Goal 是否完成仍由全部完成条件共同决定。")
            : L("本次 Runtime 复核没有通过；后续工作会保留检查者的判断和依据。")
          : review.verdict === "pass"
            ? L("本次用户确认已通过；Goal 是否完成仍由全部完成条件共同决定。")
            : L("本次结果没有确认通过；后续工作会保留你的判断和依据。")],
        links: goal ? [{ href: goalResultHref(goal, `goal-requirements-${goal.goal.goal_id}`), label: L("查看「{title}」的完成情况", { title: goal.goal.title }) }] : [],
        reasonLabel: runtimeReview ? L("复核理由") : undefined,
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
