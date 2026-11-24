import { escapeHtml, icon, renderAlert, renderBadge, renderButton, renderPopover, renderStatusMark, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SurfaceHomeDisplay, SurfaceHomeRowDisplay } from "@molis-ai/molis-work-design-system";
import { homeButton, homeReadAt, homeWord, isPlacementControl, renderHome, renderHomePeek, subjectKey, type HomeControl } from "./project-home-render.js";
import { createPositionCorrections } from "./project-position-corrections.js";
import { positionMenuKey } from "./project-position-menu.js";
import { createPositionPeek } from "./project-position-peek.js";
import { mountHomePageFrame } from "./plugin-frame/home-page-document.js";
import type { mountHomePages } from "./project-home-pages.js";

import { renderCheckSummary, renderCompareAdoptBar, renderEditConflict } from "@molis-ai/molis-work-design-system/home-page-adoption";
import type { installRenderers } from "./mainline-ui.js";

(globalThis as { molisWorkMainline?: { installRenderers: typeof installRenderers } }).molisWorkMainline?.installRenderers({
  escapeHtml, icon, renderAlert, renderBadge, renderButton, renderPopover, renderStatusMark, t,
  renderCheckSummary, renderCompareAdoptBar, renderEditConflict,
});

interface HomeHost {
  root?: HTMLElement;
  read<Output>(suffix: string, body: unknown, signal: AbortSignal): Promise<Output>;
  navigationFrom(source: HTMLElement): (result: unknown) => boolean;
  market(): void;
  picker?(): void;
  /** The caret into the conversation's input: a new project's "start a piece of work". */
  write?(): void;
  /** The address of one of this project's settings pages. */
  settingsHref?(section: string): string;
  projectKey: string;
  translate(key: string): string;
  changed(): void;
  receipt(message: string): void;
  offerApi(path: string, method: string, body: unknown, signal: AbortSignal): Promise<unknown>;
  offers(input: { root: HTMLElement; current: () => { subject: SurfaceHomeRowDisplay["subject"] } | null;
    projectKey: string; api: (path: string, method: string, body: unknown) => Promise<unknown>;
    refresh: () => Promise<void>; translate: HomeHost["translate"] }): { refresh(): void; clear(): void };
  /** Reads the displayed language's words for this response's grants into the page (surface-composition §14.6). */
  words(text: NonNullable<SurfaceHomeDisplay["surface_text"]>, signal: AbortSignal): Promise<void>;
  /** Project route prefix (e.g. `/projects/<id>`) for generated-page iframe gateway calls. */
  routePrefix?: string;
  /** Trusted shell control headers for generated-page API calls. */
  headers?(): Record<string, string>;
}
type ClickResult = { kind: "stage" | "settings" } | { kind: "peek"; row: SurfaceHomeRowDisplay }
  | { kind: "invoked"; stage?: unknown; retry_open?: HomeControl["target"] } | { kind: "enabled" };

