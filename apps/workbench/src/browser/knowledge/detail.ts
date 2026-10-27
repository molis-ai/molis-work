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
 * What the person typed into a card and has not saved, by piece: the card is drawn again when its exclusion changes, a suggestion
 * is adopted or the page refreshes, and their words come back with it.
 */
const drafts = new Map<string, Partial<Record<KnowledgeEditableField, string>>>();
const draftKey = (card: KnowledgeCardRecord) => card.subject.kind + "\u0000" + card.subject.id;

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
  if (card.state === "listed") box.append(el("p", "settings-muted", card.content_policy === "summary" ? L("这份资料的主人只让出标题和摘要，正文不交给模型整理，卡片用主人给的标题与摘要。")
    : card.can_organize ? L("恢复后未自动整理，可按需手动整理。") : L("读不出这份资料的正文（比如图片或二进制文件），不交给模型整理；卡片用它的标题与摘要，Agent 只能看到这些。")));
  if (card.excluded && card.state === "pending") box.append(el("p", "settings-muted", L("不给 Agent 用的资料不交给模型整理；取消这个设置后再整理。")));
  if (card.state === "missing") box.append(el("p", "settings-muted", L("这份资料现在不在项目的目录里（可能被移走或停用）。你改过的卡片先留着，资料回来时接上。")));
  const form = el("form", "knowledge-fields");
  const inputs = new Map<KnowledgeEditableField, HTMLInputElement | HTMLTextAreaElement>();
  const unsaved = drafts.get(draftKey(card)) ?? {};
  const dirty = () => { if ([...inputs].some(([field, input]) => input.value !== shown(card, field))) box.dataset.knowledgeDirty = ""; else delete box.dataset.knowledgeDirty; };
  for (const { field, label } of FIELDS()) {
    const row = el("label", "knowledge-field");
    const head = el("span", "knowledge-field-head", label);
    if (card.edited.includes(field)) head.append(el("span", "knowledge-mark", L("你改过")));
    const input = field === "brief" ? el("textarea", "mw-textarea") : el("input", "mw-input");
    if (input instanceof HTMLTextAreaElement) input.rows = 3;
    input.value = unsaved[field] ?? shown(card, field);
    input.dataset.knowledgeField = field;
    input.addEventListener("input", () => { drafts.set(draftKey(card), { ...drafts.get(draftKey(card)), [field]: input.value }); dirty(); });
    inputs.set(field, input);
    row.append(head, input);
    const proposal = suggested(card, field);
    if (proposal !== null) {
      const line = el("div", "knowledge-suggestion");
      const adopt = button(L("采用"), "mw-btn--secondary", L("采用整理的新建议") + " · " + label);
      adopt.dataset.knowledgeAdopt = field;
      adopt.addEventListener("click", () => void save({ adopt: [field] }, L("已采用新建议")));
      line.append(el("span", "", L("整理给出的新写法：") + (proposal || L("（空）"))), adopt);
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
  organize.hidden = card.excluded || (card.state === "listed" && !card.can_organize) || card.state === "missing";
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
  dirty();
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
      const saved = await host.api<KnowledgeCardRecord>("/edit", { subject: card.subject, ...change });
      // What was saved, or given back to organizing, is no longer a draft; what else the person typed stays one.
      const left = { ...drafts.get(draftKey(card)) };
      for (const field of [...Object.keys(change), ...(change.adopt as KnowledgeEditableField[] | undefined) ?? []]) delete left[field as KnowledgeEditableField];
      if (Object.keys(left).length) drafts.set(draftKey(card), left); else drafts.delete(draftKey(card));
      host.replaced(saved);
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
