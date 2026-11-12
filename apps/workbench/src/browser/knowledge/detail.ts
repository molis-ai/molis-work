import type { KnowledgeCardRecord, KnowledgeEditableField, KnowledgeReceiptsResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { button, count, el, readerOf, when } from "./common.js";

const uiText = globalThis.t;

/** What the detail needs from its page: the routes, and a way to put a changed card back into the list. */
export interface KnowledgeDetailHost {
  api<T>(path: string, body?: unknown): Promise<T>;
  replaced(card: KnowledgeCardRecord): void;
  organize(card: KnowledgeCardRecord): Promise<void>;
  fail(error: unknown): void;
  toast(text: string): void;
}

const FIELDS = (): Array<{ field: KnowledgeEditableField; label: string }> => [
  { field: "title", label: uiText.text("workbench.knowledge-detail.title") }, { field: "brief", label: uiText.text("workbench.knowledge-detail.brief") }, { field: "keywords", label: uiText.text("workbench.knowledge-detail.keyword") },
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
    const retry = button(uiText.text("common.control.retry"), "mw-btn--secondary");
    retry.addEventListener("click", () => void host.organize(card));
    failed.append(el("span", "", uiText.text("workbench.knowledge-detail.organizing-failed") + (card.error || uiText.text("workbench.knowledge-detail.no-reason-given"))), retry);
    box.append(failed);
  }
  if (card.state === "listed") box.append(el("p", "settings-muted", card.content_policy === "summary" ? uiText.text("workbench.knowledge-detail.piece-s-owner-lets-out-only-its-title")
    : uiText.text("workbench.knowledge-detail.no-text-could-be-read-piece-image-binary")));
  if (card.excluded && card.state === "pending") box.append(el("p", "settings-muted", uiText.text("workbench.knowledge-detail.pieces-kept-agents-not-organized-organized-once-agents")));
  if (card.state === "missing") box.append(el("p", "settings-muted", uiText.text("workbench.knowledge-detail.piece-not-project-s-catalog-now-moved-switched")));
  const form = el("form", "knowledge-fields");
  const inputs = new Map<KnowledgeEditableField, HTMLInputElement | HTMLTextAreaElement>();
  const unsaved = drafts.get(draftKey(card)) ?? {};
  const dirty = () => { if ([...inputs].some(([field, input]) => input.value !== shown(card, field))) box.dataset.knowledgeDirty = ""; else delete box.dataset.knowledgeDirty; };
  for (const { field, label } of FIELDS()) {
    const row = el("label", "knowledge-field");
    const head = el("span", "knowledge-field-head", label);
    if (card.edited.includes(field)) head.append(el("span", "knowledge-mark", uiText.text("workbench.knowledge-detail.edited")));
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
      const adopt = button(uiText.text("workbench.knowledge-detail.adopt"), "mw-btn--secondary", uiText.text("workbench.knowledge-detail.adopt-new-suggestion") + " · " + label);
      adopt.dataset.knowledgeAdopt = field;
      adopt.addEventListener("click", () => void save({ adopt: [field] }, uiText.text("workbench.knowledge-detail.suggestion-adopted")));
      line.append(el("span", "", uiText.text("workbench.knowledge-detail.organizing-suggests") + (proposal || uiText.text("workbench.knowledge-detail.empty"))), adopt);
      row.append(line);
    }
    form.append(row);
  }
  const actions = el("div", "knowledge-detail-actions");
  const saveButton = el("button", "mw-btn mw-btn--primary mw-btn--sm", uiText.text("workbench.knowledge-detail.save-card"));
  saveButton.type = "submit";
  const organize = button(uiText.text("workbench.knowledge-detail.organize-again"), "mw-btn--secondary");
  organize.addEventListener("click", () => void host.organize(card));
  const keep = el("label", "knowledge-exclude");
  const toggle = el("input");
  toggle.type = "checkbox";
  toggle.checked = card.excluded;
  toggle.dataset.knowledgeExcluded = "";
  toggle.addEventListener("change", () => void exclude(toggle.checked));
  keep.append(toggle, el("span", "", uiText.text("workbench.knowledge-detail.kept-agents")));
  organize.hidden = card.excluded || card.state === "listed" || card.state === "missing";
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
    if (!Object.keys(change).length) { host.toast(uiText.text("workbench.knowledge-detail.no-changes")); return; }
    void save(change, uiText.text("workbench.knowledge-detail.saved"));
  });
  box.append(form);
  dirty();
  if (card.outline.length) {
    const outline = el("details", "knowledge-outline");
    outline.append(el("summary", "", uiText.text("workbench.knowledge-detail.section-notes-count", { count: card.outline.length })));
    const list = el("ol");
    for (const note of card.outline) {
      const item = el("li");
      item.append(el("strong", "", note.title), el("span", "", note.summary));
      list.append(item);
    }
    outline.append(list);
    box.append(outline);
  }
  const used = el("div", "knowledge-detail-receipts", uiText.text("workbench.knowledge-detail.loading-reads"));
  box.append(used);
  void host.api<KnowledgeReceiptsResponse>("/receipts?kind=" + encodeURIComponent(card.subject.kind) + "&id=" + encodeURIComponent(card.subject.id)).then(result => {
    used.textContent = result.total ? uiText.text("workbench.knowledge-detail.read-count-count-lately", { count: result.total }) : uiText.text("workbench.knowledge-detail.no-agent-has-read-its-original-yet");
    for (const receipt of result.receipts.slice(0, 5)) used.append(el("span", "knowledge-receipt-inline", readerOf(receipt) + " · " + when(receipt.at) + " · " + uiText.text("workbench.knowledge-detail.chars-chars", { chars: count(receipt.chars) })));
  }, () => { used.textContent = uiText.text("workbench.knowledge-detail.reads-cannot-be-loaded-right-now"); });

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
      host.toast(excluded ? uiText.text("workbench.knowledge-detail.agents-will-no-longer-find-read") : uiText.text("workbench.knowledge-detail.agents-can-find-again"));
    } catch (error) { toggle.checked = !excluded; host.fail(error); }
  }
  return box;
}
