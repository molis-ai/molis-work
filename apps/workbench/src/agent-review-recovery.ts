import type { AgentReviewRecoveryView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { UiSayTool, UiTextTool } from "@molis-ai/molis-work-contracts/platform/ui";
import { dateArg, say, t } from "@molis-ai/molis-work-plugin-sdk/ui";

interface RecoveryWords {
  readonly escape: (value: string) => string;
  readonly t: UiTextTool;
  readonly say: UiSayTool;
  readonly dateArg: typeof dateArg;
}

/** One representation of a fixed recovery view. The frame uses the same renderer with its own words and the retained view. */
export function agentReviewRecoveryDocument(view: AgentReviewRecoveryView, { escape, t: uiText, say: readRef, dateArg: date }: RecoveryWords): string {
  const observation = view.observation;
  return `<section class="agent-review-doc" aria-label="${uiText("workbench.agent-review.recovery")}" data-review-recovery-view data-review-revision="${escape(observation?.revision ?? "")}">
    ${typeof view.message === "string" ? `<p role="status" translate="no">${escape(view.message)}</p>` : `<p role="status">${readRef(view.message)}</p>`}
    ${observation ? `<p>${escape(uiText.text("workbench.agent-review.index-observed", { at: date(observation.observed_at, "datetime") }))}</p>${observation.files.map(file => `<details data-review-detail="${escape("recovery:" + file.path)}"><summary><span translate="no">${escape(file.path)}</span> · ${file.mode === null ? uiText("workbench.agent-review.missing") : escape(file.mode)}</summary>${file.text ? `<pre translate="no">${escape(file.text)}</pre>` : `<pre>${uiText(file.text === null ? "workbench.agent-review.not-staged" : "workbench.agent-review.empty-file")}</pre>`}</details>`).join("")}` : ""}
    <button class="mw-btn" type="button" data-review-recheck>${uiText("workbench.agent-review.recheck")}</button>
    ${view.receipt.effect_uncertain ? `<p>${uiText("workbench.agent-review.recovery-hint")}</p>
      <label class="mw-field"><span class="mw-field__label">${uiText("workbench.agent-review.recovery-reason")}</span><textarea class="mw-textarea" data-slot="textarea" data-review-recovery-reason aria-label="${uiText("workbench.agent-review.recovery-reason")}" maxlength="2000" rows="3" ${view.can_confirm_not_happened ? "" : "disabled"}></textarea></label>
      <label class="mw-check-row"><input class="mw-check" type="checkbox" data-review-recovery-confirm ${view.can_confirm_not_happened ? "" : "disabled"}>${uiText("workbench.agent-review.recovery-confirmation")}</label>
      <button class="mw-btn" type="button" data-review-confirm-not ${view.can_confirm_not_happened ? "" : "disabled"}>${uiText("workbench.agent-review.close-not-happened")}</button>` : ""}
    <p data-review-recovery-error role="alert"></p>
  </section>`;
}

export function renderAgentReviewRecovery(view: AgentReviewRecoveryView, escape: (value: string) => string): string {
  return agentReviewRecoveryDocument(view, { escape, t, say, dateArg });
}
