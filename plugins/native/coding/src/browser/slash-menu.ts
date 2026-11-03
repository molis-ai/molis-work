import { el, errorMessage } from "./dom.js";
import { matches } from "./matching.js";
import type { PagePorts } from "./types.js";

/** A command the slash menu and the palette offer. */
export interface Command {
  readonly slash: string;
  readonly label: string;
  readonly hint?: string;
  readonly keywords?: readonly string[];
  /** The shortcut, written `Mod+Alt+N`. */
  readonly keys?: string;
  readonly enabled?: boolean;
  readonly run: () => unknown;
}

/** One definition in a file, named by `@path#name`. */
export interface SymbolLine { readonly name: string; readonly kind: string; readonly line: number }

export interface MenuPorts extends Pick<PagePorts, "lifetime" | "translate" | "q" | "status"> {
  readonly input: HTMLTextAreaElement;
  readonly commands: () => readonly Command[];
  readonly workspace: () => string;
  readonly files: (workspaceId: string) => Promise<{ files: string[] }>;
  readonly symbols?: (workspaceId: string, file: string) => Promise<{ symbols?: SymbolLine[]; unreadable?: boolean }>;
}

type Item = { readonly kind: "command"; readonly command: Command } | { readonly kind: "symbol"; readonly symbol: SymbolLine } | { readonly kind: "file"; readonly path: string };

/** The `@` the person is typing: where it starts, what follows it, and the file when it is `@file#`. */
interface Mention { readonly start: number; readonly query: string; readonly file?: string }

interface Menu {
  readonly ports: MenuPorts;
  readonly node: HTMLElement;
  readonly run: (command: { readonly run: () => unknown }) => Promise<void>;
  items: Item[];
  active: number;
  mention: Mention | null;
  files: string[] | null;
  filesFor: string;
  filesError: string;
  /** File → its definitions; null while they are being read. */
  readonly symbols: Map<string, SymbolLine[] | null>;
  symbolsError: string;
}

const LIMIT = 12;
const symbolKey = (menu: Menu) => menu.ports.workspace() + " " + (menu.mention?.file ?? "");

function close(menu: Menu) {
  menu.node.hidden = true;
  menu.node.replaceChildren();
  menu.ports.input.removeAttribute("aria-activedescendant");
  menu.items = [];
}

function itemRow(menu: Menu, item: Item, index: number) {
  const L = menu.ports.translate, option = el("div", "", "coding-slash-item" + (menu.mention ? " is-file" : ""));
  option.id = "coding-slash-" + index;
  option.setAttribute("role", "option");
  option.setAttribute("aria-selected", String(index === menu.active));
  if (item.kind === "symbol") {
    option.append(el("span", item.symbol.name, "coding-slash-label"), el("span", L("coding.palette.symbol-line", { kind: item.symbol.kind, line: item.symbol.line }), "coding-slash-hint"));
  } else if (item.kind === "file") {
    const slash = item.path.lastIndexOf("/");
    option.append(el("span", item.path.slice(slash + 1), "coding-slash-label"), el("span", slash > 0 ? item.path.slice(0, slash) : "", "coding-slash-hint"));
  } else {
    option.append(el("code", "/" + item.command.slash), el("span", item.command.label, "coding-slash-label"), el("span", item.command.hint || "", "coding-slash-hint"));
  }
  menu.ports.lifetime.listen(option, "mousedown", event => {
    event.preventDefault();
    pick(menu, index);
  });
  return option;
}

function draw(menu: Menu) {
  const { ports, node, mention } = menu, L = ports.translate;
  node.replaceChildren();
  node.hidden = false;
  node.setAttribute("aria-label", mention ? L("coding.palette.files") : L("coding.slash.label"));
  menu.items.forEach((item, index) => node.append(itemRow(menu, item, index)));
  if (mention && !menu.items.length) {
    const none = mention.file !== undefined
      ? (menu.symbolsError || (menu.symbols.has(symbolKey(menu)) ? L("coding.palette.no-symbols") : L("coding.palette.reading-symbols")))
      : (menu.filesError || (menu.files ? L("coding.palette.no-files") : L("coding.palette.reading-files")));
    node.append(el("p", none, "coding-slash-empty"));
  }
  ports.input.setAttribute("aria-activedescendant", menu.items.length ? "coding-slash-" + menu.active : "");
  node.children[menu.active]?.scrollIntoView({ block: "nearest" });
}

/** Reads the definitions of a file once, then draws the menu again. */
async function loadSymbols(menu: Menu, file: string) {
  const { ports } = menu, key = ports.workspace() + " " + file;
  if (menu.symbols.has(key) || !ports.symbols || !ports.workspace()) return;
  menu.symbols.set(key, null);
  menu.symbolsError = "";
  try {
    const value = await ports.symbols(ports.workspace(), file);
    menu.symbols.set(key, value.symbols || []);
    if (value.unreadable) menu.symbolsError = ports.translate("coding.palette.unreadable");
    refresh(menu);
  } catch (error) {
    if (!ports.lifetime.alive) return;
    menu.symbols.delete(key);
    menu.symbolsError = errorMessage(error);
    refresh(menu);
  }
}