export function reconcileSurfaceRows(root: HTMLElement, html: string, retainedMarkup: WeakMap<Element, string>) {
  const doc = root.ownerDocument, focus = doc.activeElement;
  const focused = focus && root.contains(focus) ? focus.closest("[data-home-row]") : null;
  const rowKey = focused?.getAttribute("data-home-row");
  const action = focus?.getAttribute("data-presentation-action");
  const title = focus?.matches(".mw-presentation__row-title");
  const menu = focus?.matches(".mw-presentation__more summary");
  const template = doc.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("[data-home-row-peek] .mw-presentation__row-title").forEach(node => {
    node.setAttribute("aria-haspopup", "dialog");
    node.setAttribute("role", "button");
  });
  // A name that opens the object itself is a button too, to a screen reader as to the hand.
  template.content.querySelectorAll("[data-home-row-open] .mw-presentation__row-title").forEach(node => node.setAttribute("role", "button"));
  // Keep open menus while the same controls are repainted with the current data.
  const retained = "[data-home-row], [data-surface-correction-reason], .surface-correction-default";
  template.content.querySelectorAll(retained).forEach(node => retainedMarkup.set(node, node.outerHTML));
  const branch = "[data-home-group], .home-rows";
  // Two lists of one section (what is new, and what is earlier) are two branches: each keeps its own rows.
  const key = (node: Element) => node.getAttribute("data-home-row") ?? node.getAttribute("data-home-group") ?? (node.matches(branch) ? node.className + " " + (node.getAttribute("data-home-rows") ?? "") : null);
  function patch(parent: Element, incoming: HTMLCollection) {
    const current = new Map([...parent.children].map(node => [key(node), node]));
    let next = parent.firstElementChild;
    for (const candidate of [...incoming]) {
      const id = key(candidate);
      const old = id === null ? next : current.get(id);
      let node = candidate;
      if (candidate.matches(retained)) {
        if (old && retainedMarkup.get(old) === retainedMarkup.get(candidate)) node = old;
      } else if (old?.isEqualNode(candidate)) node = old;
      else if (old && id !== null && candidate.matches(branch)) {
        for (const attr of [...old.attributes]) if (!candidate.hasAttribute(attr.name)) old.removeAttribute(attr.name);
        for (const attr of [...candidate.attributes]) if (old.getAttribute(attr.name) !== attr.value) old.setAttribute(attr.name, attr.value);
        patch(old, candidate.children);
        node = old;
      }
      if (node !== next) parent.insertBefore(node, next);
      next = node.nextElementSibling;
    }
    while (next) { const stale = next; next = next.nextElementSibling; stale.remove(); }
  }
  patch(root, template.content.children);
  if (rowKey && doc.activeElement === doc.body) {
    if (focus?.isConnected && "focus" in focus) (focus as HTMLElement).focus({ preventScroll: true });
    else {
      const row = root.querySelector<HTMLElement>('[data-home-row="' + CSS.escape(rowKey) + '"]');
      const replacement = action ? row?.querySelector<HTMLElement>('[data-presentation-action="' + CSS.escape(action) + '"]')
        : title ? row?.querySelector<HTMLElement>(".mw-presentation__row-title") : menu ? row?.querySelector<HTMLElement>(".mw-presentation__more summary") : undefined;
      (replacement ?? row?.querySelector<HTMLElement>("button,summary,[tabindex]"))?.focus({ preventScroll: true });
    }
  }
}

export { createPositionViews } from "./project-position.js";
export { mountSkillPicks } from "./skill-picks.js";
export { mountStartEntries } from "./project-start-entries.js";
export { installWorkBar } from "./work-bar.js";
export { presentationWord, renderHomePeek, renderPositionGroup, surfaceCorrectionWord } from "./project-home-render.js";

function bindHomeControls(root: HTMLElement, peek: HTMLDialogElement, act: (key: string, focus: HTMLElement) => Promise<void>, closePeek: () => void, onClose: () => void,
  correct: ReturnType<typeof createPositionCorrections>["handle"]) {
  root.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>("[data-home-control], [data-presentation-action]");
    if (button) {
      const key = button.dataset.homeControl ?? button.dataset.presentationAction ?? "";
      if (correct(key, button, event)) return;
      const menu = button.closest("details"), focus = menu?.querySelector("summary") ?? button;
      menu?.removeAttribute("open");
      void act(key, focus);
    } else if (event.target.closest("[data-home-close]")) closePeek();
    else {
      const title = event.target.closest<HTMLElement>(".mw-presentation__row-title[aria-haspopup]");
      const opens = title ? null : event.target.closest<HTMLElement>("[data-home-row-open] .mw-presentation__row-title");
      if (title) void act(title.closest<HTMLElement>("[data-home-row-peek]")!.dataset.homeRowPeek!, title);
      else if (opens) void act(opens.closest<HTMLElement>("[data-home-row-open]")!.dataset.homeRowOpen!, opens);
    }
  });
  root.addEventListener("keydown", event => {
    positionMenuKey(event);
    if (!(event.target instanceof HTMLElement)) return;
    const key = event.target.closest<HTMLElement>("[data-home-row-peek]")?.dataset.homeRowPeek;
    const open = event.target.closest<HTMLElement>("[data-home-row-open]")?.dataset.homeRowOpen;
    if (event.key !== "Enter" && event.key !== " ") return;
    const press = key && event.target.matches(".mw-presentation__row-title[aria-haspopup]") ? key
      : open && event.target.matches(".mw-presentation__row-title") ? open : undefined;
    if (!press) return;
    event.preventDefault();
    void act(press, event.target);
  });
  peek.addEventListener("close", onClose);
}

/** A replaced or dropped response ends its own word grants, also for a later language switch; a newer one keeps its own. */
function releaseHomeText(host: HomeHost, old: SurfaceHomeDisplay | null) {
  const text = old?.surface_text?.map(item => item.ref);
  if (!text?.length) return;
  globalThis.molisWorkSurfaceText?.release(text);
  void host.read("", { release_text: text }, new AbortController().signal).catch(() => undefined);
}
/** The grants differ on every read; what is shown does not have to. */
const sameShown = (a: SurfaceHomeDisplay | null, b: SurfaceHomeDisplay) =>
  !!a && JSON.stringify({ ...a, surface_text: undefined }) === JSON.stringify({ ...b, surface_text: undefined });

