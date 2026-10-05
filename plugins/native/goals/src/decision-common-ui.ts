export type DecisionEventKind = "goalTree";

const HANDLED_DECISION_EVENT_TYPES: Record<DecisionEventKind, ReadonlySet<string>> = {
  goalTree: new Set(["goal_tree_proposal.decided"]),
};

export interface GoalsDecisionPresentationPrimitives {
  translate(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
}

/** Shared decision explanations and markup, with host-owned translation and escaping. */
export function createGoalsDecisionPresentation({ translate: L, escapeHtml }: GoalsDecisionPresentationPrimitives) {
function renderDecisionGoalLink(item: { goal: { goal_id: string; title: string; archived_at: string | null } } | null): string {
  if (!item) return `<span class="decision-owner-link"><strong>${L("整个项目的事项")}</strong><small>${L("没有只属于某一条 Goal")}</small></span>`;
  const base = item.goal.archived_at ? "/archive/goals/" : "/goals/";
  return `<a class="decision-owner-link" href="${base}${encodeURIComponent(item.goal.goal_id)}"><strong>${escapeHtml(item.goal.title)}</strong><small>${L("返回这条 Goal 查看完整信息")}</small></a>`;
}

function renderNewDecisionBadge(
  createdAt: string,
  view: { events: Array<{ object_id: string; type: string; at: string }> },
  kind: DecisionEventKind,
  objectId: string,
): string {
  const handledTypes = HANDLED_DECISION_EVENT_TYPES[kind];
  const alreadyHandled = view.events.some(
    (event) => event.object_id === objectId && handledTypes.has(event.type) && event.at >= createdAt,
  );
  if (alreadyHandled) return "";
  const latestHandled = view.events.find((event) => handledTypes.has(event.type));
  return latestHandled && createdAt >= latestHandled.at
    ? `<span class="decision-new" title="${L("这是最近一次处理后新生成的事项")}">${L("新事项")}</span>`
    : "";
}

function renderDecisionGuidance(options: {
  whyNow: string;
  recommendation: string | null;
  recommendationBasis?: string;
  insufficient: string;
  consequences: Array<{ choice: string; effect: string }>;
}): string {
  return `<div class="decision-guidance">
    <section><h4>${L("为什么现在要决定")}</h4><p>${escapeHtml(options.whyNow)}</p></section>
    <section class="decision-recommendation${options.recommendation ? " has-recommendation" : ""}"><h4>${L("建议")}</h4><strong>${escapeHtml(options.recommendation ?? L("现在没有足够依据给出可靠建议"))}</strong><p>${escapeHtml(options.recommendation ? options.recommendationBasis ?? "" : options.insufficient)}</p></section>
    <section class="decision-consequences"><h4>${L("选完会发生什么")}</h4><dl>${options.consequences.map((item) => `<div><dt>${escapeHtml(item.choice)}</dt><dd>${escapeHtml(item.effect)}</dd></div>`).join("")}</dl></section>
  </div>`;
}

function renderDecisionScenario(options: {
  title?: string;
  contextLabel?: string;
  contextEffect?: string;
  confirmLabel: string;
  confirmEffect: string;
  rejectLabel: string;
  rejectEffect: string;
}): string {
  const title = options.title ?? L("放到当前方案里看");
  const context = options.contextLabel && options.contextEffect
    ? `<div><dt>${escapeHtml(options.contextLabel)}</dt><dd>${escapeHtml(options.contextEffect)}</dd></div>`
    : "";
  return `<section class="decision-scenario" aria-label="${escapeHtml(title)}">
    <h4>${escapeHtml(title)}</h4>
    <dl>
      ${context}
      <div><dt>${escapeHtml(options.confirmLabel)}</dt><dd>${escapeHtml(options.confirmEffect)}</dd></div>
      <div><dt>${escapeHtml(options.rejectLabel)}</dt><dd>${escapeHtml(options.rejectEffect)}</dd></div>
    </dl>
  </section>`;
}

function proposedGoalNextStage(goal: Record<string, unknown>): string {
  const definitionState = String(goal.definition_state ?? "draft");
  const decompositionState = String(goal.decomposition_state ?? "abstract");
  if (definitionState !== "accepted") {
    return L("随后仍是草稿，需要继续澄清，不能开始。");
  }
  if (decompositionState === "closed_compound") {
    return L("随后进入“等待子 Goal”，由子 Goal 推进，不会直接开工。");
  }
  return L("随后进入“待执行”，但仍要由 Runtime 领取后才会开始。");
}

  return { renderDecisionGoalLink, renderNewDecisionBadge, renderDecisionGuidance, renderDecisionScenario, proposedGoalNextStage };
}