/** Reads the file list of the workspace once, then draws the menu again. */
async function loadFiles(menu: Menu) {
  const { ports } = menu, key = ports.workspace();
  if (!key) {
    menu.filesError = ports.translate("coding.palette.choose-workspace");
    return;
  }
  if (menu.filesFor === key && (menu.files || !menu.filesError)) return;
  menu.filesFor = key;
  menu.files = null;
  menu.filesError = "";
  try {
    const value = await ports.files(key);
    if (menu.filesFor === key) {
      menu.files = value.files;
      refresh(menu);
    }
  } catch (error) {
    if (!ports.lifetime.alive) return;
    if (menu.filesFor === key) {
      menu.filesError = errorMessage(error);
      refresh(menu);
    }
  }
}

const fold = (name: string, word: string) => Number(!name.toLowerCase().startsWith(word));
const baseName = (path: string) => {
  const own = path.replace(/\/$/, "");
  return own.slice(own.lastIndexOf("/") + 1).toLowerCase();
};

function showItems(menu: Menu, items: Item[]) {
  menu.items = items;
  menu.active = Math.min(menu.active, Math.max(items.length - 1, 0));
  draw(menu);
}

/** Draws the menu for what is typed before the caret: `@path#name`, `@path`, or a `/` command at the start. */
function refresh(menu: Menu) {
  const { ports } = menu, { input } = ports;
  const before = input.value.slice(0, input.selectionStart ?? input.value.length), at = /(^|\s)[@＠]([^\s@＠]*)$/.exec(before);
  const hash = at ? at[2].search(/[#＃]/) : -1;
  // "@path#name" names one definition in a file: after "#", the menu lists that file's functions, classes and types.
  if (at && hash > 0) {
    const file = at[2].slice(0, hash), word = at[2].slice(hash + 1).toLowerCase();
    menu.mention = { start: before.length - at[2].length - 1, query: at[2], file };
    void loadSymbols(menu, file);
    const found = (menu.symbols.get(symbolKey(menu)) || []).filter(symbol => matches(word, symbol.name)).sort((a, b) => fold(a.name, word) - fold(b.name, word) || a.line - b.line).slice(0, LIMIT);
    showItems(menu, found.map((symbol): Item => ({ kind: "symbol", symbol })));
    return;
  }
  // "@" at the start of a word names a workspace file; basename matches rank first, then the whole path.
  // Chinese punctuation mode types "、" for "/" and may type "＠" for "@"; both open the same menus.
  if (at) {
    menu.mention = { start: before.length - at[2].length - 1, query: at[2] };
    void loadFiles(menu);
    const word = at[2].toLowerCase();
    const found = (menu.files || []).filter(path => matches(word, path)).sort((a, b) => Number(!baseName(a).startsWith(word)) - Number(!baseName(b).startsWith(word)) || a.length - b.length).slice(0, LIMIT);
    showItems(menu, found.map((path): Item => ({ kind: "file", path })));
    return;
  }
  menu.mention = null;
  const typed = /^[/、](\S*)$/.exec(input.value);
  if (!typed) {
    close(menu);
    return;
  }
  const found = ports.commands().filter(command => command.enabled !== false && matches(typed[1], command.slash, command.label, ...(command.keywords || [])));
  if (!found.length) {
    close(menu);
    return;
  }
  menu.active = Math.min(menu.active, found.length - 1);
  menu.items = found.map((command): Item => ({ kind: "command", command }));
  draw(menu);
}

/** Takes the item: a mention is put in the text; a command is run. */
function pick(menu: Menu, index: number) {
  const item = menu.items[index], { input } = menu.ports, { mention } = menu;
  if (!item) return;
  if (mention) {
    const text = item.kind === "symbol" ? mention.file + "#" + item.symbol.name : item.kind === "file" ? item.path : "";
    const end = mention.start + 1 + mention.query.length;
    input.value = input.value.slice(0, mention.start) + "@" + text + " " + input.value.slice(end);
    const caret = mention.start + text.length + 2;
    input.setSelectionRange(caret, caret);
    close(menu);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  close(menu);
  if (item.kind === "command") void menu.run(item.command);
}

/** The keys an open menu takes before the composer does. */
function onKeydown(menu: Menu, event: KeyboardEvent) {
  if (menu.node.hidden || event.isComposing || event.keyCode === 229) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (menu.items.length) {
      menu.active = (menu.active + (event.key === "ArrowDown" ? 1 : menu.items.length - 1)) % menu.items.length;
      draw(menu);
    }
  } else if ((event.key === "Enter" || event.key === "Tab") && menu.items.length) {
    event.preventDefault();
    event.stopImmediatePropagation();
    pick(menu, menu.active);
  } else if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    close(menu);
  }
}

export interface SlashMenu { readonly close: () => void }

/** The slash menu: "/" at the start of an empty composer lists commands, "@" lists files and their definitions; typing narrows them. */
export function slashMenu(ports: MenuPorts, run: Menu["run"]): SlashMenu {
  const { lifetime, q, input } = ports;
  const menu: Menu = { ports, node: q("[data-coding-slash-menu]"), run, items: [], active: 0, mention: null, files: null, filesFor: "", filesError: "", symbols: new Map(), symbolsError: "" };
  input.setAttribute("aria-controls", "coding-slash-menu");
  lifetime.listen(input, "input", () => {
    menu.active = 0;
    refresh(menu);
  });
  lifetime.listen(input, "click", () => refresh(menu));
  lifetime.listen(input, "blur", () => lifetime.timeout(() => close(menu), 120));
  // Registered before the composer's own keys, so an open menu takes Enter, Tab and Esc (Esc never stops a round here).
  lifetime.listen(input, "keydown", event => { if (event instanceof KeyboardEvent) onKeydown(menu, event); }, true);
  return { close: () => close(menu) };
}
