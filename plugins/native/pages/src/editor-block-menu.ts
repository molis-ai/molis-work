import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { placeOverlay } from "@molis-ai/molis-work-plugin-sdk/browser";
import {
  addColumn, unwrapColumns, deleteBlock, deleteRow, deleteSpan, duplicateBlock, duplicateRow,
  duplicateSpan, turnSpanInto, setRowsTone, blockMenuKey, hoverMenuIndex,
} from "./commands.js";
import { addTableRow, addTableColumn, deleteTableRow, deleteTableColumn, toggleHeaderRow } from "./table-edit.js";
import { spanRows, spanRoots } from "./reorder.js";
import { PAGES_TONES } from "./tone.js";
import { hoverKey, EMPTY_HOVER, nudgeEditor, runBlockCommand } from "./editor-block-selection.js";
import type { Translate } from "./editor-types.js";
import { t, dsIcon, escapeHtml, keepSelectedVisible, keepFocus } from "./editor-view-ui.js";

type MenuMode = "root" | "turn" | "tone";

function turnIntoItems(translate: Translate | undefined) {
  return [
    { id: "paragraph", icon: "text", label: t(translate, "段落") },
    { id: "heading1", icon: "hash", label: t(translate, "标题 1") },
    { id: "heading2", icon: "hash", label: t(translate, "标题 2") },
    { id: "heading3", icon: "hash", label: t(translate, "标题 3") },
    { id: "bullet_list", icon: "rows", label: t(translate, "无序列表") },
    { id: "ordered_list", icon: "list-ordered", label: t(translate, "有序列表") },
    { id: "task_list", icon: "check", label: t(translate, "清单") },
    { id: "callout", icon: "info", label: t(translate, "Callout") },
    { id: "blockquote", icon: "message", label: t(translate, "引用") },
    { id: "toggle", icon: "chevron-right", label: t(translate, "Toggle") },
    { id: "code_block", icon: "code", label: t(translate, "代码") },
  ];
}

function menuItem(icon: string, label: string, run: () => void, danger = false, opens = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = danger ? "mw-menu__item mw-menu__item--danger" : "mw-menu__item";
  button.setAttribute("role", "menuitem");
  if (opens)
    button.dataset.pagesMenuOpen = "1";
  button.innerHTML = `${dsIcon(icon)}<span>${escapeHtml(label)}</span>`;
  button.addEventListener("mousedown", keepFocus);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    run();
  });
  return button;
}

function appendToneChoices(menu: HTMLElement, translate: Translate | undefined, pick: (kind: "font_color" | "highlight", tone: string) => void): void {
  ([
    ["font_color", "文字颜色"],
    ["highlight", "背景色"],
  ] as const).forEach(([kind, labelText]) => {
    const label = document.createElement("p");
    label.className = "pages-menu-label";
    label.textContent = t(translate, labelText);
    const strip = document.createElement("div");
    strip.className = "pages-tone-strip";
    const swatch = (tone: string, name: string) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pages-tone";
      button.dataset.pagesTone = tone || "none";
      button.setAttribute("aria-label", name);
      button.title = name;
      button.addEventListener("mousedown", keepFocus);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        pick(kind, tone);
      });
      strip.append(button);
    };
    swatch("", t(translate, "默认"));
    PAGES_TONES.forEach((tone) => swatch(tone.id, t(translate, tone.label)));
    menu.append(label, strip);
  });
}

