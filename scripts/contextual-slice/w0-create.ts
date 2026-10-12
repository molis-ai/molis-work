import { $, api, el, button, id, announce, type Anchor } from "./w0-dom.js";
import { sampleDraft, TARGET_LABEL, type CreatedItem, type CreateTarget, type Draft, type Hand } from "./w0-model.js";
import type { Slots } from "./w0-slot.js";

interface CreatePorts { refresh(): Promise<void>; openDocument(id: string): Promise<void>; hideToolbar(): void }

export class Creation {
  private readonly directRequests = new Map<string, string>();
  private busy = false;
  constructor(private readonly slots: Slots, private readonly ports: CreatePorts) {}

  start(target: CreateTarget, anchor: Anchor, back: () => void, hand?: Hand) {
    this.ports.hideToolbar();
    const panel = this.slots.show(`${TARGET_LABEL[target]} · 一句话新建`, anchor, back);
    const input = el("textarea", { class: "mw-input", rows: "3", placeholder: target === "pages" ? "写一份下周的新手引导验证计划" : "记下刚才想到的一件事", "data-w0-create-instruction": "" });
    const form = el("form", {}, el("label", {}, "想创建什么", input));
    if (hand) form.append(el("p", { text: `带上：${hand.title}` }));
    form.append(el("p", { class: "w0-simulated", text: "模拟起草：保留原话，按样例生成可编辑草稿；没有调用 AI。" }));
    const submit = el("button", { type: "submit", class: "mw-btn mw-btn--primary", text: "看看草稿" }); form.append(submit);
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!input.value.trim()) { this.slots.error("先写下想创建的内容。"); input.focus(); return; }
      this.draft(target, sampleDraft(target, input.value, hand?.text), anchor, back);
    });
    panel.body.append(form); this.slots.position(); input.focus();
  }

  draft(target: CreateTarget, draft: Draft, anchor: Anchor, back: () => void, replaceId?: string) {
    this.ports.hideToolbar();
    const panel = this.slots.show(`确认${replaceId ? "改放到" : "新建"} ${TARGET_LABEL[target]}`, anchor, back);
    const title = el("input", { class: "mw-input", type: "text", value: draft.title, maxlength: "200", "data-w0-draft-title": "" });
    const text = el("textarea", { class: "mw-input", rows: "5", "data-w0-draft-text": "" }); text.value = draft.text;
    panel.body.append(el("p", { class: "w0-simulated", text: `模拟起草 · ${target === "pages" ? "确认后只新建预览文档" : "只写入本次预览记录"}${replaceId ? "；确认前原条目保留" : ""}` }),
      el("label", {}, "标题", title), el("label", {}, "内容", text));
    let requestId = id(), lastInput = "", pending = false;
    const submit = button(replaceId ? "确认改放到这里" : `创建${TARGET_LABEL[target]}`, () => {
      if (pending) return;
      const current = { ...draft, title: title.value, text: text.value }, serialized = JSON.stringify(current);
      if (!current.title.trim() || !current.text.trim()) { this.slots.error("请补上标题和内容。"); return; }
      if (lastInput && serialized !== lastInput) requestId = id();
      lastInput = serialized; pending = true; submit.disabled = true; title.disabled = true; text.disabled = true; submit.textContent = "正在保存到预览…";
      void this.commit(requestId, target, current, replaceId).then(() => { if (panel.root.isConnected) this.slots.close(); }).catch(error => {
        if (panel.root.isConnected) this.slots.error(error instanceof Error ? error.message : String(error));
      }).finally(() => { pending = false; submit.disabled = false; title.disabled = false; text.disabled = false; submit.textContent = "重试创建"; });
    }, true);
    submit.dataset.w0CreateConfirm = "";
    panel.actions.append(submit, button("取消", panel.close)); this.slots.position(); title.focus();
  }

  async direct(hand: Hand, target: CreateTarget) {
    if (this.busy) return;
    const key = `${hand.id}:${target}`, requestId = this.directRequests.get(key) ?? id();
    this.directRequests.set(key, requestId); this.busy = true;
    const draft = sampleDraft(target, "", hand.text);
    try { await this.commit(requestId, target, draft); this.ports.hideToolbar(); }
    catch (error) {
      this.toast(error instanceof Error ? error.message : String(error), [button("重试", () => { void this.direct(hand, target); })]);
    } finally { this.busy = false; }
  }

  private async commit(requestId: string, target: CreateTarget, draft: Draft, replaceId?: string) {
    const item = await api<CreatedItem>("/api/w0/create", { requestId, target, draft, replaceId });
    await this.ports.refresh();
    this.result(item); return item;
  }

  async undo(item: CreatedItem) {
    try {
      await api("/api/w0/undo", { id: item.id }); this.directRequests.clear(); await this.ports.refresh();
      this.toast(`已撤销「${item.title}」的预览记录`, []);
    } catch (error) { this.toast(error instanceof Error ? error.message : String(error), [button("重试撤销", () => { void this.undo(item); })]); }
  }
  result(item: CreatedItem) {
    const actions: HTMLButtonElement[] = [];
    if (item.documentId) actions.push(button("打开文稿", () => { void this.ports.openDocument(item.documentId!).catch(error => this.slots.error(String(error))); }));
    else actions.push(button("撤销", () => { void this.undo(item); }), button("改放到 ▾", () => this.relocate(item)));
    this.toast(`已在预览${TARGET_LABEL[item.target]}中创建「${item.title}」`, actions);
  }
  private relocate(item: CreatedItem) {
    const toast = $("[data-w0-toast]"), anchor = () => toast.getBoundingClientRect();
    const panel = this.slots.show("改放到哪里", anchor, () => toast.querySelector<HTMLButtonElement>("button")?.focus());
    panel.body.append(el("p", { text: "选择后重新准备草稿；取消会保留原条目。" }));
    for (const target of ["todo", "pages", "shelf"] as const) if (target !== item.target) panel.actions.append(button(TARGET_LABEL[target], () => {
      this.draft(target, { title: item.title, text: item.text, instruction: "" }, anchor, () => undefined, item.id);
    }));
    this.slots.position(); panel.actions.querySelector<HTMLButtonElement>("button")?.focus();
  }
  private toast(message: string, actions: HTMLButtonElement[]) {
    const root = $("[data-w0-toast]"); root.hidden = false;
    root.replaceChildren(el("span", { text: message }), ...actions, button("关闭", () => { root.hidden = true; }));
    announce(message);
  }
}