/**
 * When this person was last on this project's first page, on this device: page state like a scroll position, never sent anywhere.
 * It is read once as a visit begins and written as the visit ends, so 「自你上次来」 stays put while the page is open.
 */
function createLastVisit(projectKey: string) {
  const key = "molis-work-home-seen:" + projectKey;
  let since: string | null | undefined;
  return {
    begin() {
      if (since !== undefined) return since;
      try {
        since = localStorage.getItem(key);
      } catch {
        since = null;
      }
      if (since && !Number.isFinite(Date.parse(since))) since = null;
      return since;
    },
    end() {
      if (since === undefined) return;
      since = undefined;
      try {
        localStorage.setItem(key, new Date().toISOString());
      } catch { /* Storage may be blocked: the page then reads as a first visit. */ }
    },
  };
}

/**
 * One ink-blue button a screen (specs/screen-polish §八之二 第 6 条): while the assistant's conversation is open its send key has it,
 * and the page's own first step steps down to a plain button; it comes back when the conversation closes.
 */
function yieldPrimary(root: Element) {
  const panel = root.ownerDocument.querySelector<HTMLElement>("[data-assistant-panel]");
  const apply = () => {
    const open = Boolean(panel && !panel.hidden);
    for (const button of root.querySelectorAll(":is(.mw-first-page__step, .mw-first-page__ask) :is(.mw-btn--primary, [data-home-yielded])")) {
      button.toggleAttribute("data-home-yielded", open);
      button.classList.toggle("mw-btn--primary", !open);
      button.classList.toggle("mw-btn--secondary", open);
    }
  };
  const observer = panel ? new MutationObserver(apply) : null;
  if (panel) observer?.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  return { apply, stop: () => observer?.disconnect() };
}

/** When the home is shown, hidden or has to read again: the root, its holder, the plugin list and the place. */
function watchHome(root: Element, holder: Element | null, visibility: () => void, reload: () => void, leave: () => void) {
  const observer = new MutationObserver(visibility);
  const observeChain = (node: Element | null) => {
    const body = node?.ownerDocument?.body ?? null;
    for (let current = node; current && current !== body; current = current.parentElement) {
      observer.observe(current, { attributes: true, attributeFilter: ["hidden"] });
    }
  };
  observeChain(root);
  observeChain(holder);
  const panes = document.querySelector("[data-tab-panes]");
  if (panes) observer.observe(panes, { childList: true });
  document.addEventListener("visibilitychange", visibility);
  document.addEventListener("molis-work:plugins-changed", reload);
  document.addEventListener("molis-work:place-changed", visibility);
  window.addEventListener("pagehide", leave);
  window.addEventListener("pageshow", visibility);
  queueMicrotask(visibility);
  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    document.removeEventListener("molis-work:plugins-changed", reload);
    document.removeEventListener("molis-work:place-changed", visibility);
    window.removeEventListener("pagehide", leave);
    window.removeEventListener("pageshow", visibility);
  };
}