/** One block menu reads the live block position and the editor's shared selection state. */
export class PagesBlockMenu {
  readonly dom = document.createElement("div");
  private mode: MenuMode = "root";
  constructor(
    private readonly view: EditorView,
    private readonly translate: Translate | undefined,
    private readonly readPosition: () => number,
    private readonly onNote: (index: number) => void,
  ) {
    this.dom.className = "mw-menu pages-block-menu";
    this.dom.hidden = true;
    this.dom.setAttribute("role", "menu");
    this.dom.addEventListener("mouseover", (event) => {
      const button = (event.target as HTMLElement | null)?.closest("button");
      if (!(button instanceof HTMLButtonElement) || !this.dom.contains(button))
        return;
      const items = [...this.dom.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const current = items.findIndex((item) => item.classList.contains("is-on"));
      const next = hoverMenuIndex(current, items.indexOf(button), items.length);
      if (next != null)
        this.paint(next);
    });
  }
  private get pos(): number { return this.readPosition(); }
  private text(value: string): string { return t(this.translate, value); }
  private apply(tr: Transaction | null): void {
    if (tr)
      this.view.dispatch(tr.scrollIntoView());
    this.close();
    this.view.focus();
  }
  private modeItem(mode: "turn" | "tone"): HTMLButtonElement {
    return menuItem(mode === "turn" ? "refresh" : "tune", this.text(mode === "turn" ? "转换为" : "颜色"), () => this.render(mode), false, true);
  }
  private hover() { return hoverKey.getState(this.view.state) ?? EMPTY_HOVER; }
  close(): void {
    this.dom.hidden = true;
    this.dom.replaceChildren();
  }
  private selectedRoots() {
    const hover = this.hover();
    if (hover.anchor < 0 || this.pos < 0)
      return [];
    const doc = this.view.state.doc;
    if (!spanRows(doc, hover.anchor, hover.head).some(row => row.pos === this.pos))
      return [];
    return spanRoots(doc, hover.anchor, hover.head);
  }
  private activeSpan() {
    const hover = this.hover();
    return this.selectedRoots().length > 1 ? { anchor: hover.anchor, head: hover.head } : null;
  }
  private tonePositions(): number[] {
    const roots = this.selectedRoots();
    return roots.length ? roots.map(row => row.pos) : this.pos >= 0 ? [this.pos] : [];
  }
  private paint(index: number): void {
    const items = [...this.dom.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    items.forEach((button, itemIndex) => button.classList.toggle("is-on", itemIndex === index));
    keepSelectedVisible(this.dom);
  }
  private appendTableActions(): void {
    const node = this.pos >= 0 ? this.view.state.doc.nodeAt(this.pos) : null;
    if (node?.type.name !== "table")
      return;
    const run = (make: typeof addTableRow) => {
      const tr = make(this.view.state, this.pos);
      this.apply(tr);
    };
    this.dom.append(
      menuItem("plus", this.text("加一行"), () => run(addTableRow)),
      menuItem("grid", this.text("加一列"), () => run(addTableColumn)),
      menuItem("minus", this.text("删行"), () => run(deleteTableRow)),
      menuItem("minus", this.text("删列"), () => run(deleteTableColumn)),
      menuItem("rows", this.text("表头行"), () => run(toggleHeaderRow)),
    );
  }
  private moveItems(): HTMLButtonElement[] {
    const move = (direction: -1 | 1) => { nudgeEditor(this.view, direction); this.close(); };
    return [menuItem("chevron-up", this.text("上移"), () => move(-1)),
      menuItem("chevron-down", this.text("下移"), () => move(1))];
  }
  private render(mode: MenuMode): void {
    this.mode = mode;
    this.dom.replaceChildren();
    const pos = this.pos;
    const block = pos < 0 ? 0 : this.view.state.doc.resolve(pos).index(0);
    const grouped = mode === "root" ? this.activeSpan() : null;
    if (grouped)
      this.renderGroup(grouped);
    else if (mode === "root" && pos >= 0 && this.view.state.doc.resolve(pos).depth > 0)
      this.renderNested();
    else if (mode === "tone")
      this.renderTone();
    else if (mode === "turn")
      this.renderTurn();
    else
      this.renderRoot(block);
    this.paint(0);
  }
  private renderGroup(grouped: {
    anchor: number;
    head: number;
  }): void {
    this.appendTableActions();
    const finish = (command: ReturnType<typeof deleteSpan>) => {
      command(this.view.state, (tr) => {
        this.view.dispatch(tr.setMeta(hoverKey, { span: null }));
      });
      this.close();
    };
    this.dom.append(
      ...this.moveItems(), this.modeItem("tone"), this.modeItem("turn"),
      menuItem("copy", this.text("创建副本"), () => finish(duplicateSpan(grouped.anchor, grouped.head))),
      menuItem("trash", this.text("删除"), () => finish(deleteSpan(grouped.anchor, grouped.head)), true),
    );
  }
  private renderNested(): void {
    this.appendTableActions();
    this.dom.append(
      this.modeItem("turn"), this.modeItem("tone"), ...this.moveItems(),
      menuItem("copy", this.text("创建副本"), () => {
        runBlockCommand(this.view, duplicateRow(this.pos));
        this.close();
      }),
      menuItem("trash", this.text("删除"), () => {
        runBlockCommand(this.view, deleteRow(this.pos));
        this.close();
      }, true),
    );
  }
  private renderTone(): void {
    this.dom.append(menuItem("arrow", this.text("返回"), () => this.render("root")));
    appendToneChoices(this.dom, this.translate, (kind, tone) => {
      const tr = setRowsTone(this.view.state, this.tonePositions(), kind, tone);
      this.apply(tr);
    });
  }
  private renderTurn(): void {
    this.dom.append(menuItem("arrow", this.text("返回"), () => this.render("root")));
    const label = document.createElement("p");
    label.className = "pages-menu-label";
    label.textContent = this.text("转换为");
    this.dom.append(label);
    const conversion = (id: string) => {
      const span = this.activeSpan();
      return turnSpanInto(this.view.state, span?.anchor ?? this.pos, span?.head ?? this.pos, id);
    };
    turnIntoItems(this.translate).forEach((item) => {
      const button = menuItem(item.icon, item.label, () => {
        const tr = conversion(item.id);
        if (tr)
          this.view.dispatch(tr.setMeta(hoverKey, { span: null }).scrollIntoView());
        this.close();
        this.view.focus();
      });
      button.disabled = !conversion(item.id);
      if (button.disabled)
        button.title = this.text("此转换无法保留块中的内容");
      this.dom.append(button);
    });
  }
  private renderRoot(block: number): void {
    this.appendTableActions();
    const columnListAt = (() => {
      if (this.pos < 0)
        return -1;
      const direct = this.view.state.doc.nodeAt(this.pos);
      if (direct?.type.name === "column_list")
        return this.pos;
      const $at = this.view.state.doc.resolve(Math.min(this.pos + 1, this.view.state.doc.content.size));
      for (let depth = $at.depth; depth > 0; depth -= 1) {
        if ($at.node(depth).type.name === "column_list")
          return $at.before(depth);
      }
      return -1;
    })();
    if (columnListAt >= 0) {
      this.dom.append(
        menuItem("columns", this.text("加一栏"), () => {
          this.apply(addColumn(this.view.state, columnListAt));
        }),
        menuItem("rows", this.text("取消分栏"), () => {
          this.apply(unwrapColumns(this.view.state, columnListAt));
        }),
      );
    }
    this.dom.append(
      this.modeItem("turn"), this.modeItem("tone"),
      menuItem("copy", this.text("创建副本"), () => {
        runBlockCommand(this.view, duplicateBlock(block));
        this.close();
      }),
      menuItem("message", this.text("备注"), () => {
        this.onNote(block);
        this.close();
      }),
      ...this.moveItems(),
      menuItem("trash", this.text("删除"), () => {
        runBlockCommand(this.view, deleteBlock(block));
        this.close();
      }, true),
    );
  }
  open(handle: HTMLElement): void {
    this.dom.hidden = false;
    this.render("root");
    const rect = handle.getBoundingClientRect();
    placeOverlay(this.dom, rect, "beside");
  }
  handleKey(event: KeyboardEvent): void {
    if (this.dom.hidden || event.isComposing)
      return;
    const items = [...this.dom.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const index = items.findIndex((button) => button.classList.contains("is-on"));
    const current = items[index];
    const action = blockMenuKey(index, items.length, event.key, this.mode !== "root", current?.dataset.pagesMenuOpen === "1");
    if (action == null)
      return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "close") {
      this.close();
      return;
    }
    if (action === "back") {
      this.render("root");
      return;
    }
    if (action === "stay")
      return;
    if (action === "run") {
      (items[index] ?? items[0])?.click();
      return;
    }
    this.paint(action);
  }
  destroy(): void { this.dom.remove(); }
}
