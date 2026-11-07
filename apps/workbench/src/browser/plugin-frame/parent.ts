import { collapsePage } from "./view.js";
import { accountTransition } from "../account-transition.js";
import { pagePlacement } from "./placement.js";
import { pageReviews } from "./reviews.js";
import { pageEmbeds } from "./embed.js";
import { downloadFrameFile, downloadPageBlob } from "./links.js";
import { printPageDocument } from "./files.js";
import { pageMessages } from "./messages.js";
import { frameRequests } from "./fetch.js";
import { frameDocument } from "./document.js";
import { frameTerminal } from "./terminal.js";
import { handoffPageFiles, nativeFileInvoke } from "./native-files.js";
import { readPageDocument } from "./view.js";
import { copyFromPage } from "./clipboard.js";
import { frameContext } from "./context.js";
import { pageDrafts } from "./drafts.js";
import { pageNavigation } from "./navigation.js";
import { pageIntake } from "./intake.js";
import { subjectSurfaces } from "./subjects.js";
import { pageModal } from "./modal.js";
import { pagePresentation } from "./presentation.js";
import { pageConnectionSlot } from "./connection-slot.js";
import { pageFilePicker } from "./file-picker.js";
import { pageWorkspaces } from "./workspaces.js";
import { pageFrameAssets } from "./frame-assets.js";
import type { FrameConfig, FrameHost, FramePack, FrameUp } from "./types.js";

function stored(prefix: string): FrameConfig["storage"] {
  const storage: FrameConfig["storage"] = { localStorage: {}, sessionStorage: {} };
  for (const area of ["localStorage", "sessionStorage"] as const) {
    try {
      for (let index = 0; index < window[area].length; index++) {
        const key = window[area].key(index);
        if (key?.startsWith(prefix)) storage[area][key.slice(prefix.length)] = window[area].getItem(key) ?? "";
      }
    } catch { /* Storage can be unavailable; the view itself still opens. */ }
  }
  return storage;
}

/** An isolated directory has no in-flow owner content to give its Host column height. */
function directoryLayout(root: HTMLElement): void {
  if (root.dataset.pluginSlot !== "workbench.directory" || document.querySelector("style[data-plugin-directory-layout]")) return;
  const style = document.createElement("style"); style.dataset.pluginDirectoryLayout = "";
  style.textContent = '.plugin-section:has(>.plugin-section-body>[data-plugin-slot="workbench.directory"]:not([hidden])),.plugin-section-body:has(>[data-plugin-slot="workbench.directory"]:not([hidden])){flex:1;min-height:0}';
  document.head.append(style);
}

/**
 * A page never navigates a document. A settings address opens the workbench's settings in place, in the shell page that
 * owns them: a frame in the shell asks this document, an embedded shell asks the one it is embedded in, and a pane hands
 * the address to the pane's one relay to the workbench it sits in. Any other address changes nothing.
 */
function openSettings(url: URL): void {
  const pane = new URLSearchParams(location.search).get("workbenchPane");
  if (window.parent !== window && pane !== null) {
    window.parent.postMessage({ type: "workbench-open-settings", paneId: pane, href: url.href }, location.origin);
    return;
  }
  let owner = document;
  try { if (window.top && window.top !== window) owner = window.top.document; } catch { /* A cross-origin embedder keeps its own documents. */ }
  owner.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: url.href } }));
}

function navigate(root: HTMLElement, message: Extract<FrameUp, { type: "link" }>, prefix: string): void {
  const url = new URL(message.url);
  const objectLink = url.pathname === prefix + "/" && /^[a-z][a-z0-9-]{0,100}$/u.test(url.searchParams.get("openPlugin") ?? "")
    && [...url.searchParams.keys()].every(key => ["openPlugin", "openItem", "openTitle", "openVersion"].includes(key));
  if (url.origin !== location.origin) {
    if (["https:", "http:", "mailto:"].includes(url.protocol)) window.open(url.href, "_blank", "noopener,noreferrer");
    return;
  }
  if (!objectLink) { openSettings(url); return; }
  const link = document.createElement("a"); link.href = url.pathname + url.search; link.hidden = true; root.append(link); link.click(); link.remove();
}

