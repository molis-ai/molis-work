import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SurfaceHomeDisplay, SurfaceHomeRowDisplay } from "@molis-ai/molis-work-design-system";
import { homeButton, homeLeadName, homeLeadWord, homeWord, isPlacementControl, renderHome, renderHomePeek, subjectKey, type HomeControl } from "./project-home-render.js";
import { createPositionCorrections } from "./project-position-corrections.js";
import { positionMenuKey } from "./project-position-menu.js";
import { createPositionPeek } from "./project-position-peek.js";

interface HomeHost {
  read<Output>(suffix: string, body: unknown, signal: AbortSignal): Promise<Output>;
  navigationFrom(source: HTMLElement): (result: unknown) => boolean;
  market(): void;
  picker?(): void;
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
  /** Puts the proved main page of the lead plugin into the box and gives its node, or null when that page is not mounted here. */
  lead: { adopt(box: HTMLElement, target: unknown): HTMLElement | null; release(node: HTMLElement): void };

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
  // Keep open menus while the same controls are repainted with the current data.
  const retained = "[data-home-row], [data-surface-correction-reason], .surface-correction-default";
  template.content.querySelectorAll(retained).forEach(node => retainedMarkup.set(node, node.outerHTML));
  const branch = "[data-home-group], .home-plugin-cards, .home-plugin-card__body, .home-rows";
  const key = (node: Element) => node.getAttribute("data-home-row") ?? node.getAttribute("data-home-group") ?? (node.matches(branch) ? node.className : null);
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
export { presentationWord, renderHomePeek, renderPositionGroup, surfaceCorrectionWord } from "./project-home-render.js";

function bindHomeControls(root: HTMLElement, peek: HTMLDialogElement, act: (key: string, focus: HTMLElement) => Promise<void>, closePeek: () => void, onClose: () => void,
  correct: ReturnType<typeof createPositionCorrections>["handle"]) {
  root.addEventListener("click", event => {
    // The plugin's page shown as the home handles its own clicks.
    if (!(event.target instanceof Element) || event.target.closest("[data-home-lead]")) return;
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
      if (title) void act(title.closest<HTMLElement>("[data-home-row-peek]")!.dataset.homeRowPeek!, title);
    }
  });
  root.addEventListener("keydown", event => {
    if (event.target instanceof Element && event.target.closest("[data-home-lead]")) return;
    positionMenuKey(event);
    if (!(event.target instanceof HTMLElement)) return;
    const key = event.target.closest<HTMLElement>("[data-home-row-peek]")?.dataset.homeRowPeek;
    if (key && event.target.matches(".mw-presentation__row-title[aria-haspopup]") && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault(); void act(key, event.target);
    }
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
 * The plugin page a `lead` group names, shown in place of the groups, and the thin bar that switches between the two. Whether this person
 * is looking at the basic home is page state: it lasts for the browser session and is never sent anywhere.
 */
function createHomeLead(root: HTMLElement, host: HomeHost) {
  const box = root.querySelector<HTMLElement>("[data-home-lead]")!, bar = root.querySelector<HTMLElement>("[data-home-lead-bar]")!;
  const basicKey = "molis-work-home-basic:" + host.projectKey;
  const stored = (write?: boolean) => {
    try {
      if (write === undefined) return sessionStorage.getItem(basicKey) === "1";
      if (write) sessionStorage.setItem(basicKey, "1"); else sessionStorage.removeItem(basicKey);
    } catch { /* Storage may be blocked; the choice then lasts until the page is left. */ }
    return Boolean(write);
  };
  let basic = stored(), node: HTMLElement | null = null;
  /** Shows the page, or the groups with the way back; a page that is not there leaves the basic home and says so. */
  const show = (shown: SurfaceHomeDisplay | null) => {
    const lead = shown?.lead, name = shown ? homeLeadName(shown) : "";
    const next = lead && !basic ? host.lead.adopt(box, lead.target) : null;
    if (node && node !== next) host.lead.release(node);
    node = next;
    root.toggleAttribute("data-home-leading", Boolean(node));
    box.hidden = !node; bar.hidden = !lead;
    bar.innerHTML = !lead ? "" : (!node && !basic ? "<p>" + escapeHtml(homeLeadWord("lead-failed", name)) + "</p>" : "")
      + '<button type="button" class="mw-btn mw-btn--ghost" data-home-control="lead-toggle">'
      + escapeHtml(node ? homeWord("lead-basic") : homeLeadWord("lead-back", name)) + "</button>";
  };
  /** With the page shown this goes to the groups; otherwise back to the page, which is also the retry after a failure. */
  const toggle = (shown: SurfaceHomeDisplay | null) => {
    basic = stored(Boolean(node));
    show(shown);
    bar.querySelector<HTMLElement>("[data-home-control]")?.focus({ preventScroll: true });
  };
  return { show, toggle };
}

/** When the home is shown, hidden or has to read again: the page, its holder, the plugin list and the place. */
function watchHome(holder: Element | null, visibility: () => void, reload: () => void, leave: () => void) {
  const observer = new MutationObserver(visibility);
  if (holder) {
    observer.observe(holder, { attributes: true, attributeFilter: ["hidden"] });
    for (let ancestor = holder.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ["hidden"] });
    }
  }
  const panes = document.querySelector("[data-tab-panes]");
  if (panes) observer.observe(panes, { childList: true });
  document.addEventListener("visibilitychange", visibility);
  document.addEventListener("molis-work:plugins-changed", reload);
  document.addEventListener("molis-work:place-changed", visibility);
  window.addEventListener("pagehide", leave);
  window.addEventListener("pageshow", visibility);
  queueMicrotask(visibility);
}

export function mountHome(host: HomeHost) {
  const surface = document.querySelector<HTMLElement>('[data-work-surface="home"]');
  if (!surface) return null;
  const root = surface;
  const groups = root.querySelector<HTMLElement>("[data-home-groups]")!, status = root.querySelector<HTMLElement>("[data-home-status]")!;
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
  const holder = window.frameElement;
  const visible = () => root.isConnected && !document.hidden && !root.closest("[hidden]") && (!holder || holder.isConnected && !holder.closest("[hidden]"));
  const placement = createPositionPeek(groups, (body, signal) => host.read(body.click ? "/click" : "", body.click ?? body, signal), host,
    { source: () => ({}), expanded: () => false, visible, displayed: () => display ?? undefined, lookup: key => controls.get(key),
      navigate: async () => { /* Placement offers have no peek navigation. */ } });
  const lead = createHomeLead(root, host);
  const showLead = lead.show;
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
    if (release) { releaseText(display); display = null; controls.clear(); corrections.clear(); groups.replaceChildren(); showLead(null); }
  };
  const releaseText = (old: SurfaceHomeDisplay | null) => releaseHomeText(host, old);
  const unsafe = (error: unknown) => [401, 403, 404, 409].includes(Number((error as { status?: unknown })?.status));

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
      const editing = corrections.rendering(result);
      if (!before) {
        placement.close(false);
        const html = renderHome(result, controls, editing);
        reconcileSurfaceRows(groups, html, rowMarkup);
      }
      corrections.afterPaint();
      showLead(result);
      if (inspected?.read.state === "ok") offers.refresh();
      caption(receipt ? "open-failed" : undefined, receipt ? "open-result" : undefined);
    } catch (error) {
      if (request.signal.aborted || reading !== request || !visible()) return;
      if (unsafe(error)) { releaseText(display); display = null; controls.clear(); corrections.clear(); groups.replaceChildren(); closePeek(); placement.close(false); showLead(null); }
      caption("refresh-failed", "refresh");
    } finally { if (reading === request) reading = null; }
  }

  async function act(key: string, focus: HTMLElement) {
    if (!visible() || clicking) return;
    if (key === "refresh") {
      if (display) caption("refreshing");
      await sync();
      return;
    }
    if (key === "market") { host.market(); return; }
    if (key === "picker") { (host.picker ?? host.market)(); return; }
    if (key === "lead-toggle") { lead.toggle(display); return; }
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
        if (unsafe(error)) { releaseText(display); display = null; controls.clear(); corrections.clear(); groups.replaceChildren(); closePeek(); }
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

  const visibility = () => {
    const next = visible();
    if (next === shown) return;
    shown = next;
    if (shown && needsRead) void sync();
    else if (!shown) cancel(true);
  };
  watchHome(holder, visibility, () => { cancel(true); if (visible()) void sync(); }, () => { shown = false; cancel(true); });
  return { sync };
}
