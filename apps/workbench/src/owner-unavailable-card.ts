import { t as uiText, escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * Why one part of the product cannot be used (upgrade-continuity U3 design §2.4). The first four come from an upgrade; `unreadable` is a store
 * that refused for a reason of its own (a structure that does not match), which the Home plugin ledger has had its own page for.
 */
export type OwnerUnavailableReason = "upgrade_failed" | "store_too_new" | "upgrade_no_space" | "snapshot_invalid" | "unreadable";

/** What the card says. The Host decides every field; the card only draws it. */
export interface OwnerUnavailableCard {
  /** The part's name in the person's words: a plugin's name, a project's, a settings page's. */
  readonly title: string;
  readonly reason: OwnerUnavailableReason;
  /** The number to quote (`D-` and eight hex digits), the same one the Host's log carries. */
  readonly diagnostic_id: string;
  /** Where 「回到上一版」 opens its confirmation, when there is a version to go back to. */
  readonly rollback_href: string | null;
  /** Where 「重新加载」 goes; null when there is no page to reload into. */
  readonly reload_href: string | null;
}

/** A store from a newer version stays refused however often the page reloads, and its backup is no way back either. */
const RELOADS: Readonly<Record<OwnerUnavailableReason, boolean>> = { upgrade_failed: true, store_too_new: false, upgrade_no_space: true, snapshot_invalid: true, unreadable: true };
const REASON_TEXT: Readonly<Record<OwnerUnavailableReason, string>> = {
  upgrade_failed: "workbench.owner-unavailable.upgrade-failed", store_too_new: "workbench.owner-unavailable.store-too-new",
  upgrade_no_space: "workbench.owner-unavailable.upgrade-no-space", snapshot_invalid: "workbench.owner-unavailable.snapshot-invalid",
  unreadable: "workbench.owner-unavailable.unreadable",
};
const ROLLS_BACK: Readonly<Record<OwnerUnavailableReason, boolean>> = { upgrade_failed: true, store_too_new: false, upgrade_no_space: false, snapshot_invalid: false, unreadable: false };

/**
 * The card in place of the part (定样「某块暂不可用」, 11-04): the part's name, one sentence of why, and the ways out beside it. Nothing else on
 * the page changes. The diagnostic number is a copy button (`data-copy-value`), answered by the page's copy feedback.
 */
export function renderOwnerUnavailableCard(card: OwnerUnavailableCard, announce = true): string {
  const rollback = card.rollback_href && ROLLS_BACK[card.reason]
    ? `<a class="mw-btn mw-btn--primary mw-btn--sm" href="${escapeHtml(card.rollback_href)}" data-owner-unavailable-rollback>${escapeHtml(uiText.text("workbench.owner-unavailable.rollback"))}</a>` : "";
  const reload = card.reload_href && RELOADS[card.reason]
    ? `<a class="mw-btn mw-btn--secondary mw-btn--sm" href="${escapeHtml(card.reload_href)}">${escapeHtml(uiText.text("workbench.owner-unavailable.reload"))}</a>` : "";
  const copy = `<button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-copy-value="${escapeHtml(card.diagnostic_id)}" aria-label="${escapeHtml(uiText.text("workbench.owner-unavailable.copy-diagnostic", { id: card.diagnostic_id }))}">${icon("copy")}<span>${escapeHtml(card.diagnostic_id)}</span></button>`;
  return `<div class="mw-empty" data-slot="empty" data-owner-unavailable="${card.reason}"${announce ? ' role="alert"' : ""}><span class="mw-empty__mark">${icon("circle-alert")}</span>`
    + `<h2 tabindex="-1">${escapeHtml(uiText.text("workbench.owner-unavailable.title", { part: card.title }))}</h2>`
    + `<p>${escapeHtml(uiText.text(REASON_TEXT[card.reason]))}</p><p>${escapeHtml(uiText.text("workbench.owner-unavailable.rest-works"))}</p>`
    + `<div class="mw-empty__actions">${rollback}${reload}${copy}</div></div>`;
}
