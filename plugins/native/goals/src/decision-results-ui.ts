import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { createGoalsDecisionResults } from "./decision-results.js";
import type { GoalsDecisionPresentationPrimitives } from "./decision-common-ui.js";
import type { GoalsDecisionView } from "./decision-view.js";

export const GOALS_DECISION_RESULTS_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.decision-results";
export interface GoalsDecisionResultsPrimitives extends GoalsDecisionPresentationPrimitives {
  icon(name: "risk" | "link" | "user" | "plus" | "tree" | "clipboard" | "chevron-right"): string;
  formatDate(value: string | null | undefined): string;
}
export interface GoalsDecisionResultsUiModel { view: GoalsDecisionView; primitives: GoalsDecisionResultsPrimitives; }
export const goalsDecisionResultsUiContribution: UiContribution<GoalsDecisionResultsUiModel> = {
  descriptor: { contribution_id: GOALS_DECISION_RESULTS_UI_CONTRIBUTION_ID, kind: "embedded", label: "Recent Goal decisions",
    surfaces: [{ surface_id: "recent", target_slot_id: "workbench.main", format: "declarative-html" }], slots: [] },
  render({ surface, model }) {
    if (surface !== "recent") throw new Error("Unknown decision results surface");
    const { translate: readText, escapeHtml, icon, formatDate } = model.primitives;
    const { recentDecisionResults } = createGoalsDecisionResults(readText);
function renderRecentDecisionResults(view: GoalsDecisionView): string {
  const results = recentDecisionResults(view);
  if (!results.length) return "";
  return `<section class="decision-results" aria-labelledby="decision-results-title">
    <header><div><h2 id="decision-results-title">${uiText("goals.decision-results-ui.recent-results")}</h2><p>${uiText("goals.decision-results-ui.these-decisions-saved-molis-work-open-related-goal")}</p></div><small>${uiText("goals.decision-results-ui.latest-count", { count: results.length })}</small></header>
    <div class="decision-result-list">${results.map((result) => `<article class="decision-result decision-result--${result.kind}">
      <span class="decision-result-icon">${icon("tree")}</span>
      <div class="decision-result-copy"><div><span>${escapeHtml(result.kindLabel)}</span><strong>${escapeHtml(result.state)}</strong><time datetime="${escapeHtml(result.event.at)}">${formatDate(result.event.at)}</time></div><h3>${escapeHtml(result.title)}</h3>${result.effects.map((effect) => `<p>${escapeHtml(effect)}</p>`).join("")}<small>${escapeHtml(result.reasonLabel ? `${result.reasonLabel}${uiText.text("common.punctuation.label-separator")}${result.reason ?? result.event.reason}` : uiText.text("goals.decision-results-ui.reason-reason", { reason: result.reason ?? result.event.reason }))}</small></div>
      ${result.links.length ? `<div class="decision-result-links">${result.links.map((link) => `<a href="${link.href}">${escapeHtml(link.label)}${icon("chevron-right")}</a>`).join("")}</div>` : ""}
    </article>`).join("")}</div>
  </section>`;
}
    return renderRecentDecisionResults(model.view);
  },
};