export function mountHome(host: HomeHost) {
  const surface = host.root ?? document.querySelector<HTMLElement>('[data-work-surface="home"]');
  if (!surface) return null;
  const root = surface;
  const groups = root.querySelector<HTMLElement>("[data-home-groups]")!, status = root.querySelector<HTMLElement>("[data-home-status]")!;
  const margin = root.querySelector<HTMLElement>("[data-home-margin]")!;
  /** Where the label of the writing the page's sentences are from goes, in the line over the title. */
  const version = root.querySelector<HTMLElement>("[data-home-version]");
  const visit = createLastVisit(host.projectKey);
  const peek = root.querySelector<HTMLDialogElement>("[data-home-peek]")!, peekContent = peek.querySelector<HTMLElement>("[data-home-peek-content]")!;
  const controls = new Map<string, HomeControl>();
  const peekControls = new Map<string, HomeControl>();
  const rowMarkup = new WeakMap<Element, string>();
  const corrections = createPositionCorrections(groups, { note: host.receipt, changed: host.changed,
    send: (correct, signal) => host.read("", { correct }, signal) });
  let inspected: SurfaceHomeRowDisplay | null = null;
  let inspecting: AbortController | null = null;
  const offers = host.offers({ root: peek, current: () => inspected, projectKey: host.projectKey, translate: host.translate,
    api: (path, method, body) => inspecting && !inspecting.signal.aborted
      ? host.offerApi(path, method, body, inspecting.signal) : Promise.reject(new DOMException("View closed", "AbortError")),
    refresh: async () => sync() });
  let display: SurfaceHomeDisplay | null = null, reading: AbortController | null = null, clicking: AbortController | null = null;
  let restoreFocus: HTMLElement | null = null, shown = false, needsRead = true, receipt: HomeControl | null = null;
  /** Whether the person opened every row of 「自你上次来」 during this visit. */
  let showAll = false;
  const holder = window.frameElement;
  const visible = () => root.isConnected && !document.hidden && !root.closest("[hidden]") && (!holder || holder.isConnected && !holder.closest("[hidden]"));
  const placement = createPositionPeek(groups, (body, signal) => host.read(body.click ? "/click" : "", body.click ?? body, signal), host,
    { source: () => ({}), expanded: () => false, visible, displayed: () => display ?? undefined, lookup: key => controls.get(key),
      navigate: async () => { /* Placement offers have no peek navigation. */ } });
  const caption = (word?: string, button?: string) => {
    status.innerHTML = (word ? "<p>" + escapeHtml(homeWord(word)) + "</p>" : "") + (button ? homeButton(button, homeWord(button === "refresh" ? "retry" : "open-result")) : "");
  };
  const closePeek = () => {
    offers.clear();
    peekControls.clear(); peekContent.replaceChildren();
    inspecting?.abort(); inspecting = null; inspected = null;
    if (peek.open) peek.close();
  };
  const cancel = (release: boolean) => {
    reading?.abort(); reading = null; clicking?.abort(); clicking = null;
    closePeek(); placement.close(false); needsRead = true;
    if (!release) return;
    drop();
  };
  const releaseText = (old: SurfaceHomeDisplay | null) => releaseHomeText(host, old);
  /** Takes the painted page off: its words' grants end, and nothing of it can be pressed. */
  function drop() {
    releaseText(display);
    display = null;
    controls.clear();
    corrections.clear();
    groups.replaceChildren();
    margin.replaceChildren();
    version?.replaceChildren();
  }
  const unsafe = (error: unknown) => [401, 403, 404, 409].includes(Number((error as { status?: unknown })?.status));

  function paint(result: SurfaceHomeDisplay) {
    const page = renderHome(result, controls, { since: visit.begin(), readAt: new Date().toISOString(), showAll,
      settingsHref: section => host.settingsHref?.(section) ?? "#" }, corrections.rendering(result));
    reconcileSurfaceRows(groups, page.column, rowMarkup);
    margin.innerHTML = page.margin;
    if (version) version.innerHTML = page.version;
  }

  async function sync(invalidate = false) {
    needsRead = true;
    if (!visible()) return;
    if (invalidate) cancel(true);
    reading?.abort();
    const request = reading = new AbortController();
    if (!display) caption("loading");
    try {
      const result = await host.read<SurfaceHomeDisplay>("", {}, request.signal);
      if (request.signal.aborted || reading !== request || !visible()) { releaseText(result); return; }
      // Without the owners' words the drawing falls back to the unavailable mark; the response itself stays good.
      if (result.surface_text?.length) await host.words(result.surface_text, request.signal).catch(() => undefined);
      if (request.signal.aborted || reading !== request || !visible()) { releaseText(result); return; }
      const before = sameShown(display, result);
      if (inspected) {
        const key = subjectKey(inspected.owner, inspected.subject);
        const previous = display?.display.rows.find(row => subjectKey(row.owner, row.subject) === key);
        const next = result.display.rows.find(row => subjectKey(row.owner, row.subject) === key);
        if (JSON.stringify(previous) !== JSON.stringify(next)) closePeek();
      }
      releaseText(display); display = result; needsRead = false;
      if (!before) {
        placement.close(false);
        paint(result);
      } else {
        // Nothing shown changed, but the page was read again: the margin says when.
        const read = margin.querySelector(".mw-first-page__margin-head small");
        if (read) read.textContent = homeReadAt(new Date().toISOString());
      }
      primary.apply();
      corrections.afterPaint();
      if (inspected?.read.state === "ok") offers.refresh();
      caption(receipt ? "open-failed" : undefined, receipt ? "open-result" : undefined);
    } catch (error) {
      if (request.signal.aborted || reading !== request || !visible()) return;
      if (unsafe(error)) {
        drop();
        closePeek();
        placement.close(false);
      }
      caption("refresh-failed", "refresh");
    } finally { if (reading === request) reading = null; }
  }

  async function act(key: string, focus: HTMLElement) {
    if (!visible() || clicking) return;
    if (key === "refresh") {
      if (display) caption("refreshing");
      await syncAll();
      return;
    }
    if (key === "market") { host.market(); return; }
    if (key === "picker") { (host.picker ?? host.market)(); return; }
    if (key === "write") {
      host.write?.();
      return;
    }
    if (key === "more" || key === "less") {
      showAll = key === "more";
      if (!display) return;
      paint(display);
      primary.apply();
      corrections.afterPaint();
      groups.querySelector<HTMLElement>('[data-home-control="' + (showAll ? "less" : "more") + '"]')?.focus({ preventScroll: true });
      return;
    }
    const control = key === "open-result" ? receipt : controls.get(key) ?? peekControls.get(key);
    if (!control) return;
    if (isPlacementControl(control.target.kind)) { placement.open(key, focus); return; }
    const navigate = host.navigationFrom(root);
    const request = clicking = new AbortController();
    focus.setAttribute("aria-busy", "true");
    try {
      const result = await host.read<ClickResult>("/click", control, request.signal);
      if (request.signal.aborted || clicking !== request || !visible()) return;
      if (result.kind === "peek" && display) {
        restoreFocus = focus;
        inspecting?.abort(); inspecting = new AbortController();
        inspected = result.row;
        peekContent.innerHTML = renderHomePeek(display, result.row, peekControls);
        if (!peek.open) peek.showModal();
        peek.querySelector<HTMLElement>("[data-home-close]")?.focus();
        if (result.row.read.state === "ok") offers.refresh();
      } else if (result.kind === "stage" || result.kind === "settings") {
        if (!navigate(result)) { caption("navigation-failed", "refresh"); return; }
        if (key === "open-result") receipt = null;
      } else if (result.kind === "enabled") {
        await sync(true);
      } else if (result.kind === "invoked") {
        receipt = result.retry_open ? { owner_plugin_id: control.owner_plugin_id, target: result.retry_open } : null;
        if (result.stage && navigate(result.stage)) receipt = null;
        else {
          caption(receipt ? "open-failed" : "created", receipt ? "open-result" : undefined);
          await sync();
        }
      }
    } catch (error) {
      if (!request.signal.aborted && clicking === request && visible()) {
        if (unsafe(error)) {
          drop();
          closePeek();
        }
        caption(key === "open-result" ? "open-failed" : "navigation-failed", key === "open-result" ? key : "refresh");
      }
    } finally {
      focus.removeAttribute("aria-busy");
      if (clicking === request) clicking = null;
    }
  }

  bindHomeControls(root, peek, act, closePeek, () => {
    closePeek(); peekContent.replaceChildren();
    if (visible()) restoreFocus?.focus({ preventScroll: true });
    restoreFocus = null;
  }, corrections.handle);

  /** The visit ends: when it ended is kept for 「自你上次来」, and the page is taken off. */
  const leave = () => {
    homePages?.suspend();
    needsRead = true;
    visit.end();
    showAll = false;
    cancel(true);
  };
  const visibility = () => {
    const next = visible();
    if (next === shown) return;
    shown = next;
    if (shown && needsRead) void syncAll();
    else if (!shown) leave();
  };
  const primary = yieldPrimary(root);
  const mountPages = (globalThis as { molisWorkMainline?: { mountHomePages?: typeof mountHomePages } }).molisWorkMainline?.mountHomePages;
  const homePages =
    host.projectKey && host.projectKey !== "personal" && mountPages
      ? mountPages({
          root, mountFrame: mountHomePageFrame,
          projectKey: host.projectKey,
          routePrefix: host.routePrefix ?? `/projects/${encodeURIComponent(host.projectKey)}`,
          api: <T>(path: string, method: "POST" | "DELETE", body?: unknown, signal?: AbortSignal) =>
            host.offerApi(path, method, body, signal ?? new AbortController().signal) as Promise<T>,
          headers: () => host.headers?.() ?? {},
          receipt: host.receipt,
          onModeChange: (active) => {
            if (active) root.dataset.homeGeneratedActive = "true";
            else delete root.dataset.homeGeneratedActive;
          },
        })
      : null;
  const syncAll = async (invalidate = false) => {
    if (!visible()) {
      needsRead = true;
      return;
    }
    await Promise.all([sync(invalidate), homePages?.sync()]);
  };
  const unwatch = watchHome(root, holder, visibility, () => {
    cancel(true);
    if (visible()) void syncAll();
  }, () => {
    shown = false;
    leave();
  });
  return {
    sync: syncAll,
    dispose() {
      unwatch();
      primary.stop();
      homePages?.dispose();
      shown = false;
      cancel(true);
    },
  };
}
