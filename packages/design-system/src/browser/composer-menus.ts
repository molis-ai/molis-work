import type { ComposerPickItem } from "@molis-ai/molis-work-contracts/platform/composer";
import { renderComposerAddMenu, renderComposerDeliveryMenu, renderComposerPick } from "../composer-parts.js";
import { composerDeliveries } from "../composer-rules.js";
import { http, mac, route, type Composer, type Source } from "./composer-state.js";

/**
 * The composer's menus (§3.3): ＋ (files, the registered sources, the page's `/` commands) and, while a turn runs, the delivery ▾.
 * One is open at a time; Esc and a press elsewhere close it. A source is called through the Workbench's own route as the person
 * (S-composer-source-call); its answers are kept only for the latest query of the menu still open.
 */

export interface ComposerMenus { openAdd(focus: boolean, toggle?: boolean): void; toggleDelivery(toggle: HTMLElement): void; pick(source: Source): void; untype(): void }

export function composerMenus(c: Composer): ComposerMenus {
  const { shell, field, labels, options, signal } = c;
  function show(menu: HTMLElement, html: string, focus = true) {
    if (c.open !== menu) c.close();
    menu.innerHTML = html;
    menu.hidden = false; c.open = menu;
    menu.parentElement?.querySelector("[aria-expanded]")?.setAttribute("aria-expanded", "true");
    if (focus) menu.querySelector<HTMLElement>("[data-composer-query], [role^=menuitem]:not(:disabled)")?.focus({ preventScroll: true });
  }
  c.close = (refocus = false) => {
    if (!c.open) return;
    const menu = c.open; c.open = null; c.picking = null; c.queries.end();
    const opener = menu.parentElement?.querySelector<HTMLElement>("[aria-expanded]");
    opener?.setAttribute("aria-expanded", "false");
    const inside = menu.contains(document.activeElement);
    menu.hidden = true; menu.replaceChildren();
    if (refocus || inside) (c.typed ? field : opener)?.focus({ preventScroll: true });
  };
  const addMenu = () => shell.querySelector<HTMLElement>(".mw-composer__start [data-compose-menu]");
  function drawAdd(focus = true) {
    const menu = addMenu();
    if (!menu) return;
    if (c.picking) return show(menu, renderComposerPick(labels, c.picking.source, c.picking.query, c.picking.found), focus);
    show(menu, renderComposerAddMenu(labels, { files: Boolean(options.attachments), ...(c.offersSources ? c.sources === undefined ? {} : { sources: c.sources } : { sources: "unavailable" as const }),
      commands: options.commands ?? [] }), focus);
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
    toggleDelivery(toggle) {
      const menu = toggle.parentElement!.querySelector<HTMLElement>("[data-compose-menu]")!;
      if (c.open === menu || !c.ai) return c.close(true);
      show(menu, renderComposerDeliveryMenu(c.id, c.ai.labels, composerDeliveries(c.running, c.ai.delivery?.(), c.ai.labels.unsupported), mac));
    },
    pick(source) {
      c.picking = { source, query: "" };
      drawAdd();
      let timer = 0;
      const ask = (words: string, wait: number) => {
        clearTimeout(timer);
        timer = window.setTimeout(() => c.queries.latest(
          (aborted) => http()!<{ items: ComposerPickItem[] }>(route("/api/composer/pick"), { signal: aborted, body: {
            layer: options.kind, capability_id: source.capability_id, version: source.version, provider_id: source.provider_id, query: words, limit: 20,
            ...(options.near?.() ? { near: options.near()! } : {}) } }),
          (found) => { if (c.picking?.source === source) { c.picking.found = found.items; redrawPick(source); } },
          () => { if (c.picking?.source === source) { c.picking.found = c.fill(labels.unavailable, { name: `${source.provider} · ${source.title}` }); redrawPick(source); } },
        ), wait);
      };
      ask("", 0);
      c.open?.querySelector<HTMLInputElement>("[data-composer-query]")?.addEventListener("input", (event) => {
        if (!c.picking) return;
        c.picking.query = (event.target as HTMLInputElement).value; c.picking.found = undefined; redrawPick(source); ask(c.picking.query, 250);
      }, { signal });
    },
    /** A trigger typed into the text (`/` on an empty line, `@` after a space) is taken out once its menu chose something. */
    untype() {
      if (!c.typed) return;
      const at = field.selectionStart, before = field.value.slice(0, at);
      if (before.endsWith(c.typed)) { field.value = before.slice(0, -c.typed.length) + field.value.slice(at); field.setSelectionRange(at - c.typed.length, at - c.typed.length); }
      c.typed = "";
    },
  };
}