/** An installed surface may have appeared since this shell loaded. The server rebuilds the current project's catalog. */
function openPlugin(host: FrameHost, surface: unknown, prefix: string, view?: unknown, panel?: unknown): void {
  if (typeof surface !== "string" || !/^[a-z][a-z0-9-]{0,100}$/u.test(surface)) return;
  if (host.openPlugin && document.querySelector('[data-work-surface="' + CSS.escape(surface) + '"]')) host.openPlugin(surface, typeof view === "string" && view.length <= 1000 ? view : undefined, typeof panel === "string" && panel.length <= 100 ? panel : undefined);
  else location.assign(prefix + "/?openSurface=" + encodeURIComponent(surface));
}

/** The current item belongs to this surface's own pane, including a pane with its own local strip. */
function ownItemTab(root: HTMLElement, pack: FramePack): FrameConfig["itemTab"] {
  const pane = root.closest<HTMLElement>("[data-tab-pane]");
  if (!root.isConnected || !pane) return null;
  const chrome = root.ownerDocument.querySelector<HTMLElement>("[data-titlebar-tabs]");
  const strip = chrome?.checkVisibility({ visibilityProperty: true }) && chrome.dataset.chromePane === pane.dataset.tabPane
    ? chrome : pane.querySelector<HTMLElement>("[data-tab-strip]");
  const tab = strip?.querySelector<HTMLElement>('[data-tab-id][aria-current="page"]');
  return tab?.dataset.tabKind === "item" && tab.dataset.plugin === pack.id && tab.dataset.tabId && tab.dataset.itemId
    ? { tabId: tab.dataset.tabId, itemId: tab.dataset.itemId } : null;
}

