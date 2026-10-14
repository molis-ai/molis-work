import { $, el, button } from "./w0-dom.js";
import { TARGET_LABEL, type CreatedItem } from "./w0-model.js";

interface RecordPorts { undo(item: CreatedItem): void; openDocument(id: string): void }

/** 预览记录: what this preview created, outside any plugin's place (a created todo is not a Shelf row). */
export class Records {
  private readonly trigger = $<HTMLButtonElement>("[data-w0-records]");
  private menu: HTMLElement | null = null;
  private items: CreatedItem[] = [];
  constructor(private readonly ports: RecordPorts) {
    this.trigger.addEventListener("click", () => this.menu ? this.close() : this.open());
    document.addEventListener("pointerdown", event => {
      if (this.menu && !this.menu.contains(event.target as Node) && !this.trigger.contains(event.target as Node)) this.close();
    });
  }
  set(items: CreatedItem[]) {
    this.items = items;
    $("[data-w0-records-count]").textContent = String(items.length);
    this.trigger.hidden = items.length === 0;
    if (this.menu) this.open();
  }
  private open() {
    this.close(false);
    const menu = el("div", { class: "w0-float-menu w0-records", role: "dialog", "aria-label": "本次预览创建的条目" },
      el("p", { class: "w0-menu-label", text: "本次预览创建的条目 · 重启后清空" }));
    for (const item of [...this.items].reverse()) {
      const row = el("div", { class: "w0-record", "data-w0-created-id": item.id }, el("span", {}, el("strong", { text: item.title }), el("small", { text: TARGET_LABEL[item.target] })));
      row.append(item.documentId ? button("打开", () => { this.close(); this.ports.openDocument(item.documentId!); }) : button("撤销", () => this.ports.undo(item)));
      menu.append(row);
    }
    menu.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); this.close(); } });
    document.body.append(menu); this.menu = menu; this.trigger.setAttribute("aria-expanded", "true");
    // The top bar is above the layers' usual floor, so this one menu hangs from its trigger's right edge.
    const rect = this.trigger.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`; menu.style.left = `${Math.max(8, Math.min(rect.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }
  private close(restore = true) {
    this.menu?.remove(); this.menu = null; this.trigger.setAttribute("aria-expanded", "false");
    if (restore && document.activeElement === document.body) this.trigger.focus();
  }
}
