import { api, el, button, glyph, id, placeLayer, toast, type Anchor } from "./w0-dom.js";
import { DIRECT, sampleDraft, TARGET_LABEL, type CreatedItem, type CreateTarget, type Draft, type Hand } from "./w0-model.js";
import type { Slots } from "./w0-slot.js";

interface CreatePorts {
  refresh(): Promise<void>; openDocument(id: string): Promise<void>; hideToolbar(): void;
  /** Left → right (context-program §7): after a Shelf or 灵光 creation the right panel shows that place and the new row. */
  reveal(item: CreatedItem): void;
  /** The destinations this judgment ranked for the hand, best first (改放到 lists them). */
  destinations(hand: Hand | undefined): CreateTarget[];
}
const EXAMPLE: Record<CreateTarget, string> = {
  pages: "例如：写一份下周的新手引导验证计划", shelf: "例如：先留着这段，明天和访谈一起看",
  todo: "例如：周五前把导入示例发给设计组", goal: "例如：把新手引导拆成可验证的目标", spark: "例如：样例数据可以按行业分几套",
};
const VERB: Record<CreateTarget, string> = { todo: "记成待办", shelf: "收进 Shelf", pages: "新建文稿", goal: "提交 Goal 提案", spark: "记下灵光" };

export class Creation {
  private readonly directRequests = new Map<string, string>();
  private busy = false;
  private menu: HTMLElement | null = null;
  constructor(private readonly slots: Slots, private readonly ports: CreatePorts) {
    document.addEventListener("pointerdown", event => { if (this.menu && !this.menu.contains(event.target as Node)) this.closeMenu(); });
  }

