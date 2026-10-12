import { $, el, button } from "./w0-dom.js";
import { TARGET_LABEL, type Material, type CreatedItem } from "./w0-model.js";

export const DRAG_TYPE = "application/x-molis-hand+json";
interface ShelfPorts {
  select(item: Material, element: HTMLElement): void; clear(): void;
  undo(item: CreatedItem): void; openDocument(id: string): void;
}

export class Shelf {
  private readonly items = new Map<string, Material>();
  private selected: string | null = null;
  constructor(private readonly ports: ShelfPorts) {
    const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-w0-tab]")];
    for (const tab of tabs) {
      tab.addEventListener("click", () => this.tab(tab));
      tab.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const at = tabs.indexOf(tab), next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (at + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length;
        tabs[next]!.focus(); this.tab(tabs[next]!);
      });
    }
  }
  render(items: Material[], created: CreatedItem[]) {
    this.items.clear(); for (const item of items) this.items.set(item.id, item);
    if (this.selected && !this.items.has(this.selected)) { this.selected = null; this.ports.clear(); }
    $("[data-w0-materials]").replaceChildren(...items.map(item => this.row(item)));
    $("[data-w0-created-section]").hidden = !created.length;
    $("[data-w0-created]").replaceChildren(...created.map(item => {
      const row = el("div", { class: "w0-created-row", "data-w0-created-id": item.id }, el("span", {}, item.title, el("small", { text: `${TARGET_LABEL[item.target]} · 预览记录` })));
      row.append(item.documentId ? button("打开", () => this.ports.openDocument(item.documentId!)) : button("撤销", () => this.ports.undo(item)));
      return row;
    }));
  }
  element(id: string) { return [...document.querySelectorAll<HTMLElement>("[data-w0-material]")].find(node => node.dataset.w0Material === id) ?? null; }
  material(id: string) { return this.items.get(id); }
  clearSelection() { this.selected = null; for (const node of document.querySelectorAll("[data-w0-material]")) node.setAttribute("aria-pressed", "false"); }
  private row(item: Material) {
    const row = el("button", { type: "button", class: "w0-material", draggable: "true", "data-w0-material": item.id,
      "aria-pressed": String(item.id === this.selected), "aria-label": `${item.title}，选择材料` },
    el("span", { class: "w0-material-icon", "aria-hidden": "true", text: item.kind === "quote" ? "“" : item.kind === "checklist" ? "☑" : "Aa" }),
    el("span", {}, el("strong", { text: item.title }), el("p", { text: item.text })));
    const select = () => {
      this.selected = item.id;
      for (const node of document.querySelectorAll<HTMLElement>("[data-w0-material]")) node.setAttribute("aria-pressed", String(node.dataset.w0Material === item.id));
      this.ports.select(item, row);
    };
    row.addEventListener("click", select);
    row.addEventListener("dragstart", event => {
      select();
      event.dataTransfer?.setData(DRAG_TYPE, JSON.stringify({ materialId: item.id }));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    });
    return row;
  }
  private tab(tab: HTMLButtonElement) {
    this.ports.clear();
    for (const other of document.querySelectorAll<HTMLButtonElement>("[data-w0-tab]")) {
      const active = other === tab; other.setAttribute("aria-selected", String(active)); other.tabIndex = active ? 0 : -1;
    }
    $("#w0-side-body").setAttribute("aria-labelledby", tab.id);
    const isShelf = tab.dataset.w0Tab === "shelf";
    $("[data-w0-shelf-content]").hidden = !isShelf;
    const placeholder = $("[data-w0-unavailable]"); placeholder.hidden = isShelf;
    if (!isShelf) placeholder.replaceChildren(el("h2", { text: tab.textContent ?? "" }), el("p", { text: tab.dataset.w0Tab === "computer"
      ? "电脑位置保留给 Computer Use。本原型不连接桌面、操作应用或展示模拟实时画面。"
      : "这个位置尚未接入本原型。切回 Shelf，可以体验选材料、放进文稿与创建。" }));
  }
}
