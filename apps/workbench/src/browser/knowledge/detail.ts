import type { KnowledgeCardRecord, KnowledgeEditableField, KnowledgeReceiptsResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { button, count, el, L, readerOf, when } from "./common.js";

/** What the detail needs from its page: the routes, and a way to put a changed card back into the list. */
export interface KnowledgeDetailHost {
  api<T>(path: string, body?: unknown): Promise<T>;
  replaced(card: KnowledgeCardRecord): void;
  organize(card: KnowledgeCardRecord): Promise<void>;
  fail(error: unknown): void;
  toast(text: string): void;
}

const FIELDS = (): Array<{ field: KnowledgeEditableField; label: string }> => [
  { field: "title", label: L("标题") }, { field: "brief", label: L("简介") }, { field: "keywords", label: L("关键词") },
];
const shown = (card: KnowledgeCardRecord, field: KnowledgeEditableField): string => field === "keywords" ? card.keywords.join("、") : card[field];
const suggested = (card: KnowledgeCardRecord, field: KnowledgeEditableField): string | null => {
  const value = card.suggestion?.[field];
  if (value === undefined) return null;
  return Array.isArray(value) ? value.join("、") : value;
};
const keywordsOf = (text: string): string[] => text.split(/[,，、;；\n]/u).map(word => word.trim()).filter(Boolean);

/**
 * One piece's card, opened under its row: the three fields the person may write (marked when they did), the newer writing
 * organizing put beside a field the person kept, the section notes, why organizing failed, and who read it lately.
 */
export function renderDetail(card: KnowledgeCardRecord, host: KnowledgeDetailHost): HTMLElement {
  const box = el("div", "knowledge-detail");
  box.dataset.knowledgeDetail = "";
  if (card.state === "failed") {
    const failed = el("div", "knowledge-failed");
    const retry = button(L("重试"), "mw-btn--secondary");
    retry.addEventListener("click", () => void host.organize(card));
    failed.append(el("span", "", L("整理失败：") + (card.error || L("没有给出原因"))), retry);
    box.append(failed);
  }
  if (card.state === "listed") box.append(el("p", "settings-muted", L("这份资料的主人只让出标题和摘要，正文不交给模型整理，卡片用主人给的标题与摘要。")));
  if (card.state === "missing") box.append(el("p", "settings-muted", L("这份资料现在不在项目的目录里（可能被移走或停用）。你改过的卡片先留着，资料回来时接上。")));
  const form = el("form", "knowledge-fields");
  const inputs = new Map<KnowledgeEditableField, HTMLInputElement | HTMLTextAreaElement>();
  for (const { field, label } of FIELDS()) {
    const row = el("label", "knowledge-field");
    const head = el("span", "knowledge-field-head", label);
    if (card.edited.includes(field)) head.append(el("span", "knowledge-mark", L("你改过")));
    const input = field === "brief" ? el("textarea", "mw-textarea") : el("input", "mw-input");
    if (input instanceof HTMLTextAreaElement) input.rows = 3;
    input.value = shown(card, field);
    input.dataset.knowledgeField = field;
    inputs.set(field, input);
    row.append(head, input);
    const proposal = suggested(card, field);
    if (proposal !== null) {
      const line = el("div", "knowledge-suggestion");
      const adopt = button(L("采用"), "mw-btn--secondary", L("采用整理的新建议") + " · " + label);
      adopt.dataset.knowledgeAdopt = field;
      adopt.addEventListener("click", () => void save({ adopt: [field] }, L("已采用新建议")));
      line.append(el("span", "", L("原文变了，整理的新建议：") + (proposal || L("（空）"))), adopt);
      row.append(line);
    }
    form.append(row);
  }
  const actions = el("div", "knowledge-detail-actions");
  const saveButton = el("button", "mw-btn mw-btn--primary mw-btn--sm", L("保存卡片"));
  saveButton.type = "submit";
  const organize = button(L("重新整理"), "mw-btn--secondary");
  organize.addEventListener("click", () => void host.organize(card));
  const keep = el("label", "knowledge-exclude");
  const toggle = el("input");
  toggle.type = "checkbox";
  toggle.checked = card.excluded;
  toggle.dataset.knowledgeExcluded = "";
  toggle.addEventListener("change", () => void exclude(toggle.checked));
  keep.append(toggle, el("span", "", L("不给 Agent 用")));
  actions.append(saveButton, organize, keep);
  form.append(actions);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const change: Record<string, unknown> = {};
    for (const [field, input] of inputs) {
      const value = input.value.trim();
      if (value === shown(card, field)) continue;
      change[field] = field === "keywords" ? keywordsOf(value) : value;
    }
    if (!Object.keys(change).length) { host.toast(L("没有改动")); return; }
    void save(change, L("已保存"));
  });
  box.append(form);
  if (card.outline.length) {
    const outline = el("details", "knowledge-outline");
    outline.append(el("summary", "", L("分节摘要（{count} 节）", { count: card.outline.length })));
    const list = el("ol");
    for (const note of card.outline) {
      const item = el("li");
      item.append(el("strong", "", note.title), el("span", "", note.summary));
      list.append(item);
    }
    outline.append(list);
    box.append(outline);
  }
  const used = el("div", "knowledge-detail-receipts", L("正在读取使用记录…"));
  box.append(used);
  void host.api<KnowledgeReceiptsResponse>("/receipts?kind=" + encodeURIComponent(card.subject.kind) + "&id=" + encodeURIComponent(card.subject.id)).then(result => {
    used.textContent = result.total ? L("最近被读过 {count} 次：", { count: result.total }) : L("还没有 Agent 读过它的原文。");
    for (const receipt of result.receipts.slice(0, 5)) used.append(el("span", "knowledge-receipt-inline", readerOf(receipt) + " · " + when(receipt.at) + " · " + L("{chars} 字", { chars: count(receipt.chars) })));
  }, () => { used.textContent = L("使用记录暂时读不到。"); });

  async function save(change: Record<string, unknown>, done: string) {
    try {
      host.replaced(await host.api<KnowledgeCardRecord>("/edit", { subject: card.subject, ...change }));
      host.toast(done);
    } catch (error) { host.fail(error); }
  }
  async function exclude(excluded: boolean) {
    try {
      host.replaced(await host.api<KnowledgeCardRecord>("/exclude", { subject: card.subject, excluded }));
      host.toast(excluded ? L("Agent 不会再找到或读到它") : L("Agent 又能找到它了"));
    } catch (error) { toggle.checked = !excluded; host.fail(error); }
  }
  return box;
}
