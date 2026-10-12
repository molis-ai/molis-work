import { el, button, glyph, placeLayer, type Anchor, type Rect } from "./w0-dom.js";
import { visibleChoices, type Choice, type Choices, type Hand, type Landing } from "./w0-model.js";

interface Tool { name: string; label: string; glyph?: string; icon?: string; inline?: boolean }
/** Pages' own tools, drawn by the bar and run by the editor's real commands (context-toolbar §3: tools are not actions). */
const TOOLS: readonly Tool[] = [
  { name: "strong", label: "加粗", glyph: "B", inline: true }, { name: "em", label: "斜体", glyph: "I", inline: true },
  { name: "underline", label: "下划线", glyph: "U" }, { name: "h2", label: "标题 2", glyph: "H2" }, { name: "ul", label: "无序列表", icon: "list" },
];
/** Pages marks an active format with `is-on` (and `aria-pressed` only on command buttons). */
const pressed = (native: HTMLButtonElement | null) => !!native && (native.classList.contains("is-on") || native.getAttribute("aria-pressed") === "true");
export interface ToolbarContext {
  hand: Hand; landing: Landing | null; choices: Choices; anchor: Anchor; touch?: boolean;
  /** Where the bar is drawn decides its width: the right panel is narrow (2 actions); a drop on the left is not. */
  narrow?: boolean;
  bounds?: () => Pick<Rect, "left" | "right">;
  returnFocus(): void;
}
export interface ToolbarPorts {
  choose(choice: Choice): void; ask(): void; bring(): void;
  /** The editor's own command button (its pressed state); `applyTool` runs it. A tool edits in place and keeps the bar. */
  tool(name: string): HTMLButtonElement | null; applyTool(name: string): void;
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

  get visible() { return !this.root.hidden; }
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
    const narrow = context.narrow ?? (innerWidth <= 700 || context.hand.place !== "main");
    const choices = visibleChoices(context.choices, narrow), children: HTMLElement[] = [];
    if (context.hand.place === "main") children.push(this.tools(narrow));
    else if (context.landing) children.push(this.target(context.landing));
    for (const choice of choices.primary) {
      const node = button(choice.title, () => this.ports.choose(choice));
      node.dataset.w0Choice = choice.key; node.dataset.kind = choice.kind;
      if (choice.kind === "place") {
        const on = () => this.ports.hoverLanding(context.landing), off = () => this.ports.hoverLanding(null);
        node.addEventListener("pointerenter", on); node.addEventListener("pointerleave", off);
        node.addEventListener("focus", on); node.addEventListener("blur", off);
      }
      children.push(node);
    }
    const more = button("更多", () => this.openMenu(more, this.moreItems(choices.more)), "ghost");
    more.append(glyph("chevron-down")); more.dataset.w0More = ""; more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-expanded", "false");
    const assistant = button("助理", () => this.ports.ask(), "ghost", "sparkles"); assistant.dataset.w0Assistant = "";
    // In a narrow bar ✦ stands alone; its name stays for the reader and the tooltip.
    if (narrow) { assistant.classList.add("mw-btn--icon-only"); assistant.setAttribute("aria-label", "助理"); assistant.title = "交给助理"; assistant.querySelector("span")?.remove(); }
    children.push(more, assistant);
    this.root.replaceChildren(...children); this.root.hidden = false;
    this.root.dataset.place = context.hand.place;
    this.root.setAttribute("aria-label", `当前内容的动作${context.landing && context.hand.place !== "main" ? `，落点 ${context.landing.label}` : ""}`);
    this.position();
    this.left ??= this.root.getBoundingClientRect().left;
  }

  /** Where a 放进 action would land, named before the actions (side-shelf §3.3); its full detail is the tooltip. */
  private target(landing: Landing) {
    const short = landing.label.replace(/^Pages · /u, "");
    const node = el("span", { class: "w0-target", title: `放进 ${landing.label} ${landing.detail}`, "data-w0-target": "" }, glyph("arrow"), el("span", { text: short }));
    node.addEventListener("pointerenter", () => this.ports.hoverLanding(landing));
    node.addEventListener("pointerleave", () => this.ports.hoverLanding(null));
    return node;
  }

  private moreItems(more: Choice[]) {
    const items: HTMLElement[] = more.map(choice => button(choice.title, () => { this.closeMenu(); this.ports.choose(choice); }));
    if (items.length) items.push(el("div", { class: "w0-menu-gap", role: "separator" }));
    items.push(el("p", { class: "w0-menu-label", text: "助理" }),
      button("带到助理", () => { this.closeMenu(); this.ports.bring(); }, "ghost", "send"),
      button("说出要做什么", () => { this.closeMenu(); this.ports.ask(); }, "ghost", "sparkles"));
    return items;
  }

  private tools(narrow: boolean) {
    const group = el("div", { class: "w0-tools", role: "group", "aria-label": "Pages 格式" });
    const toolButton = (tool: Tool, labelled: boolean) => {
      const native = this.ports.tool(tool.name);
      const node = el("button", { type: "button", class: "mw-btn mw-btn--ghost", "aria-label": tool.label, title: tool.label, "data-w0-tool": tool.name });
      if (tool.icon) node.append(glyph(tool.icon)); else node.append(el("span", { class: "w0-glyph", "data-glyph": tool.glyph ?? "", text: tool.glyph ?? "" }));
      if (labelled) node.append(el("span", { text: tool.label }));
      node.setAttribute("aria-pressed", String(pressed(native)));
      node.addEventListener("click", () => { this.ports.applyTool(tool.name); this.refreshTools(); });
      return node;
    };
    if (!narrow) group.append(...TOOLS.filter(tool => tool.inline).map(tool => toolButton(tool, false)));
    const format = button("格式", () => this.openMenu(format, TOOLS.map(tool => toolButton(tool, true))));
    format.append(glyph("chevron-down")); format.setAttribute("aria-haspopup", "menu"); format.setAttribute("aria-expanded", "false"); format.dataset.w0Format = "";
    group.append(format);
    return group;
  }
  private refreshTools() {
    for (const node of document.querySelectorAll<HTMLButtonElement>("[data-w0-tool]")) node.setAttribute("aria-pressed", String(pressed(this.ports.tool(node.dataset.w0Tool!))));
  }
  private openMenu(anchor: HTMLElement, items: HTMLElement[]) {
    if (this.menuAnchor === anchor) { this.closeMenu(); return; }
    this.closeMenu(); this.menuAnchor = anchor;
    this.menu = el("div", { class: "w0-float-menu", role: "menu", "aria-label": anchor.textContent ?? "操作" });
    for (const item of items) { if (item instanceof HTMLButtonElement) item.setAttribute("role", "menuitem"); this.menu.append(item); }
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
    if (!placeLayer(this.root, this.context.anchor, this.context.touch, this.left, this.context.bounds?.())) this.hide();
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