/** The trusted shell binds a real frame, channel and server authorization; child-supplied identity never selects them. */
export async function mountFrame(root: HTMLElement, host: FrameHost, pack: FramePack) {
  if (accountTransition().preparing) throw new Error("Account is switching");
  const route = host.route ?? (path => path), scope = host.mountPluginClient(root);
  if (!scope) throw new Error("View is already mounted");
  // The owner's deferred client already wrote the same guard before it called this; only the raw mounts own it.
  let own = false;
  try {
  const mount = root.dataset.pluginContribution && root.dataset.pluginSurface && root.dataset.pluginSlot
    ? { contribution_id: root.dataset.pluginContribution, surface: root.dataset.pluginSurface, target_slot_id: root.dataset.pluginSlot } : null;
  if (mount && root.dataset.pluginOwner !== pack.plugin_id) throw new Error("View owner changed");
  directoryLayout(root);
  const grant = pack.authorization ?? await molisWorkRequest<{ page_id: string; storage_scope: string }>(route("/api/host/plugin-pages"), { body: { plugin_id: pack.plugin_id, ...(mount ? { mount, ...(root.dataset.pluginProducer ? { producer: root.dataset.pluginProducer } : {}) } : {}) }, scope });
  const surfaces = await subjectSurfaces(route, scope);
  scope.assertCurrent();
  if (accountTransition().preparing) throw new Error("Account is switching");
  root.dataset.pluginPage = grant.page_id;
  const storagePrefix = "molis-plugin-page:" + grant.storage_scope + ":", storage = stored(storagePrefix);
  const frame = document.createElement("iframe"), channel = new MessageChannel();
  frame.setAttribute("sandbox", "allow-scripts allow-forms"); frame.setAttribute("referrerpolicy", "no-referrer");
  frame.title = root.dataset.workSurfaceLabel ?? pack.id; frame.dataset.pluginFrame = mount?.target_slot_id === "workbench.directory" ? pack.id + ":" + mount.surface : root.dataset.workSurface || pack.id;
  frame.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;padding:0;background:transparent";
  const transition = accountTransition();
  const businessScope = new Proxy(scope, {get(target, key) {
    if (key === "assertCurrent") return () => { target.assertCurrent(); if (transition.preparing) throw new Error("Account is switching"); };
    return Reflect.get(target, key);
  }});
  const port = channel.port1, requests = frameRequests(port, grant.page_id, businessScope);
  let flushSequence = 0;
  let draftsPrepared = false;
  const draftWork = new Set<Promise<void>>();
  const flushes = new Map<number, {resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>}>();
  const flush = () => new Promise<void>((resolve, reject) => {
    scope.assertCurrent(); draftsPrepared = false; const id = ++flushSequence;
    const timer = setTimeout(() => { flushes.delete(id); reject(new Error(host.translate("草稿保存未完成，请返回原页面重试"))); }, 10000);
    flushes.set(id, {resolve, reject, timer}); port.postMessage({type: "draft-flush", id});
  });
  scope.own(transition.page(root, flush, () => scope.dispose(), () => { draftsPrepared = false; port.postMessage({type: "draft-resume"}); }));
  scope.own(() => { for (const pending of flushes.values()) { clearTimeout(pending.timer); pending.reject(new Error("View closed")); } flushes.clear(); });
  const documentReads = new Map<number, AbortController>();
  const cancelDocuments = () => { for (const controller of documentReads.values()) controller.abort(); documentReads.clear(); };
  scope.own(cancelDocuments);
  const terminal = frameTerminal(port, scope, grant.page_id);
  const contextMessage = frameContext(port, scope, root, frame, pack.plugin_id, grant.page_id);
  const drafts = pageDrafts(port, scope, storagePrefix), navigation = pageNavigation(scope, port, Boolean(host.side));
  const receiveMessage = pageMessages(port, scope, pack.plugin_id, Boolean(host.side));
  const makeIntake = pageIntake(scope, frame, root);
  const placement = pagePlacement(port, scope, root, frame);
  const presentation = pagePresentation(scope, frame, root, pack, grant.page_id);
  const modal = pageModal(scope, frame);
  const reviews = pageReviews(port, scope, root, frame, grant.page_id, route, host);
  const embed = pageEmbeds(port, scope, root, frame, grant.page_id, route);
  const workspaces = pageWorkspaces(port, scope, grant.page_id, route, host.translate, frame.title, host.projectTitle?.() ?? "");
  let childExpanded: string | null = null;
  let closing: Extract<FrameUp, {type: "on-closing"}>["action"] = null;
  let readyResolve!: () => void, readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const deadline = setTimeout(() => readyReject(new Error(host.translate("无法加载界面，请重试"))), 10000);
  scope.own(() => {
    if (closing) collapsePage(root);
    clearTimeout(deadline); readyReject(new Error("View closed")); port.postMessage({ type: "dispose" }); port.close(); frame.remove();
    void molisWorkRequest(route("/api/host/plugin-pages/" + encodeURIComponent(grant.page_id)), { method: "DELETE", body: closing ? { closing } : {}, keepalive: true }).catch(() => { /* Host shutdown already revokes the activation. */ });
  });
  let invalidated = false;
  const visible = () => {
    if (frame.hidden) return false;
    for (let node: Element | null = root; node; node = node.ownerDocument.defaultView?.frameElement ?? null)
      if (!node.checkVisibility({ visibilityProperty: true })) return false;
    return scope.visible;
  };
  const state = () => { if (visible() && invalidated) { invalidated = false; port.postMessage({ type: "select", detail: { invalidate: true }, itemTab: ownItemTab(root, pack) }); } port.postMessage({ type: "state", visible: visible(),
    theme: Object.fromEntries(["theme", "resolvedTheme", "density", "terminalTheme", "resolvedTerminalTheme"].map(key => [key, document.documentElement.dataset[key] ?? ""])) }); };
  scope.observe(new MutationObserver(state), document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-resolved-theme", "data-density", "data-terminal-theme", "data-resolved-terminal-theme"] });
  scope.observe(new MutationObserver(state), document.body, { subtree: true, attributes: true, attributeFilter: ["data-exclusive"] });
  scope.observe(new MutationObserver(state), frame, { attributes: true, attributeFilter: ["hidden"] });
  scope.whenVisible(() => { state(); navigation.focus(); return state; });
  // Structured surfaces follow the Runtime's existing display revision; each read is cancelled on hiding.
  let revision: string | undefined;
  if (mount) scope.whenVisible(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const value = await molisWorkRequest<{ revision: string }>(route("/api/plugins/" + pack.plugin_id + "/view-revision"), { scope, signal: controller.signal, headers: { "x-molis-plugin-page": grant.page_id } });
        scope.assertCurrent(); if (controller.signal.aborted) return;
        if (revision !== undefined && revision !== value.revision) port.postMessage({ type: "select", detail: { invalidate: true }, itemTab: ownItemTab(root, pack) });
        revision = value.revision;
      } catch { /* A hidden or withdrawn page cannot publish a display update. */ }
      if (!controller.signal.aborted && scope.alive) timer = setTimeout(() => void read(), 1500);
    };
    void read(); return () => { controller.abort(); clearTimeout(timer); };
  });
  const fail = (error: Error) => {
    clearTimeout(deadline);
    if (own) { root.inert = false; root.removeAttribute("aria-busy"); root.dataset.uiClientState = "failed"; }
    readyReject(error);
  };
  const connectionSlot = pageConnectionSlot(port, scope, frame, root, grant.page_id, route, host.translate);
  const pickFile = pageFilePicker(port, scope, frame, grant.page_id, route, host.translate);
  port.onmessage = (event: MessageEvent<FrameUp>) => {
    const message = event.data;
    if (!scope.alive || !message || typeof message.type !== "string") return;
    if (message.type === "draft-flushed") {
      const pending = flushes.get(message.id); if (!pending) return;
      flushes.delete(message.id); clearTimeout(pending.timer);
      draftsPrepared = true;
      if (message.error) pending.reject(new Error(host.translate("草稿保存未完成，请返回原页面重试")));
      else void Promise.all([...draftWork]).then(() => pending.resolve(), error => pending.reject(error));
      return;
    }
    // Preserve the last already-submitted unsaved declaration before the child's FIFO flush acknowledgement.
    if (transition.preparing && !draftsPrepared && message.type === "context-report") { void contextMessage(message); return; }
    if (transition.preparing && !["draft", "storage", "fetch", "abort", "pull"].includes(message.type)) return;
    if (message.type === "document-cancel") { documentReads.get(message.id)?.abort(); documentReads.delete(message.id); return; }
    if (message.type === "frame-asset-layout") { assetLayout(message); return; }
    if (message.type === "connection-slot-cancel") { connectionSlot.cancel(message.id); return; }
    if (message.type === "connection-slot") { void connectionSlot(message); return; }
    if (message.type === "view-invalidate") { if (scope.visible) host.invalidateView?.(root); return; }
    if (message.type === "view-open") {
      const value = message.selection;
      if (scope.visible && value && typeof value.surface === "string" && value.surface.length < 200
        && (value.id === undefined || typeof value.id === "string" && value.id.length <= 1000)
        && (value.panel === undefined || typeof value.panel === "string" && value.panel.length <= 100)
        && (value.intent === undefined || value.intent === "open" || value.intent === "select")) host.openView?.(root, value);
      return;
    }
    if (message.type === "on-closing") {
      try { if (message.action === null || message.action && typeof message.action === "object" && JSON.stringify(message.action).length <= 16000) closing = message.action; }
      catch { /* A cyclic registration is not a closing action. */ }
      return;
    }
    if (message.type === "placement-slots" || message.type === "placement-open") { placement(message); return; }
    if (message.type === "review-show" || message.type === "review-layout" || message.type === "review-close") { void reviews(message); return; }
    if (message.type === "open-behind") { if (scope.visible && typeof message.itemId === "string" && message.itemId.length <= 1000 && typeof message.title === "string") host.openBehind?.(pack.id, message.itemId, message.title.slice(0, 1000)); return; }
    if (message.type === "workspace") { void workspaces(message); return; }
    if (message.type === "embed-open" || message.type === "embed-layout" || message.type === "embed-close") { void embed(message); return; }
    if (message.type === "fetch" || message.type === "abort" || message.type === "pull") { void requests(message); return; }
    if (message.type === "draft") {
      if (transition.preparing && draftsPrepared) { port.postMessage({type: "draft-result", id: message.id, error: "Account is switching"}); return; }
      const work = drafts(message); draftWork.add(work);
      void work.then(() => draftWork.delete(work), () => draftWork.delete(work)); return;
    }
    if (message.type === "context-intake") { makeIntake(message); return; }
    if (message.type === "presentation") { presentation(message); return; }
    if (message.type === "modal") { modal(message.open); return; }
    if (message.type === "interaction") { if (scope.visible) window.dispatchEvent(new CustomEvent("molis:surface-interaction")); return; }
    if (message.type === "shortcut" || message.type === "close-side") { navigation.receive(message); return; }
    if (message.type === "terminal") { void terminal(message); return; }
    if (message.type === "context-key" || message.type === "context-report" || message.type === "context-taken" || message.type === "context-call" || message.type === "context-unreadable") { void contextMessage(message); return; }
    if (message.type === "native-files") { void handoffPageFiles(port, scope, grant.page_id, route, message); return; }
    if (message.type === "native-file-pick") { void pickFile(message); return; }
    if (message.type === "refresh-shell") { location.reload(); return; }
    if (message.type === "read-document") {
      if (!Number.isSafeInteger(message.id) || message.id <= 0 || documentReads.has(message.id)) return;
      const controller = new AbortController(); documentReads.set(message.id, controller);
      void readPageDocument(port, message.id, root, route, pack, grant.page_id, scope, message.object, controller.signal)
        .finally(() => { if (documentReads.get(message.id) === controller) documentReads.delete(message.id); });
      return;
    }
    if (message.type === "copy") { void copyFromPage(port, message); return; }
    try {
      if (message.type === "page-message") receiveMessage(message.message);
      else if (message.type === "download" && message.bytes instanceof ArrayBuffer && typeof message.filename === "string" && typeof message.mime === "string") downloadPageBlob(new Blob([message.bytes], { type: message.mime }), message.filename, scope);
      else if (message.type === "print" && typeof message.html === "string") printPageDocument(message.html, scope);
      else if (message.type === "ready") {
        clearTimeout(deadline);
        if (own) { root.inert = false; root.removeAttribute("aria-busy"); root.dataset.uiClientState = "ready"; }
        root.removeAttribute("data-deferred-surface"); state(); navigation.focus(); readyResolve();
      }
      else if (message.type === "failed") fail(new Error(message.message));
      else if (message.type === "ui" && Array.isArray(message.args)) {
        if (message.name === "showToast" && typeof message.args[0] === "string") host.showToast?.(message.args[0], message.args[1] === true);
        else if (message.name === "openPlugin") openPlugin(host, message.args[0], route(""), message.args[1], message.args[2]);
        else if (message.name === "openItem" && message.itemTabId !== undefined) {
          if (!root.isConnected || !visible() || typeof message.itemTabId !== "string" || ownItemTab(root, pack)?.tabId !== message.itemTabId) return;
          const [, id, title] = message.args;
          if (typeof id !== "string" || !id || id.length > 1000 || typeof title !== "string") return;
          host.openItem?.(pack.id, id, title.slice(0, 1000));
        }
        else if (["openItem", "openBeside", "hideDirectory", "status"].includes(message.name)) host[message.name as "openItem"]?.(...message.args);
      } else if (message.type === "link") {
        if (message.download) void downloadFrameFile(new URL(message.url), grant.page_id, scope).catch(error => host.showToast?.(String(error.message), true));
        else navigate(root, message, route(""));
      }
      else if (message.type === "context") {
        if (typeof message.value === "string" && message.value.length < 32000) {
          const value = JSON.parse(message.value) as Record<string, unknown>; value.plugin_id = pack.plugin_id; root.setAttribute("data-assistant-context", JSON.stringify(value));
        } else root.removeAttribute("data-assistant-context");
        if (message.expanded === "true" || message.expanded === "false") { childExpanded = message.expanded; root.setAttribute("data-expanded", message.expanded); }
      } else if (message.type === "storage" && ["localStorage", "sessionStorage"].includes(message.area) && typeof message.key === "string" && message.key.length < 512) {
        if (transition.preparing && draftsPrepared) return;
        if (message.value === null) window[message.area].removeItem(storagePrefix + message.key);
        else if (typeof message.value === "string" && message.value.length <= 1024 * 1024) window[message.area].setItem(storagePrefix + message.key, message.value);
      }
    } catch (error) { host.showToast?.(error instanceof Error ? error.message : String(error), true); }
  };
  scope.listen(root, "molis-work:select-item", event => { const detail = (event as CustomEvent).detail; if (detail?.invalidate && !visible()) { invalidated = true; return; } port.postMessage({ type: "select", detail, itemTab: ownItemTab(root, pack) }); });
  scope.observe(new MutationObserver(() => {
    if (root.dataset.expanded === "false" && childExpanded !== "false") port.postMessage({ type: "collapse" });
  }), root, { attributes: true, attributeFilter: ["data-expanded"] });
  scope.listen(document, "molis-work:model-ready", () => { state(); port.postMessage({ type: "model-ready" }); });
  let loaded = false;
  frame.onload = () => {
    if (loaded) { fail(new Error("Plugin page navigated")); scope.dispose(); return; }
    loaded = true;
    const config: FrameConfig = { mount, subjectSurfaces: surfaces, search: location.search, origin: location.origin, pluginId: pack.plugin_id, bundle: pack.bundle, assets: pack.assets, searchRow: pack.searchRow, recordRow: pack.recordRow, itemTab: ownItemTab(root, pack), surface: pack.id,
      stage: { title: getComputedStyle(root).getPropertyValue("--stage-title") || JSON.stringify(host.translate(root.dataset.workSurfaceLabel ?? pack.id)), description: getComputedStyle(root).getPropertyValue("--stage-desc") },
      nativeFiles: Boolean(nativeFileInvoke()), shortcuts: navigation.shortcuts,
      projectId: host.projectId?.() ?? "", projectTitle: host.projectTitle?.() ?? "", routePrefix: route(""), side: Boolean(host.side), page: host.page?.() ?? null,
      messages: { ...globalThis.MOLIS_WORK_PLUGIN_WORDS?.[pack.plugin_id], ...globalThis.MOLIS_WORK_MESSAGES }, titles: globalThis.MOLIS_WORK_PLUGIN_TITLES ?? {}, storage };
    frame.contentWindow?.postMessage({ type: "molis:plugin-connect", config }, "*", [channel.port2]);
  };
  frame.srcdoc = frameDocument(root, pack);
  own = root.dataset.uiClientState !== "loading";
  if (own) { root.inert = true; root.setAttribute("aria-busy", "true"); root.dataset.uiClientState = "loading"; }
  frame.hidden = Boolean(root.dataset.previewTab);
  root.append(frame);
  const assetLayout = pageFrameAssets(port, scope, root, frame);
  await ready; return { frame, scope };
  } catch (error) {
    if (own) { root.inert = false; root.removeAttribute("aria-busy"); root.dataset.uiClientState = "failed"; }
    scope.dispose(); throw error;
  }
}
