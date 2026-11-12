import type { ComposerPickItem } from "@molis-ai/molis-work-contracts/platform/composer";
import type { SearchHit, SearchQueryResponse } from "@molis-ai/molis-work-contracts/services/search";
import type { ComposerMention } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { narrowComposerCommands, renderComposerAddMenu, renderComposerCommands, renderComposerDeliveryMenu, renderComposerMention, renderComposerPick } from "../composer-parts.js";
import { composerDeliveries } from "../composer-rules.js";
import { http, mac, route, type Composer, type Source } from "./composer-state.js";

/**
 * The composer's menus (§3.3): ＋ (files, the registered sources, the page's commands that add something), `/` typed on an empty
 * line (the page's commands), `@` (the system search, `/api/search/query`, the same transport the search palette uses, or the
 * page's own `mentions`) and the delivery ▾. One is open at a time; Esc and a press elsewhere close it. A source and the search are
 * called through the Workbench's own routes as the person (S-composer-source-call); a query waits until the typing pauses, one
 * under way is aborted by the next, and only the latest answer of the menu still open is kept.
 *
 * A menu opened by typing (`/`, `@`) keeps the caret in the text: its first row is the active one, ↑ ↓ move it, Enter or Tab takes
 * it (the text area names it as its active descendant), so a command is `/`, a few letters and Enter. A menu opened by a button
 * takes the focus instead, as every board menu does.
 */

export interface ComposerMenus {
  openAdd(focus: boolean, toggle?: boolean): void;
  /** Draws the open `/` menu again for the words typed after it (`c.typed`). */
  narrow(): void;
  toggleDelivery(toggle: HTMLElement): void; pick(source: Source): void; untype(): void;
  /** Follows the text after an `@` (opened when `at` is given); closes when the caret leaves the words after it. */
  mention(at?: number): void;
  /** Takes the `@words` out of the text and gives the chosen hit. */
  mentioned(index: number): SearchHit | ComposerMention | null;
  /** In a menu opened by typing, moves the active row (`1` down, `-1` up); false when no such menu is open. */
  step(delta: 1 | -1): boolean;
  /** In a menu opened by typing, takes the active row; false when there is none (Enter then writes a line break as always). */
  take(): boolean;
}

