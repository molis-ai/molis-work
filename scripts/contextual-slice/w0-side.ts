import { $, el, glyph, iconButton } from "./w0-dom.js";
import { OBJECT_KIND, type CreatedItem, type Hand, type HandKind, type Material } from "./w0-model.js";
import { FILES, MESSAGES, SPARKS, TABS, WEB_PAGE, type SideItem, type SideTab } from "./w0-sources.js";

export const DRAG_TYPE = "application/x-molis-hand+json";
interface SidePorts {
  /** Something in the right panel is now in hand; `row` is what the bar is drawn beside. */
  select(hand: Hand, row: () => DOMRect | null): void;
  clear(): void;
  newIn(tab: "shelf" | "sparks", button: HTMLButtonElement): void;
}
const KIND_ICON: Record<HandKind, string> = { quote: "text", checklist: "check", note: "note", spark: "idea", file: "file", web: "globe", message: "message", selection: "text" };
const source = (tab: SideTab) => TABS.find(item => item.id === tab)!.source;

/** The right panel's six places in their order (side-shelf §3.1). Only Shelf is backed by the preview server; the rest are labelled samples. */
export class SidePanel {
  private tab: SideTab = "shelf";
  private materials: Material[] = [];
  private sparks: SideItem[] = [...SPARKS];
  private readonly hands = new Map<string, Hand>();
  private selected: string | null = null;
  private selectionTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly ports: SidePorts) {
    const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-w0-tab]")];
    for (const tab of tabs) {
      tab.addEventListener("click", () => this.show(tab.dataset.w0Tab as SideTab));
      tab.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const at = tabs.indexOf(tab), next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (at + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length;
        tabs[next]!.focus(); this.show(tabs[next]!.dataset.w0Tab as SideTab);
      });
    }
    document.addEventListener("selectionchange", () => this.webSelection());
  }

  current() { return this.tab; }
  hand(id: string) { return this.hands.get(id); }
  element(id: string) { return [...document.querySelectorAll<HTMLElement>("[data-w0-hand]")].find(node => node.dataset.w0Hand === id) ?? null; }
  clearSelection() { this.selected = null; for (const node of document.querySelectorAll("[data-w0-hand]")) node.setAttribute("aria-pressed", "false"); }
  setMaterials(materials: Material[]) {
    this.materials = materials;
    if (this.selected?.startsWith("shelf:") && !materials.some(item => `shelf:${item.id}` === this.selected)) { this.selected = null; this.ports.clear(); }
    if (this.tab === "shelf" || this.tab === "files") this.render();
  }
  /** 灵光 created from here (✦ 一句话新建) join the sample notes, newest first. */
  setCreated(created: CreatedItem[]) {
    this.sparks = [...created.filter(item => item.target === "spark").reverse()
      .map(item => ({ id: `spark:${item.id}`, kind: "spark" as const, title: item.title, text: item.text, meta: "灵光 · 刚刚" })), ...SPARKS];
    if (this.tab === "sparks") this.render();
  }
  revealSpark(id: string) { this.show("sparks"); this.land(`spark:${id}`); }
  show(tab: SideTab) {
    if (tab !== this.tab) { this.ports.clear(); this.selected = null; }
    this.tab = tab;
    for (const other of document.querySelectorAll<HTMLButtonElement>("[data-w0-tab]")) {
      const active = other.dataset.w0Tab === tab; other.setAttribute("aria-selected", String(active)); other.tabIndex = active ? 0 : -1;
      if (active) $("#w0-side-body").setAttribute("aria-labelledby", other.id);
    }
    this.render();
  }
  /** A new Shelf row arrives highlighted once (context-program §7: 落进去之后右栏切到那一格并高亮新建的那一条). */
  reveal(materialId: string) {
    this.show("shelf"); this.land(`shelf:${materialId}`);
  }
  private land(id: string) {
    const row = this.element(id);
    row?.scrollIntoView({ block: "nearest" }); row?.classList.add("w0-landed");
    setTimeout(() => row?.classList.remove("w0-landed"), 1400);
  }

  private render() {
    this.hands.clear();
    const body = $("[data-w0-side-content]");
    if (this.tab === "shelf") body.replaceChildren(this.head("Shelf", "个人材料 · 仅你可见", "shelf"), this.note("本次预览的样例材料", "lock"),
      this.list(this.materials.map(item => ({ id: `shelf:${item.id}`, kind: item.kind, title: item.title, text: item.text, meta: "" })), "shelf"),
      this.hint());
    else if (this.tab === "sparks") body.replaceChildren(this.head("灵光", "随手记下的想法", "sparks"), this.note("模拟灵光 · 不读真实记录"), this.list(this.sparks, "sparks"), this.hint());
    else if (this.tab === "files") body.replaceChildren(this.head("文件", "项目里各插件的文件，只能看"), this.note("模拟文件 · 过程项不在这里"), this.list(FILES, "files"),
      el("p", { class: "w0-group-label", text: "Shelf 材料（在 Shelf 里加工）" }),
      this.list(this.materials.map(item => ({ id: `file-shelf:${item.id}`, kind: item.kind, title: item.title, text: item.text, meta: "Shelf · 个人" })), "files"));
    else if (this.tab === "browser") body.replaceChildren(this.browser());
    else if (this.tab === "discussion") body.replaceChildren(this.head("讨论", "项目群聊"), this.note("模拟消息 · 不连接聊天服务"), this.list(MESSAGES, "discussion"),
      el("div", { class: "w0-discussion-input", "aria-disabled": "true" }, el("span", { text: "输入框作为落点在第 6 波接入" })));
    else body.replaceChildren(el("div", { class: "w0-empty" }, el("span", { class: "w0-empty-mark" }, glyph("system")), el("h2", { text: "电脑" }),
      el("p", { text: "这个位置留给 Computer Use，由它的负责人接入。本原型不连接桌面、不操作应用，也不展示模拟画面。" })));
  }
  private head(title: string, caption: string, create?: "shelf" | "sparks") {
    const head = el("header", { class: "w0-side-head" }, el("div", {}, el("h2", { text: title }), el("p", { text: caption })));
    if (create) {
      const plus = iconButton(`${title} 一句话新建`, "sparkles", () => this.ports.newIn(create, plus));
      plus.dataset.w0New = create; head.append(plus);
    }
    return head;
  }
  private note(text: string, icon = "info") { return el("p", { class: "w0-sample-note" }, glyph(icon), el("span", { text })); }
  private hint() { return el("p", { class: "w0-side-hint" }, glyph("grip"), el("span", { text: "选中一条，动作出现在它旁边；也可以拖到文稿里，在松手处选择。" })); }

  private list(items: readonly SideItem[], tab: SideTab) {
    const list = el("div", { class: "w0-rows", role: "list" });
    for (const item of items) {
      const hand: Hand = { id: item.id, place: "side", kind: item.kind, source: source(tab), title: item.title, text: item.text };
      this.hands.set(item.id, hand);
      const row = el("button", { type: "button", class: "w0-row", draggable: "true", "data-w0-hand": item.id, "data-w0-material": item.id.replace(/^shelf:/u, ""),
        "aria-pressed": String(item.id === this.selected), "aria-label": `${item.title}，选中后显示动作`, title: `对象种类：${OBJECT_KIND[item.kind]}` },
      el("span", { class: "w0-row-icon", "aria-hidden": "true" }, glyph(KIND_ICON[item.kind])),
      el("span", { class: "w0-row-copy" }, el("strong", { text: item.title }), item.meta ? el("small", { text: item.meta }) : null, el("span", { class: "w0-row-text", text: item.text })));
      if (!item.id.startsWith("shelf:")) row.removeAttribute("data-w0-material");
      row.addEventListener("click", () => this.pick(hand, row));
      row.addEventListener("dragstart", event => {
        this.pick(hand, row);
        event.dataTransfer?.setData(DRAG_TYPE, JSON.stringify({ hand: item.id })); event.dataTransfer?.setData("text/plain", item.text);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
        row.classList.add("is-dragging");
      });
      row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
      list.append(row);
    }
    return list;
  }
  private pick(hand: Hand, row: HTMLElement) {
    this.selected = hand.id;
    for (const node of document.querySelectorAll<HTMLElement>("[data-w0-hand]")) node.setAttribute("aria-pressed", String(node === row));
    this.ports.select(hand, () => this.element(hand.id)?.getBoundingClientRect() ?? null);
  }

  /** The real browser place is a canvas fed by the browser service (side-shelf §6); here the page is DOM text, labelled as a sample. */
  private browser() {
    const article = el("article", { class: "w0-web", "data-w0-web": "" }, el("h3", { text: WEB_PAGE.title }), ...WEB_PAGE.paragraphs.map(text => el("p", { text })));
    return el("div", { class: "w0-browser" },
      el("div", { class: "w0-address" }, glyph("globe"), el("span", { text: WEB_PAGE.address }), el("span", { class: "w0-tag", text: "模拟网页" })),
      this.note("真实的浏览器格是画布，选区由浏览器服务给出；这里用页面文字代替"), article);
  }
  private webSelection() {
    clearTimeout(this.selectionTimer);
    const selection = getSelection(), article = document.querySelector("[data-w0-web]");
    if (!selection || selection.isCollapsed || !article || !selection.anchorNode || !article.contains(selection.anchorNode)) return;
    this.selectionTimer = setTimeout(() => {
      const text = selection.toString().trim(); if (!text || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0).cloneRange();
      const hand: Hand = { id: `web:${text.length}:${text.slice(0, 24)}`, place: "side", kind: "web", source: "网页", title: WEB_PAGE.title, text: `${text}\n来源：${WEB_PAGE.address}` };
      this.clearSelection(); this.hands.set(hand.id, hand); this.selected = hand.id;
      this.ports.select(hand, () => range.getBoundingClientRect());
    }, 350);
  }
}
