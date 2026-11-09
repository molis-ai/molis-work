import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SurfaceHomeDisplay, SurfaceHomeRowDisplay } from "../surface-home-display.js";
import { homeButton, homeWord, renderHome, renderHomePeek, subjectKey, type HomeControl } from "./project-home-render.js";

interface HomeHost {
  read<Output>(suffix: string, body: unknown, signal: AbortSignal): Promise<Output>;
  order(): string[];
  navigationFrom(source: HTMLElement): (result: unknown) => boolean;
  market(): void;
  projectKey: string;
  translate(key: string): string;
  offerApi(path: string, method: string, body: unknown, signal: AbortSignal): Promise<unknown>;
  offers(input: { root: HTMLElement; current: () => { subject: SurfaceHomeRowDisplay["subject"] } | null;
    projectKey: string; api: (path: string, method: string, body: unknown) => Promise<unknown>;
    refresh: () => Promise<void>; translate: HomeHost["translate"] }): { refresh(): void; clear(): void };

}
type ClickResult = { kind: "stage" | "settings" } | { kind: "peek"; row: SurfaceHomeRowDisplay }
  | { kind: "invoked"; stage?: unknown; retry_open?: HomeControl["target"] } | { kind: "enabled" };

function reconcile(root: HTMLElement, html: string, rowMarkup: WeakMap<Element, string>) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("[data-home-row-peek] .mw-presentation__row-title").forEach(node => {
    node.setAttribute("aria-haspopup", "dialog");
    node.setAttribute("role", "button");
  });
  template.content.querySelectorAll("[data-home-row]").forEach(node => rowMarkup.set(node, node.outerHTML));
  const branch = "[data-home-group], .home-plugin-cards, .home-plugin-card__body, .home-rows";
  const key = (node: Element) => node.getAttribute("data-home-row") ?? node.getAttribute("data-home-group") ?? (node.matches(branch) ? node.className : null);
  function patch(parent: Element, incoming: HTMLCollection) {
    const current = new Map([...parent.children].map(node => [key(node), node]));
    let next = parent.firstElementChild;
    for (const candidate of [...incoming]) {
      const id = key(candidate);
      const old = id === null ? next : current.get(id);
      const row = candidate.hasAttribute("data-home-row");
      let node = candidate;
      if (row) {
        if (old && rowMarkup.get(old) === rowMarkup.get(candidate)) node = old;
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
}

function bindHomeControls(root: HTMLElement, peek: HTMLDialogElement, act: (key: string, focus: HTMLElement) => Promise<void>, closePeek: () => void, onClose: () => void) {
  root.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>("[data-home-control], [data-presentation-action]");
    if (button) {
      button.closest<HTMLDetailsElement>("details")?.removeAttribute("open");
      void act(button.dataset.homeControl ?? button.dataset.presentationAction ?? "", button);
    } else if (event.target.closest("[data-home-close]")) closePeek();
    else {
      const title = event.target.closest<HTMLElement>(".mw-presentation__row-title[aria-haspopup]");
      if (title) void act(title.closest<HTMLElement>("[data-home-row-peek]")!.dataset.homeRowPeek!, title);
    }
  });
  root.addEventListener("keydown", event => {
    if (!(event.target instanceof HTMLElement)) return;
    const key = event.target.closest<HTMLElement>("[data-home-row-peek]")?.dataset.homeRowPeek;
    if (key && event.target.matches(".mw-presentation__row-title[aria-haspopup]") && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault(); void act(key, event.target);
    }
    const menu = event.target.closest<HTMLDetailsElement>(".mw-presentation__more[open]");
    if (event.key === "Escape" && menu) { event.preventDefault(); menu.open = false; menu.querySelector<HTMLElement>("summary")?.focus(); }
  });
  peek.addEventListener("close", onClose);
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
  const caption = (word?: string, button?: string) => {
    status.innerHTML = (word ? "<p>" + escapeHtml(homeWord(word)) + "</p>" : "") + (button ? homeButton(button, homeWord(button === "refresh" ? "retry" : "open-result")) : "");
  };
  const closePeek = () => {
    offers.clear();
    peekControls.clear();
    inspecting?.abort(); inspecting = null; inspected = null;
    if (peek.open) peek.close();
  };
  const cancel = (release: boolean) => {
    reading?.abort(); reading = null; clicking?.abort(); clicking = null;
    closePeek(); needsRead = true;
    if (release) { display = null; controls.clear(); groups.replaceChildren(); }
  };
  const unsafe = (error: unknown) => [401, 403, 404, 409].includes(Number((error as { status?: unknown })?.status));

  async function sync(invalidate = false) {
    needsRead = true;
    if (!visible()) return;
    if (invalidate) cancel(true);
    reading?.abort();
    const request = reading = new AbortController();
    caption(display ? "refreshing" : "loading");
    try {
      const result = await host.read<SurfaceHomeDisplay>("", { home_order: host.order() }, request.signal);
      if (request.signal.aborted || reading !== request || !visible()) return;
      const oldFocus = document.activeElement instanceof HTMLElement && groups.contains(document.activeElement) ? document.activeElement : null;
      const before = display && JSON.stringify(display) === JSON.stringify(result);
      if (inspected) {
        const key = subjectKey(inspected.owner, inspected.subject);
        const previous = display?.display.rows.find(row => subjectKey(row.owner, row.subject) === key);
        const next = result.display.rows.find(row => subjectKey(row.owner, row.subject) === key);
        if (JSON.stringify(previous) !== JSON.stringify(next)) closePeek();
      }
      display = result; needsRead = false;
      if (!before) {
        const html = renderHome(result, controls);
        reconcile(groups, html, rowMarkup);
        if (oldFocus?.isConnected && document.activeElement === document.body) oldFocus.focus({ preventScroll: true });
      }
      if (inspected?.read.state === "ok") offers.refresh();
      caption(receipt ? "open-failed" : undefined, receipt ? "open-result" : undefined);
    } catch (error) {
      if (request.signal.aborted || reading !== request || !visible()) return;
      if (unsafe(error)) { display = null; controls.clear(); groups.replaceChildren(); closePeek(); }
      caption("refresh-failed", "refresh");
    } finally { if (reading === request) reading = null; }
  }

  async function act(key: string, focus: HTMLElement) {
    if (!visible() || clicking) return;
    if (key === "refresh") { await sync(); return; }
    if (key === "market") { host.market(); return; }
    const control = key === "open-result" ? receipt : controls.get(key) ?? peekControls.get(key);
    if (!control) return;
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
        if (unsafe(error)) { display = null; controls.clear(); groups.replaceChildren(); closePeek(); }
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
  });

  const visibility = () => {
    const next = visible();
    if (next === shown) return;
    shown = next;
    if (shown && needsRead) void sync();
    else if (!shown) cancel(true);
  };
  const observer = new MutationObserver(visibility);
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  if (holder) observer.observe(holder, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", visibility);
  document.addEventListener("molis-work:plugins-changed", () => { cancel(true); if (visible()) void sync(); });
  document.addEventListener("molis-work:place-changed", visibility);
  document.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("[data-dock-choice]")) queueMicrotask(() => { void sync(); });
  });
  window.addEventListener("pagehide", () => { shown = false; cancel(true); });
  window.addEventListener("pageshow", visibility);
  queueMicrotask(visibility);
  return { sync };
}