export function composerMenus(c: Composer): ComposerMenus {
  const { shell, field, labels, options, signal } = c;
  const typedMenu = () => Boolean(c.open && (c.typed || c.mention));
  const rows = () => [...c.open?.querySelectorAll<HTMLElement>("[role^=menuitem]:not(:disabled)") ?? []];
  /** Marks one row of a typed menu as the one Enter takes, keeping it in view. */
  function activate(row: HTMLElement | undefined) {
    for (const one of c.open?.querySelectorAll("[data-active]") ?? []) one.removeAttribute("data-active");
    if (!row) { field.removeAttribute("aria-activedescendant"); return; }
    row.id ||= `${c.id}-row-${rows().indexOf(row)}`;
    row.setAttribute("data-active", "");
    field.setAttribute("aria-activedescendant", row.id);
    row.scrollIntoView({ block: "nearest" });
  }
  function show(menu: HTMLElement, html: string, focus = true) {
    if (c.open !== menu) c.close();
    // Drawn again while the person is in it (the sources arrive): the focus stays in the menu instead of falling to the page, where Esc no longer reaches the composer.
    const kept = menu.contains(document.activeElement);
    menu.innerHTML = html;
    menu.hidden = false; c.open = menu;
    // A menu rises from the composer: it is no taller than the room above it, so in a short window it scrolls instead of leaving the screen.
    menu.style.setProperty("--mw-composer-menu-room", `${Math.max(96, Math.floor(shell.getBoundingClientRect().top - 14))}px`);
    menu.parentElement?.querySelector("[aria-expanded]")?.setAttribute("aria-expanded", "true");
    if (typedMenu()) activate(rows()[0]);
    else if (focus || kept) menu.querySelector<HTMLElement>("[data-composer-query], [role^=menuitem]:not(:disabled)")?.focus({ preventScroll: true });
  }
  c.close = (refocus = false) => {
    if (!c.open) return;
    const menu = c.open, back = c.typed || c.mention; c.open = null; c.picking = null; c.mention = null; c.queries.end(); clearTimeout(timer);
    field.removeAttribute("aria-activedescendant");
    const opener = menu.parentElement?.querySelector<HTMLElement>("[aria-expanded]");
    opener?.setAttribute("aria-expanded", "false");
    const inside = menu.contains(document.activeElement);
    menu.hidden = true; menu.replaceChildren();
    if (refocus || inside) (back ? field : opener)?.focus({ preventScroll: true });
  };
  let timer = 0;
  /** One query at a time: after `wait`, unless the menu it was for has gone; the next one aborts it. */
  const later = (still: () => boolean, wait: number, run: () => void) => { c.queries.end(); clearTimeout(timer); timer = window.setTimeout(() => { if (still()) run(); }, wait); };
  const addMenu = () => shell.querySelector<HTMLElement>(".mw-composer__start [data-compose-menu]");
  function drawAdd(focus = true) {
    const menu = addMenu();
    if (!menu) return;
    if (c.picking) return show(menu, renderComposerPick(labels, c.picking.source, c.picking.query, c.picking.found), focus);
    if (c.typed) return show(menu, renderComposerCommands(labels, narrowComposerCommands(options.commands ?? [], c.typed)), false);
    show(menu, renderComposerAddMenu(labels, { files: Boolean(options.attachments), ...(c.offersSources ? c.sources === undefined ? {} : { sources: c.sources } : { sources: "unavailable" as const }),
      commands: options.commands ?? [] }), focus);
  }
  function redrawPick(source: Source) {
    const list = c.open?.querySelector(".mw-menu__group"), fresh = document.createElement("template");
    fresh.innerHTML = renderComposerPick(labels, source, c.picking!.query, c.picking!.found);
    const group = fresh.content.querySelector(".mw-menu__group");
    if (list && group) list.replaceWith(group);
  }
  /** What `@` found, as its rows say it: the search's hits with their plugin, the page's own with where they are. */
  const mentionRows = (found: readonly (SearchHit | ComposerMention)[] | string | undefined) => Array.isArray(found)
    ? found.map((one) => "insert" in one ? { title: one.title, ...(one.hint ? { hint: one.hint } : {}) } : { title: one.title, hint: one.plugin_title }) : found as string | undefined;
  return {
    openAdd(focus, toggle = false) {
      if (toggle && c.open === addMenu()) return c.close(true);
      drawAdd(focus);
      if (!c.offersSources || c.typed) return;
      // Read on every opening (BL-composer-source-refresh): a source switched off, removed or no longer granted leaves the menu the
      // next time it opens. What was read last is shown meanwhile, and the menu is drawn again only when the list changed.
      const before = JSON.stringify(c.sources ?? null);
      http()?.<{ sources: Source[] }>(route("/api/composer/sources"), { body: { layer: options.kind }, signal })
        .then((found) => { c.sources = found.sources; }, () => { c.sources = "unavailable"; })
        .then(() => { if (!signal.aborted && !c.picking && !c.typed && c.open === addMenu() && JSON.stringify(c.sources) !== before) drawAdd(false); });
    },
    narrow() { if (c.open === addMenu() && c.typed && !c.picking) drawAdd(false); },
    toggleDelivery(toggle) {
      const menu = toggle.parentElement!.querySelector<HTMLElement>("[data-compose-menu]")!;
      if (c.open === menu || !c.ai) return c.close(true);
      const choices = composerDeliveries(c.running, c.ai.delivery?.(), c.ai.labels.unsupported);
      // Idle, the ordinary choice is the plain Send (a new turn); the target may still take 下一轮再做 (2026-11-09 audit fix).
      const labels = c.running ? c.ai.labels : { ...c.ai.labels, modes: { ...c.ai.labels.modes,
        "next-boundary": { name: c.labels.send, title: c.labels.sendTitle, description: "" } } };
      show(menu, renderComposerDeliveryMenu(c.id, labels, c.running ? choices : { ...choices, "next-boundary": { available: true } }, mac));
    },
    pick(source) {
      c.picking = { source, query: "" };
      drawAdd();
      const ask = (words: string, wait: number) => later(() => c.picking?.source === source, wait, () => void c.queries.latest(
        (aborted) => { const near = options.near?.(); return http()!<{ items: ComposerPickItem[] }>(route("/api/composer/pick"), { signal: aborted, body: {
          layer: options.kind, capability_id: source.capability_id, version: source.version, provider_id: source.provider_id, query: words, limit: 20,
          ...(near ? { near: { ...near, plugin_id: near.plugin_id || c.root.closest<HTMLElement>("[data-plugin-owner]")?.dataset.pluginOwner || document.body.dataset.pluginId } } : {}) } }); },
        (found) => { if (c.picking?.source === source) { c.picking.found = found.items; redrawPick(source); } },
        () => { if (c.picking?.source === source) { c.picking.found = c.fill(labels.unavailable, { name: `${source.provider} · ${source.title}` }); redrawPick(source); } },
      ));
      ask("", 0);
      c.open?.querySelector<HTMLInputElement>("[data-composer-query]")?.addEventListener("input", (event) => {
        if (!c.picking) return;
        c.picking.query = (event.target as HTMLInputElement).value; c.picking.found = undefined; redrawPick(source); ask(c.picking.query, 250);
      }, { signal });
    },
    mention(at) {
      const menu = addMenu();
      if (!menu) return;
      if (at !== undefined) c.mention = { at, query: "" };
      const now = c.mention, caret = field.selectionStart;
      if (!now) return;
      const words = field.value.slice(now.at + 1, caret);
      if (!"@＠".includes(field.value[now.at] ?? " ") || caret <= now.at || /\s/.test(words) || words.length > 200) { c.close(); c.mention = null; return; }
      if (words === now.query && (c.open === menu || !words)) return;
      now.query = words; now.found = undefined;
      const own = options.mentions, glyph = own ? "file" : "package";
      // A bare `@` has nothing to look for yet (the search takes one word at least): the menu waits for it. A page's own `@` lists
      // what it has from the first keystroke (Coding: the workspace's files).
      if (!words && !own) { c.close(); c.mention = now; return; }
      const draw = () => { if (c.mention === now) { show(menu, renderComposerMention(labels, mentionRows(now.found), glyph), false); c.mention = now; } };
      draw();
      later(() => c.mention === now, 250, () => void c.queries.latest(
        (aborted): Promise<readonly (SearchHit | ComposerMention)[]> => own ? own(words, aborted) : http()!<SearchQueryResponse>(route("/api/search/query"), { signal: aborted, body: { query: words, scope: "all", limit: 8 } }).then((found) => found.hits),
        (found) => { now.found = found; draw(); },
        (error) => { now.found = own && error instanceof Error && error.message ? error.message : c.fill(labels.unavailable, { name: "@" }); draw(); },
      ));
    },
    mentioned(index) {
      const now = c.mention, hit = now && Array.isArray(now.found) ? now.found[index] : undefined;
      if (!now || !hit) return null;
      const end = now.at + 1 + now.query.length;
      field.value = field.value.slice(0, now.at) + field.value.slice(end);
      field.setSelectionRange(now.at, now.at);
      c.close();
      return hit;
    },
    /** A `/` typed on an empty line (and the words after it) is taken out once its menu chose something. */
    untype() {
      if (!c.typed) return;
      const at = field.selectionStart, before = field.value.slice(0, at);
      if (before.endsWith(c.typed)) { field.value = before.slice(0, -c.typed.length) + field.value.slice(at); field.setSelectionRange(at - c.typed.length, at - c.typed.length); }
      c.typed = "";
    },
    step(delta) {
      if (!typedMenu()) return false;
      const list = rows(), at = list.findIndex((row) => row.hasAttribute("data-active"));
      if (list.length) activate(list[at < 0 ? (delta > 0 ? 0 : list.length - 1) : (at + delta + list.length) % list.length]);
      return true;
    },
    take() {
      const row = typedMenu() ? c.open!.querySelector<HTMLElement>("[data-active]") : null;
      if (!row) return false;
      row.click();
      return true;
    },
  };
}
