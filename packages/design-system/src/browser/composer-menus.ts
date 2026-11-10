import type { ComposerPickItem } from "@molis-ai/molis-work-contracts/platform/composer";
import type { SearchHit, SearchQueryResponse } from "@molis-ai/molis-work-contracts/services/search";
import { narrowComposerCommands, renderComposerAddMenu, renderComposerDeliveryMenu, renderComposerMention, renderComposerPick } from "../composer-parts.js";
import { composerDeliveries } from "../composer-rules.js";
import { http, mac, route, type Composer, type Source } from "./composer-state.js";

/**
 * The composer's menus (§3.3): ＋ (files, the registered sources, the page's `/` commands), `@` (the system search, `/api/search/query`,
 * the same transport the search palette uses) and, while a turn runs, the delivery ▾. One is open at a time; Esc and a press elsewhere
 * close it. A source and the search are called through the Workbench's own routes as the person (S-composer-source-call); a query
 * waits until the typing pauses, one under way is aborted by the next, and only the latest answer of the menu still open is kept.
 */

export interface ComposerMenus {
  openAdd(focus: boolean, toggle?: boolean): void;
  /** Draws the open ＋ menu again for the words typed after `/` (`c.typed`). */
  narrow(): void;
  toggleDelivery(toggle: HTMLElement): void; pick(source: Source): void; untype(): void;
  /** Follows the text after an `@` (opened when `at` is given); closes when the caret leaves the words after it. */
  mention(at?: number): void;
  /** Takes the `@words` out of the text and gives the chosen hit. */
  mentioned(index: number): SearchHit | null;
}

export function composerMenus(c: Composer): ComposerMenus {
  const { shell, field, labels, options, signal } = c;
  function show(menu: HTMLElement, html: string, focus = true) {
    if (c.open !== menu) c.close();
    // Drawn again while the person is in it (the sources arrive, the `/` words narrow it): the focus stays in the menu instead of falling to the page, where Esc no longer reaches the composer.
    const kept = menu.contains(document.activeElement);
    menu.innerHTML = html;
    menu.hidden = false; c.open = menu;
    // A menu rises from the composer: it is no taller than the room above it, so in a short window it scrolls instead of leaving the screen.
    menu.style.setProperty("--mw-composer-menu-room", `${Math.max(96, Math.floor(shell.getBoundingClientRect().top - 14))}px`);
    menu.parentElement?.querySelector("[aria-expanded]")?.setAttribute("aria-expanded", "true");
    if (focus || kept) menu.querySelector<HTMLElement>("[data-composer-query], [role^=menuitem]:not(:disabled)")?.focus({ preventScroll: true });
  }
  c.close = (refocus = false) => {
    if (!c.open) return;
    const menu = c.open, back = c.typed || c.mention; c.open = null; c.picking = null; c.mention = null; c.queries.end(); clearTimeout(timer);
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
    // `/` with words after it: only the commands they name, still in one scrolling list.
    const narrowed = c.typed.length > 1;
    show(menu, renderComposerAddMenu(labels, { files: Boolean(options.attachments), ...(c.offersSources ? c.sources === undefined ? {} : { sources: c.sources } : { sources: "unavailable" as const }),
      commands: narrowed ? narrowComposerCommands(options.commands ?? [], c.typed) : options.commands ?? [], narrowed }), focus);
  }
  function redrawPick(source: Source) {
    const list = c.open?.querySelector(".mw-menu__group"), fresh = document.createElement("template");
    fresh.innerHTML = renderComposerPick(labels, source, c.picking!.query, c.picking!.found);
    const group = fresh.content.querySelector(".mw-menu__group");
    if (list && group) list.replaceWith(group);
  }
  return {
    openAdd(focus, toggle = false) {
      if (toggle && c.open === addMenu()) return c.close(true);
      drawAdd(focus);
      if (!c.offersSources || c.sources !== undefined) return;
      http()?.<{ sources: Source[] }>(route("/api/composer/sources"), { body: { layer: options.kind }, signal })
        .then((found) => { c.sources = found.sources; }, () => { c.sources = "unavailable"; })
        .then(() => { if (!signal.aborted && !c.picking && c.open === addMenu()) drawAdd(false); });
    },
    narrow() { if (c.open === addMenu() && !c.picking) drawAdd(false); },
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
      if (field.value[now.at] !== "@" || caret <= now.at || /\s/.test(words) || words.length > 200) { c.close(); c.mention = null; return; }
      if (words === now.query && (c.open === menu || !words)) return;
      now.query = words; now.found = undefined;
      // A bare `@` has nothing to look for yet (the search takes one word at least): the menu waits for it.
      if (!words) { c.close(); c.mention = now; return; }
      show(menu, renderComposerMention(labels, now.found), false); c.mention = now;
      later(() => c.mention === now, 250, () => void c.queries.latest(
        (aborted) => http()!<SearchQueryResponse>(route("/api/search/query"), { signal: aborted, body: { query: words, scope: "all", limit: 8 } }),
        (found) => { if (c.mention === now) { now.found = found.hits; show(menu, renderComposerMention(labels, now.found), false); } },
        () => { if (c.mention === now) { now.found = c.fill(labels.unavailable, { name: "@" }); show(menu, renderComposerMention(labels, now.found), false); } },
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
  };
}
