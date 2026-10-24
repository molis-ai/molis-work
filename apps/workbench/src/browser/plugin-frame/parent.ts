import { collapsePage } from "./view.js";
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
import { pageFilePicker } from "./file-picker.js";
import { pageWorkspaces } from "./workspaces.js";
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
function openPlugin(host: FrameHost, surface: unknown, prefix: string): void {
  if (typeof surface !== "string" || !/^[a-z][a-z0-9-]{0,100}$/u.test(surface)) return;
  if (host.openPlugin && document.querySelector('[data-work-surface="' + CSS.escape(surface) + '"]')) host.openPlugin(surface);
  else location.assign(prefix + "/?openSurface=" + encodeURIComponent(surface));
}

/** The trusted shell binds a real frame, channel and server authorization; child-supplied identity never selects them. */
export async function mountFrame(root: HTMLElement, host: FrameHost, pack: FramePack) {
  const route = host.route ?? (path => path), scope = host.mountPluginClient(root);
  if (!scope) throw new Error("View is already mounted");
  try {
  const grant = pack.authorization ?? await molisWorkRequest<{ page_id: string; storage_scope: string }>(route("/api/host/plugin-pages"), { body: { plugin_id: pack.plugin_id }, scope });
  const surfaces = await subjectSurfaces(route, scope);
  scope.assertCurrent();
  root.dataset.pluginPage = grant.page_id;
  const storagePrefix = "molis-plugin-page:" + grant.storage_scope + ":", storage = stored(storagePrefix);
  const frame = document.createElement("iframe"), channel = new MessageChannel();
  frame.setAttribute("sandbox", "allow-scripts allow-forms"); frame.setAttribute("referrerpolicy", "no-referrer");
  frame.title = root.dataset.workSurfaceLabel ?? pack.id; frame.dataset.pluginFrame = pack.id;
  frame.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent";
  const port = channel.port1, requests = frameRequests(port, grant.page_id, scope);
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
  const visible = () => {
    for (let node: Element | null = root; node; node = node.ownerDocument.defaultView?.frameElement ?? null)
      if (!node.checkVisibility({ visibilityProperty: true })) return false;
    return scope.visible;
  };
  const state = () => port.postMessage({ type: "state", visible: visible(),
    theme: Object.fromEntries(["theme", "resolvedTheme", "density", "terminalTheme", "resolvedTerminalTheme"].map(key => [key, document.documentElement.dataset[key] ?? ""])) });
  scope.observe(new MutationObserver(state), document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-resolved-theme", "data-density", "data-terminal-theme", "data-resolved-terminal-theme"] });
  scope.observe(new MutationObserver(state), document.body, { subtree: true, attributes: true, attributeFilter: ["data-exclusive"] });
  scope.whenVisible(() => { state(); navigation.focus(); return state; });
  const fail = (error: Error) => { clearTimeout(deadline); readyReject(error); };
  const pickFile = pageFilePicker(port, scope, frame, grant.page_id, route, host.translate);
  port.onmessage = (event: MessageEvent<FrameUp>) => {
    const message = event.data;
    if (!scope.alive || !message || typeof message.type !== "string") return;
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
    if (message.type === "draft") { void drafts(message); return; }
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
    if (message.type === "read-document") { void readPageDocument(port, message.id, root, route, pack, grant.page_id, scope); return; }
    if (message.type === "copy") { void copyFromPage(port, message); return; }
    try {
      if (message.type === "page-message") receiveMessage(message.message);
      else if (message.type === "download" && message.bytes instanceof ArrayBuffer && typeof message.filename === "string" && typeof message.mime === "string") downloadPageBlob(new Blob([message.bytes], { type: message.mime }), message.filename, scope);
      else if (message.type === "print" && typeof message.html === "string") printPageDocument(message.html, scope);
      else if (message.type === "ready") { clearTimeout(deadline); root.dataset.uiClientState = "ready"; root.removeAttribute("data-deferred-surface"); state(); navigation.focus(); readyResolve(); }
      else if (message.type === "failed") fail(new Error(message.message));
      else if (message.type === "ui" && Array.isArray(message.args)) {
        if (message.name === "showToast" && typeof message.args[0] === "string") host.showToast?.(message.args[0], message.args[1] === true);
        else if (message.name === "openPlugin") openPlugin(host, message.args[0], route(""));
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
        if (message.value === null) window[message.area].removeItem(storagePrefix + message.key);
        else if (typeof message.value === "string" && message.value.length <= 1024 * 1024) window[message.area].setItem(storagePrefix + message.key, message.value);
      }
    } catch (error) { host.showToast?.(error instanceof Error ? error.message : String(error), true); }
  };
  scope.listen(root, "molis-work:select-item", event => { port.postMessage({ type: "select", detail: (event as CustomEvent).detail }); });
  scope.observe(new MutationObserver(() => {
    if (root.dataset.expanded === "false" && childExpanded !== "false") port.postMessage({ type: "collapse" });
  }), root, { attributes: true, attributeFilter: ["data-expanded"] });
  scope.listen(document, "molis-work:model-ready", () => { state(); port.postMessage({ type: "model-ready" }); });
  let loaded = false;
  frame.onload = () => {
    if (loaded) { fail(new Error("Plugin page navigated")); scope.dispose(); return; }
    loaded = true;
    const config: FrameConfig = { subjectSurfaces: surfaces, origin: location.origin, pluginId: pack.plugin_id, bundle: pack.bundle, assets: pack.assets, searchRow: pack.searchRow, recordRow: pack.recordRow, surface: pack.id,
      stage: { title: getComputedStyle(root).getPropertyValue("--stage-title") || JSON.stringify(host.translate(root.dataset.workSurfaceLabel ?? pack.id)), description: getComputedStyle(root).getPropertyValue("--stage-desc") },
      nativeFiles: Boolean(nativeFileInvoke()), shortcuts: navigation.shortcuts,
      projectId: host.projectId?.() ?? "", projectTitle: host.projectTitle?.() ?? "", routePrefix: route(""), side: Boolean(host.side), page: host.page?.() ?? null,
      messages: globalThis.MOLIS_WORK_MESSAGES ?? {}, titles: globalThis.MOLIS_WORK_PLUGIN_TITLES ?? {}, storage };
    frame.contentWindow?.postMessage({ type: "molis:plugin-connect", config }, "*", [channel.port2]);
  };
  frame.srcdoc = frameDocument(root, pack); root.append(frame);
  await ready; return { frame, scope };
  } catch (error) { scope.dispose(); throw error; }
}
