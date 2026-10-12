import { el, button, placeLayer, type Anchor } from "./w0-dom.js";
import { visibleChoices, type Choice, type Choices, type Hand, type Landing } from "./w0-model.js";

interface Tool { name: string; label: string; glyph: string }
const TOOLS: readonly Tool[] = [
  { name: "strong", label: "加粗", glyph: "B" }, { name: "em", label: "斜体", glyph: "I" },
  { name: "underline", label: "下划线", glyph: "U" }, { name: "h2", label: "标题 2", glyph: "H2" },
  { name: "ul", label: "无序列表", glyph: "列表" },
];
export interface ToolbarContext {
  hand: Hand; landing: Landing | null; choices: Choices; anchor: Anchor; touch?: boolean;
  returnFocus(): void;
}
export interface ToolbarPorts {
  choose(choice: Choice): void; assistant(): void; tool(name: string): HTMLButtonElement | null;
  hoverLanding(landing: Landing | null): void;
}

export class FloatingToolbar {
  readonly root = el("div", { class: "w0-float", role: "toolbar", "aria-label": "当前内容的动作", "data-w0-toolbar": "", hidden: "" });
  private menu: HTMLElement | null = null;
  private context: ToolbarContext | null = null;
  private held: ToolbarContext | null = null;
  private left: number | undefined;
  private menuAnchor: HTMLElement | null = null;

  constructor(private readonly ports: ToolbarPorts) {
    document.body.append(this.root);
    this.root.addEventListener("mousedown", event => event.preventDefault());
    this.root.addEventListener("keydown", event => this.keys(event, false));
    this.root.addEventListener("pointerleave", () => this.release());
    this.root.addEventListener("focusout", () => queueMicrotask(() => this.release()));
    document.addEventListener("pointerdown", event => {
      if (this.menu && !this.root.contains(event.target as Node) && !this.menu.contains(event.target as Node)) this.closeMenu();
    });
    document.addEventListener("keydown", event => {
      if ((event.metaKey || event.ctrlKey) && event.key === "." && !this.root.hidden) {
        event.preventDefault(); this.root.querySelector<HTMLButtonElement>("button")?.focus();
      }
    });
    window.addEventListener("resize", () => { this.left = undefined; if (this.context) this.draw(this.context); });
    document.addEventListener("scroll", () => this.position(), true);
  }

  show(context: ToolbarContext) {
    const same = context.hand.id === this.context?.hand.id;
    if (same && (this.root.matches(":hover") || this.root.contains(document.activeElement) || this.menu)) { this.held = context; return; }
    if (!same) { this.left = undefined; this.closeMenu(); this.held = null; }
    this.draw(context);
  }
  hide() { this.root.hidden = true; this.context = null; this.held = null; this.closeMenu(); this.ports.hoverLanding(null); }
  contains(target: Node | null) { return !!target && (this.root.contains(target) || !!this.menu?.contains(target)); }

  private draw(context: ToolbarContext) {
    this.context = context;
    const narrow = innerWidth <= 700 || context.hand.place === "side";
    const choices = visibleChoices(context.choices, narrow), children: HTMLElement[] = [];
    if (context.hand.place === "main") children.push(this.tools(narrow));
    else if (context.landing) children.push(el("span", { class: "w0-target", text: `→ ${context.landing.label}`, title: context.landing.label }));
    for (const choice of choices.primary) {
      const node = button(choice.title, () => this.ports.choose(choice));
      node.dataset.w0Choice = choice.key;
      if (choice.kind === "place") {
        node.addEventListener("pointerenter", () => this.ports.hoverLanding(context.landing));
        node.addEventListener("pointerleave", () => this.ports.hoverLanding(null));
        node.addEventListener("focus", () => this.ports.hoverLanding(context.landing));
        node.addEventListener("blur", () => this.ports.hoverLanding(null));
      }
      children.push(node);
    }
    const more = button("更多", () => this.openMenu(more, choices.more.map(choice => button(choice.title, () => { this.closeMenu(); this.ports.choose(choice); }))));
    more.dataset.w0More = ""; more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-expanded", "false");
    children.push(more);
    const assistant = button("✦ 助理", () => this.ports.assistant()); assistant.dataset.w0Assistant = ""; children.push(assistant);
    this.root.replaceChildren(...children); this.root.hidden = false;
    this.root.setAttribute("aria-label", `当前内容的动作${context.landing ? `，落点 ${context.landing.label}` : ""}`);
    this.position();
    this.left ??= this.root.getBoundingClientRect().left;
  }

  private tools(narrow: boolean) {
    const group = el("div", { class: "w0-tools", "aria-label": "Pages 格式" });
    const toolButton = (tool: Tool) => {
      const native = this.ports.tool(tool.name);
      const node = button(tool.glyph, () => { native?.click(); this.refreshTools(); });
      node.title = tool.label; node.setAttribute("aria-label", tool.label); node.dataset.w0Tool = tool.name;
      node.setAttribute("aria-pressed", native?.getAttribute("aria-pressed") ?? "false");
      return node;
    };
    if (!narrow) group.append(...TOOLS.slice(0, 2).map(toolButton));
    const format = button("格式 ▾", () => this.openMenu(format, TOOLS.map(tool => {
      const node = toolButton(tool); node.textContent = tool.label; return node;
    })));
    format.setAttribute("aria-haspopup", "menu"); format.setAttribute("aria-expanded", "false"); group.append(format);
    return group;
  }
  private refreshTools() {
    for (const node of this.root.querySelectorAll<HTMLButtonElement>("[data-w0-tool]")) node.setAttribute("aria-pressed", this.ports.tool(node.dataset.w0Tool!)?.getAttribute("aria-pressed") ?? "false");
  }
  private openMenu(anchor: HTMLElement, items: HTMLButtonElement[]) {
    if (this.menuAnchor === anchor) { this.closeMenu(); return; }
    this.closeMenu(); this.menuAnchor = anchor;
    this.menu = el("div", { class: "w0-float-menu", role: "menu", "aria-label": anchor.textContent ?? "操作" });
    for (const item of items) { item.setAttribute("role", "menuitem"); this.menu.append(item); }
    const assistant = button("带到助理", () => { this.closeMenu(); this.ports.assistant(); }); assistant.setAttribute("role", "menuitem"); this.menu.append(assistant);
    this.menu.addEventListener("mousedown", event => event.preventDefault());
    this.menu.addEventListener("keydown", event => this.keys(event, true));
    document.body.append(this.menu); anchor.setAttribute("aria-expanded", "true");
    placeLayer(this.menu, () => anchor.getBoundingClientRect(), true);
    this.menu.querySelector<HTMLButtonElement>("button")?.focus();
  }
  private closeMenu() { this.menu?.remove(); this.menu = null; this.menuAnchor?.setAttribute("aria-expanded", "false"); this.menuAnchor = null; }
  private release() {
    if (!this.held || this.root.matches(":hover") || this.root.contains(document.activeElement) || this.menu) return;
    const context = this.held; this.held = null; this.draw(context);
  }
  private position() {
    if (!this.context || this.root.hidden) return;
    if (!placeLayer(this.root, this.context.anchor, this.context.touch, this.left)) this.hide();
    if (this.menu && this.menuAnchor) placeLayer(this.menu, () => this.menuAnchor!.getBoundingClientRect(), true);
  }
  private keys(event: KeyboardEvent, menu: boolean) {
    const root = menu ? this.menu : this.root;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (menu) { const anchor = this.menuAnchor; this.closeMenu(); anchor?.focus(); }
      else { const back = this.context?.returnFocus; this.hide(); back?.(); }
    } else if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (at + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    }
  }
}
