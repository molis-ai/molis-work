import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
export type DecisionEventKind = "goalTree";

const HANDLED_DECISION_EVENT_TYPES: Record<DecisionEventKind, ReadonlySet<string>> = {
  goalTree: new Set(["goal_tree_proposal.decided"]),
};

export interface GoalsDecisionPresentationPrimitives {
  translate(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
}

/** Shared decision explanations and markup, with host-owned translation and escaping. */
export function createGoalsDecisionPresentation({ escapeHtml }: GoalsDecisionPresentationPrimitives) {
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
    ? `<span class="decision-new" title="${uiText("goals.decision-common-ui.item-was-created-after-most-recent-decision")}">${uiText("goals.decision-common-ui.new")}</span>`
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
    <section><h4>${uiText("goals.decision-common-ui.why-decide-now")}</h4><p>${escapeHtml(options.whyNow)}</p></section>
    <section class="decision-recommendation${options.recommendation ? " has-recommendation" : ""}"><h4>${uiText("goals.decision-common-ui.suggested")}</h4><strong>${escapeHtml(options.recommendation ?? uiText.text("goals.decision-common-ui.there-not-enough-evidence-reliable-recommendation"))}</strong><p>${escapeHtml(options.recommendation ? options.recommendationBasis ?? "" : options.insufficient)}</p></section>
    <section class="decision-consequences"><h4>${uiText("goals.decision-common-ui.what-happens-after-choose")}</h4><dl>${options.consequences.map((item) => `<div><dt>${escapeHtml(item.choice)}</dt><dd>${escapeHtml(item.effect)}</dd></div>`).join("")}</dl></section>
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
  const title = options.title ?? uiText.text("goals.decision-common-ui.proposal");
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

function proposedGoalNextStage(): string {
  return uiText.text("goals.decision-common-ui.can-then-record-progress-goal-its-agreed-requirements");
}

  return { renderNewDecisionBadge, renderDecisionGuidance, renderDecisionScenario, proposedGoalNextStage };
}
