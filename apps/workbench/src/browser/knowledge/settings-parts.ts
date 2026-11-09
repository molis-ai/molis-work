import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { KnowledgeCardRecord, KnowledgeQuota, KnowledgeReadReceipt } from "@molis-ai/molis-work-contracts/services/knowledge";
import { count, el, readerOf, request, subjectKey, when } from "./common.js";

/** The page's notices: a short toast for what went well, the error box and a longer toast for what did not. */
export function pageNotices(errorBox: HTMLElement) {
  const board = () => document.querySelector<HTMLElement>("[data-settings-toast], [data-toast]");
  return {
    toast(text: string) {
      const box = board();
      if (!box) return;
      box.textContent = text; box.classList.remove("is-error"); box.classList.add("is-visible");
      setTimeout(() => box.classList.remove("is-visible"), 2600);
    },
    fail(failure: unknown) {
      request().show(errorBox, failure); errorBox.hidden = false;
      const box = board();
      if (box) request().toast(box, failure, undefined, { ms: 5000 });
    },
  };
}

/** Today's allowance; the confirm button shows only once organizing stopped at it. */
export function drawQuota(root: HTMLElement, quota: KnowledgeQuota, waiting: boolean): void {
  const share = Math.min(100, Math.round(100 * Math.max(quota.used_pieces / Math.max(1, quota.limit_pieces), quota.used_chars / Math.max(1, quota.limit_chars))));
  root.querySelector("[data-knowledge-quota-text]")!.textContent = uiText.text("workbench.settings-parts.pieces-piece-limit-pieces-organized-chars-char-limit", {
    pieces: quota.used_pieces, pieceLimit: quota.limit_pieces, chars: count(quota.used_chars), charLimit: count(quota.limit_chars) });
  root.querySelector<HTMLElement>("[data-knowledge-quota-bar]")!.style.width = share + "%";
  root.querySelector(".knowledge-quota-bar")!.setAttribute("aria-valuenow", String(share));
  root.querySelector<HTMLElement>("[data-knowledge-quota-note]")!.hidden = !waiting;
  root.querySelector<HTMLElement>("[data-knowledge-confirm]")!.hidden = !waiting;
}

/** Who read which piece's original lately, newest first. */
export function drawReceipts(root: HTMLElement, recent: readonly KnowledgeReadReceipt[], cards: readonly KnowledgeCardRecord[], total: number): void {
  const box = root.querySelector("[data-knowledge-receipts]")!;
  if (!recent.length) { box.replaceChildren(el("li", "settings-muted", uiText.text("workbench.settings-parts.no-agent-has-read-original-yet"))); return; }
  const titles = new Map(cards.map(card => [subjectKey(card.subject), card.title]));
  box.replaceChildren(...recent.map(receipt => {
    const item = el("li", "knowledge-receipt");
    const what = titles.get(subjectKey(receipt.subject)) ?? receipt.subject.id;
    item.append(el("strong", "", readerOf(receipt)),
      el("span", "", (receipt.via === "grep" ? uiText.text("workbench.settings-parts.found-lines-title", { title: what }) : uiText.text("workbench.settings-parts.read-title", { title: what })) + " · " + uiText.text("workbench.settings-parts.chars-chars", { chars: count(receipt.chars) })),
      el("span", "settings-muted", when(receipt.at)));
    return item;
  }));
  if (total > recent.length) box.append(el("li", "settings-muted", uiText.text("workbench.settings-parts.only-latest-count-listed", { count: recent.length })));
}