  /** ✦ 一句话新建 (quick-create §5 ①): one line, Enter drafts underneath in the same panel, then one confirmation. */
  start(target: CreateTarget, anchor: Anchor, back: () => void) {
    this.ports.hideToolbar();
    const panel = this.slots.show({ title: `${TARGET_LABEL[target]} · 一句话新建`, tag: "模拟起草", anchor, returnFocus: back });
    const input = el("input", { class: "mw-input", type: "text", placeholder: EXAMPLE[target], "aria-label": "想创建什么", "data-w0-create-instruction": "" });
    const form = el("form", { class: "w0-oneline" }, glyph("sparkles"), input);
    const draftArea = el("div", { class: "w0-draft", hidden: "" });
    panel.body.append(form, draftArea);
    panel.note.textContent = "回车起草；按样例生成，没有调用 AI";
    let fields: { title: HTMLInputElement; text: HTMLTextAreaElement } | null = null;
    const submit = panel.confirm(VERB[target], () => {
      if (!fields) { form.requestSubmit(); return; }
      this.commitFrom(panel.close, submit, target, { title: fields.title.value, text: fields.text.value, instruction: input.value });
    });
    submit.dataset.w0CreateConfirm = ""; submit.disabled = true;
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!input.value.trim()) { this.slots.error("先写一句想创建什么。"); input.focus(); return; }
      this.slots.clearError();
      fields = this.fields(draftArea, sampleDraft(target, input.value));
      draftArea.hidden = false; submit.disabled = false; this.slots.position(); fields.title.focus();
    });
    this.slots.position(); input.focus();
  }

  /** A prefilled card: proposals, and destinations without undo, are confirmed once without typing (quick-create §8 问 3). */
  draft(target: CreateTarget, draft: Draft, anchor: Anchor, back: () => void, replaceId?: string) {
    this.ports.hideToolbar();
    const panel = this.slots.show({ title: `${replaceId ? "改放到" : "确认"}${TARGET_LABEL[target]}`, tag: "模拟起草", anchor, returnFocus: back });
    const fields = this.fields(panel.body, draft);
    panel.note.textContent = target === "goal" ? "提案要在 Goals 里再确认" : replaceId ? "确认前原条目保留" : "确认才创建";
    const submit = panel.confirm(replaceId ? "确认改放到这里" : VERB[target], () => {
      this.commitFrom(panel.close, submit, target, { ...draft, title: fields.title.value, text: fields.text.value }, replaceId);
    });
    submit.dataset.w0CreateConfirm = ""; this.slots.position(); fields.title.focus();
  }

  private fields(root: HTMLElement, draft: Draft) {
    const title = el("input", { class: "mw-input", type: "text", value: draft.title, maxlength: "200", "data-w0-draft-title": "" });
    const text = el("textarea", { class: "mw-input", rows: "4", "data-w0-draft-text": "" }); text.value = draft.text;
    root.replaceChildren(el("label", {}, el("span", { text: "标题" }), title), el("label", {}, el("span", { text: "内容" }), text));
    return { title, text };
  }

  private requestFor = new WeakMap<HTMLButtonElement, { id: string; input: string }>();
  private commitFrom(close: () => void, submit: HTMLButtonElement, target: CreateTarget, draft: Draft, replaceId?: string) {
    if (submit.dataset.pending) return;
    if (!draft.title.trim() || !draft.text.trim()) { this.slots.error("请补上标题和内容。"); return; }
    const serialized = JSON.stringify(draft), prior = this.requestFor.get(submit);
    const requestId = prior && prior.input === serialized ? prior.id : id();
    this.requestFor.set(submit, { id: requestId, input: serialized });
    const label = submit.textContent ?? ""; submit.dataset.pending = "true"; submit.disabled = true; submit.textContent = "正在保存到预览…";
    void this.commit(requestId, target, draft, undefined, replaceId).then(() => { if (submit.isConnected) close(); })
      .catch(error => { if (submit.isConnected) this.slots.error(error instanceof Error ? error.message : String(error)); })
      .finally(() => { delete submit.dataset.pending; submit.disabled = false; submit.textContent = label; });
  }

  async direct(hand: Hand, target: CreateTarget, replaceId?: string) {
    if (this.busy) return;
    const key = `${hand.id}:${target}:${replaceId ?? ""}`, requestId = this.directRequests.get(key) ?? id();
    this.directRequests.set(key, requestId); this.busy = true;
    try { await this.commit(requestId, target, sampleDraft(target, "", hand.text), hand, replaceId); this.ports.hideToolbar(); }
    catch (error) { toast(error instanceof Error ? error.message : String(error), [button("重试", () => { void this.direct(hand, target, replaceId); })], true); }
    finally { this.busy = false; }
  }

  private async commit(requestId: string, target: CreateTarget, draft: Draft, hand?: Hand, replaceId?: string) {
    const item = await api<CreatedItem>("/api/w0/create", { requestId, target, draft, replaceId });
    await this.ports.refresh();
    this.ports.reveal(item);
    this.result(item, hand); return item;
  }

  async undo(item: CreatedItem) {
    try {
      await api("/api/w0/undo", { id: item.id }); this.directRequests.clear(); await this.ports.refresh();
      toast(`已撤销「${item.title}」`);
    } catch (error) { toast(error instanceof Error ? error.message : String(error), [button("重试撤销", () => { void this.undo(item); })], true); }
  }
  result(item: CreatedItem, hand?: Hand) {
    const actions: HTMLButtonElement[] = [];
    if (item.documentId) actions.push(button("打开", () => { void this.ports.openDocument(item.documentId!).catch(error => toast(String(error), [], true)); }));
    if (DIRECT[item.target]) {
      const undo = button("撤销", () => { void this.undo(item); }); undo.dataset.w0Undo = "";
      const move = button("改放到", () => this.relocate(item, move, hand)); move.append(glyph("chevron-down")); move.dataset.w0Relocate = "";
      move.setAttribute("aria-haspopup", "menu"); move.setAttribute("aria-expanded", "false");
      actions.push(undo, move);
    }
    toast(item.target === "goal" ? `已提交 Goal 提案「${item.title}」，等你在 Goals 里确认` : `已${VERB[item.target]}「${item.title}」`, actions);
  }

  /** 改放到 ▾ lists this judgment's other destinations; a direct one moves at once, a proposal opens its card. */
  private relocate(item: CreatedItem, anchor: HTMLButtonElement, hand?: Hand) {
    if (this.menu) { this.closeMenu(); return; }
    const menu = el("div", { class: "w0-float-menu", role: "menu", "aria-label": "改放到", "data-w0-relocate-menu": "", "data-w0-keep-toast": "" });
    for (const target of this.ports.destinations(hand).filter(other => other !== item.target)) {
      const choice = button(VERB[target], () => {
        this.closeMenu();
        if (DIRECT[target]) void this.direct(hand ?? { id: item.id, title: item.title, text: item.text, place: "side", kind: "note", source: "预览" }, target, item.id);
        else this.draft(target, { title: item.title, text: item.text, instruction: "" }, () => anchor.getBoundingClientRect(), () => anchor.focus(), item.id);
      });
      choice.setAttribute("role", "menuitem"); choice.dataset.w0RelocateTo = target; menu.append(choice);
    }
    menu.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); this.closeMenu(); anchor.focus(); } });
    document.body.append(menu); this.menu = menu; anchor.setAttribute("aria-expanded", "true");
    placeLayer(menu, () => anchor.getBoundingClientRect(), false);
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }
  private closeMenu() {
    this.menu?.remove(); this.menu = null;
    document.querySelector("[data-w0-relocate]")?.setAttribute("aria-expanded", "false");
  }
}
