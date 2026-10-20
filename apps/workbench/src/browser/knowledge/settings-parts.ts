import type { KnowledgeCardRecord, KnowledgeQuota, KnowledgeReadReceipt } from "@molis-ai/molis-work-contracts/services/knowledge";
import { count, el, L, readerOf, request, subjectKey, when } from "./common.js";

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
  root.querySelector("[data-knowledge-quota-text]")!.textContent = L("已整理 {pieces} / {pieceLimit} 份，送给模型 {chars} / {charLimit} 字", {
    pieces: quota.used_pieces, pieceLimit: quota.limit_pieces, chars: count(quota.used_chars), charLimit: count(quota.limit_chars) });
  root.querySelector<HTMLElement>("[data-knowledge-quota-bar]")!.style.width = share + "%";
  root.querySelector(".knowledge-quota-bar")!.setAttribute("aria-valuenow", String(share));
  root.querySelector<HTMLElement>("[data-knowledge-quota-note]")!.hidden = !waiting;
  root.querySelector<HTMLElement>("[data-knowledge-confirm]")!.hidden = !waiting;
}

/** Who read which piece's original lately, newest first. */
export function drawReceipts(root: HTMLElement, recent: readonly KnowledgeReadReceipt[], cards: readonly KnowledgeCardRecord[], total: number): void {
  const box = root.querySelector("[data-knowledge-receipts]")!;
  if (!recent.length) { box.replaceChildren(el("li", "settings-muted", L("还没有 Agent 读过资料原文。"))); return; }
  const titles = new Map(cards.map(card => [subjectKey(card.subject), card.title]));
  box.replaceChildren(...recent.map(receipt => {
    const item = el("li", "knowledge-receipt");
    const what = titles.get(subjectKey(receipt.subject)) ?? receipt.subject.id;
    item.append(el("strong", "", readerOf(receipt)),
      el("span", "", (receipt.via === "grep" ? L("逐行查找到「{title}」", { title: what }) : L("读了「{title}」", { title: what })) + " · " + L("{chars} 字", { chars: count(receipt.chars) })),
      el("span", "settings-muted", when(receipt.at)));
    return item;
  }));
  if (total > recent.length) box.append(el("li", "settings-muted", L("只列出最近 {count} 条。", { count: recent.length })));
}
