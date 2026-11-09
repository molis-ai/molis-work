import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";
import { feedStage, FILTER_FIELDS } from "./stage.js";
import { feedSources } from "./sources.js";
import { feedRules } from "./rule-authoring.js";

export type FeedHost = Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>, "root" | "scope" | "translate" | "pluginRoute" | "route" | "mount" | "search" | "view" | "openView" | "openItem" | "openPlugin" | "showToast" | "invalidateView" | "connectionSlot" | "connectionNeed" | "invokeAction" | "actionAvailability" | "confirm">;
export interface FeedPage {
  host: FeedHost;
  q<T extends HTMLElement = HTMLElement>(selector: string, within?: ParentNode): T | null;
  all<T extends HTMLElement = HTMLElement>(selector: string, within?: ParentNode): T[];
  listen<K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void): void;
  guard(): () => void;
  change(): void;
  signal(): AbortSignal;
  pending(cleanup: () => void): () => void;
  api<T = Record<string, unknown>>(path: string, method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T>;
  selection: string;
  panel: string;
  /** `notice`: a change announced from outside this page, not one of its own operations. */
  refresh(notice?: boolean): Promise<void>;
  select(id: string, intent?: string, panel?: string): void;
  error(error: unknown, element?: HTMLElement | null): void;
}

/** Each declared surface has its own root, requests and selection; only the Host owns pane/tab state. */
export function feedClient(host: FeedHost): void {
  let epoch = 0, reads = new AbortController();
  const pending = new Set<() => void>();
  const { root, scope } = host;
  const page: FeedPage = {
    host, selection: "all", panel: "messages",
    q: <T extends HTMLElement = HTMLElement>(selector: string, within: ParentNode = root) => within.querySelector<T>(selector),
    all: <T extends HTMLElement = HTMLElement>(selector: string, within: ParentNode = root) => [...within.querySelectorAll<T>(selector)],
    listen: (type, handler) => { root.addEventListener(type, handler, { capture: type === "scroll" || type === "toggle" }); scope.own(() => root.removeEventListener(type, handler, { capture: type === "scroll" || type === "toggle" })); },
    guard: () => {
      const original = epoch;
      return () => { scope.assertCurrent(); if (!scope.visible || !root.isConnected || original !== epoch) throw new DOMException("View changed", "AbortError"); };
    },
    change: () => { epoch++; reads.abort(); for (const cleanup of [...pending]) cleanup(); reads = new AbortController(); },
    signal: () => reads.signal,
    pending: cleanup => { let alive = true; const finish = () => { if (!alive) return; alive = false; pending.delete(finish); cleanup(); }; pending.add(finish); return finish; },
    api: async <T>(path: string, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<T> => {
      const check = page.guard();
      const result = await molisWorkRequest<T>(host.pluginRoute(path), { method, body, scope, signal: reads.signal }); check(); return result;
    },
    refresh: async () => {}, select: () => {},
    error: (error, element) => { if (!scope.alive || !scope.visible || error instanceof DOMException && error.name === "AbortError") return; if (element?.isConnected) molisWorkRequest.show(element, error); else host.showToast(molisWorkRequest.text(error), true); },
  };
  const stage = feedStage(page), sources = feedSources(page), rules = feedRules(page);
  let refreshSequence = 0, activeRefresh = Promise.resolve(), drawn = "", redraw = false, reading = 0;
  page.refresh = notice => {
    // This page's own operations always redraw: what they change can live outside the page document (the open item's detail,
    // a source's account), and only a redraw reads those again. A notice coalesced with one of them redraws too.
    if (!notice) redraw = true;
    const check = page.guard(), sequence = ++refreshSequence;
    const refresh = async () => {
      reading++;
      const html = await host.view.readDocument({ signal: page.signal() }).finally(() => reading--); check();
      if (sequence !== refreshSequence) { await activeRefresh; check(); return; }
      // A notice that reads back what is already drawn (the poll after this page's own save) leaves the page alone:
      // redrawing it would only swap out the controls in use and the result a person was just shown.
      if (html === drawn && !redraw) return;
      redraw = false;
      const controls = page.all<HTMLInputElement | HTMLSelectElement>("[data-feed-search]," + FILTER_FIELDS).map(field => ({ attr: [...field.attributes].find(attr => attr.name.startsWith("data-feed-"))!.name, value: field.value }));
      const filterOpen = page.q("[data-feed-filter-panel]")?.hidden === false;
      const next = new DOMParser().parseFromString(html, "text/html").querySelector<HTMLElement>("[data-ui-client-root]");
      if (!next) throw new Error(uiText.text("feed.factory.could-not-refresh-feed"));
      // Preserve unsaved settings and the rule composer while authoritative rows/configuration are redrawn.
      for (const previous of page.all("[data-feed-task-config]")) {
        const replacement = next.querySelector<HTMLElement>('[data-feed-task-config="' + CSS.escape(previous.dataset.feedTaskConfig!) + '"]');
        if (!replacement) continue;
        const composer = previous.querySelector("[data-feed-rule-composer]");
        const newComposer = replacement.querySelector("[data-feed-rule-composer]");
        if (composer && newComposer) newComposer.replaceWith(composer);
        for (const field of previous.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")) {
          const key = [...field.attributes].find(attr => attr.name.startsWith("data-"));
          const dirty = field instanceof HTMLSelectElement ? [...field.options].some(option => option.selected !== option.defaultSelected) : field instanceof HTMLInputElement && field.type === "checkbox" ? field.checked !== field.defaultChecked : field.value !== field.defaultValue;
          const control = key && replacement.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[" + key.name + '="' + CSS.escape(key.value) + '"]');
          if (dirty && control) { control.value = field.value; if (control instanceof HTMLInputElement && field instanceof HTMLInputElement) control.checked = field.checked; }
        }
        for (const details of replacement.querySelectorAll("details")) details.open = [...previous.querySelectorAll("details[open]")].some(old => old.querySelector("summary")?.textContent === details.querySelector("summary")?.textContent);
      }
      // Keep the disclosure, its Add control, and the inline form while rows/configuration refresh beneath them.
      const menu = page.q("[data-feed-source-menu]"), nextMenu = page.q("[data-feed-source-menu]", next);
      let menuFocus: Element | null = null;
      if (menu && nextMenu) {
        const rail = page.q("[data-feed-source-rail]", menu), nextRail = page.q("[data-feed-source-rail]", nextMenu);
        if (rail && nextRail) { const nav = rail.querySelector("nav"), nextNav = nextRail.querySelector("nav"); if (nav && nextNav) nav.replaceChildren(...nextNav.childNodes); const count = rail.querySelector('[data-feed-task="all"] em'), nextCount = nextRail.querySelector('[data-feed-task="all"] em'); if (count && nextCount) count.textContent = nextCount.textContent; }
        // Sample only at the synchronous move: a pending read or a blurred frame may have stale focus.
        const focus = root.ownerDocument.hasFocus() ? root.ownerDocument.activeElement : null;
        if (menu.contains(focus)) menuFocus = focus;
        nextMenu.replaceWith(menu);
      }
      const dialog = page.q("[data-feed-sources-dialog]"), nextDialog = page.q("[data-feed-sources-dialog]", next);
      if (dialog && nextDialog) { const draft = page.q<HTMLFormElement>("[data-feed-add-form]", dialog), nextDraft = page.q<HTMLFormElement>("[data-feed-add-form]", nextDialog); if (draft && nextDraft) nextDraft.replaceWith(draft); for (const account of page.all<HTMLFormElement>("[data-feed-add-account]", dialog)) { const replacement = page.q<HTMLFormElement>('[data-feed-add-account="' + CSS.escape(account.dataset.feedAddAccount!) + '"]', nextDialog); if (replacement) replacement.replaceWith(account); } dialog.replaceChildren(...nextDialog.childNodes); nextDialog.replaceWith(dialog); }
      const scroll = stage.scroll(); root.replaceChildren(...next.childNodes); drawn = html;
      if (menuFocus instanceof HTMLElement && menuFocus.isConnected) menuFocus.focus({ preventScroll: true });
      for (const saved of controls) { const control = page.q<HTMLInputElement | HTMLSelectElement>("[" + saved.attr + "]"); if (control) control.value = saved.value; }
      const filterPanel = page.q("[data-feed-filter-panel]"); if (filterPanel) filterPanel.hidden = !filterOpen;
      page.q("[data-feed-filter-trigger]")?.setAttribute("aria-expanded", String(filterOpen));
      page.select(page.selection, "restore", page.panel); stage.restoreScroll(scroll); rules.hydrate();
    };
    activeRefresh = refresh();
    return activeRefresh;
  };
  page.select = (id, intent = "restore", panel) => {
    if (host.mount?.surface === "workbench" && !page.all("[data-feed-task]").some(node => node.dataset.feedTask === id)) id = "all";
    // A change of selection cancels this page's reads. The page document is the same whichever view is selected, so a
    // refresh it cancels reads again: a change announced from outside meanwhile is still drawn.
    if (id !== page.selection) { page.change(); if (reading) void page.refresh(true).catch(page.error); }
    page.selection = id; if (panel) page.panel = panel; else if (intent !== "restore") page.panel = "messages";
    sources.select(id, intent); stage.filter();
    // Opening a view without naming a panel shows its messages, also when it was already selected with a panel open.
    if (panel || intent !== "restore" || page.panel !== "messages") sources.show(page.panel); rules.hydrate();
  };
  page.listen("molis-work:select-item" as keyof HTMLElementEventMap, event => {
    const detail = (event as CustomEvent<{ itemId?: string | null; view?: string; panel?: string; intent?: string; invalidate?: boolean }>).detail;
    if (!detail) return;
    if (detail.invalidate) { if (scope.visible) void page.refresh(true).catch(error => page.error(error)); return; }
    page.select(detail.view ?? "all", detail.intent, detail.panel);
    if (typeof detail.itemId === "string") void stage.select(detail.itemId, true).catch(error => page.error(error));
    else if (detail.itemId === null) stage.collapse();
  });
  page.listen("click", event => {
    const target = event.target instanceof Element ? event.target : null; if (!target) return;
    void (async () => { if (await rules.click(target)) return; if (await sources.click(target, event)) return; await stage.click(target, event); })().catch(error => page.error(error));
  });
  scope.whenVisible(() => { page.change(); page.all("[data-feed-rule-composer][aria-busy]").forEach(composer => { composer.inert = false; composer.removeAttribute("aria-busy"); }); scope.frame(() => { if (scope.visible) void page.refresh().catch(error => page.error(error)); }); return () => page.change(); });
  scope.own(() => page.change());
  page.select("all");
  const requested = new URLSearchParams(host.search).get("feedRule");
  if (requested && host.mount?.surface === "workbench") {
    const row = page.q('[data-feed-out-rule-row="' + CSS.escape(requested) + '"]'), id = row?.closest<HTMLElement>("[data-feed-out-rules]")?.dataset.feedOutRules;
    if (id) { page.select(id, "open", "rules"); host.openView({ surface: "workbench", id, panel: "rules", intent: "open" }); scope.frame(() => row?.scrollIntoView({ block: "nearest", behavior: "instant" })); }
    else host.showToast(uiText.text("feed.factory.original-capture-rule-doesn-t-exist-may-have"));
  }
}

declare const host: FeedHost;
feedClient(host);
