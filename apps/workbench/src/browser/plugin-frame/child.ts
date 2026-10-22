import { createUiFailureView, createUiRequest } from "@molis-ai/molis-work-ui-host";
import type { UiPageActions } from "@molis-ai/molis-work-contracts/platform/ui";
import { childMessages } from "./messages.js";
import { pageFiles } from "./files.js";
import { childTerminal } from "./terminal.js";
import { pageDialogs } from "./dialogs.js";
import { childView, collapsePage, pageSelection } from "./view.js";
import { childDrafts } from "./drafts.js";
import { childNavigation } from "./navigation.js";
import { childCopy } from "./clipboard.js";
import { childNativeFiles } from "./native-files.js";
import { pageEventSource } from "./events.js";
import { createFrameFetch } from "./fetch.js";
import { childContext } from "./context-child.js";
import type { FrameConfig, FrameDown, FrameHost, FrameUp, Translate } from "./types.js";

function bindStorage(port: MessagePort, config: FrameConfig): void {
  for (const area of ["localStorage", "sessionStorage"] as const) {
    const values = new Map(Object.entries(config.storage[area]));
    const write = (key: string, value: string | null) => {
      if (value === null) values.delete(key); else values.set(key, value);
      port.postMessage({ type: "storage", area, key, value } satisfies FrameUp);
    };
    const store: Storage = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
      getItem: key => values.get(String(key)) ?? null, setItem: (key, value) => write(String(key), String(value)),
      removeItem: key => write(String(key), null), clear: () => { for (const key of values.keys()) write(key, null); } };
    Object.defineProperty(globalThis, area, { value: store });
  }
}

/** The opaque child receives public presentation data and one capability port, never owner credentials. */
export async function startChild(port: MessagePort, config: FrameConfig): Promise<void> {
  const send = (message: FrameUp) => port.postMessage(message), fetchThroughPort = createFrameFetch(port, config.origin);
  globalThis.fetch = fetchThroughPort;
  globalThis.MOLIS_WORK_MESSAGES = config.messages; globalThis.MOLIS_WORK_PLUGIN_TITLES = config.titles;
  const L: Translate = globalThis.L = (key, values) => {
    let text = config.messages[key] ?? key;
    for (const [name, value] of Object.entries(values || {})) text = text.split("{" + name + "}").join(String(value));
    return text;
  };
  bindStorage(port, config);
  const call = createUiRequest({ fetch: fetchThroughPort, origin: config.origin, token: () => "", newKey: () => crypto.randomUUID(), translate: L });
  const view = createUiFailureView({ createElement: tag => document.createElement(tag), translate: L,
    copy: text => copyText(text), setTimeout, clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>) });
  view.install(document);
  globalThis.molisWorkRequest = Object.assign(call, { text: view.text, show: view.show, toast: view.toast });
  globalThis.molisWorkControlHeaders = call.headers;
  const root = document.querySelector<HTMLElement>("[data-work-surface]") ?? document.body;
  root.hidden = false; document.body.dataset.projectId = config.projectId; document.body.dataset.routePrefix = config.routePrefix;
  const route = (path: string) => config.routePrefix + path;
  const ui = globalThis.molisFrameUi(L), scope = ui.mountPluginClient(document.body);
  if (!scope) throw new Error("Cannot mount plugin document");
  childContext(port, scope, root); ui.surfaceFocus({ translate: L, surfaceOnly: true });
  globalThis.EventSource = pageEventSource(scope, config.origin);
  const copyText = childCopy(port, scope);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: copyText } });
  Object.assign(globalThis, { molisWorkOpenExternalUrl: async (url: string) => send({ type: "link", url: new URL(url, config.origin).href, download: false }) });
  const terminal = globalThis.molisPageTerminal = childTerminal(port, scope, config.origin);
  const select = pageSelection(root, scope, config.searchRow);
  const intent = (name: Extract<FrameUp, { type: "ui" }>["name"], args: unknown[]) => send({ type: "ui", name, args });
  const host: FrameHost & UiPageActions & Record<string, unknown> = { root, scope, translate: L, mountPluginClient: ui.mountPluginClient, side: config.side,
    ...pageDialogs(scope, L), drafts: childDrafts(port, scope),
    view: childView(port, scope),
    ...pageFiles(port, scope, globalThis.molisWorkRequest, copyText),
    ...(config.nativeFiles ? { nativeFiles: childNativeFiles(port, scope) } : {}),
    terminal,
    messages: childMessages(port),
    invokeAction: (reference, input) => call(route("/api/host/plugin-page-actions"), { body: { reference, input }, scope }),
    projectId: () => config.projectId, projectTitle: () => config.projectTitle, route, headers: call.headers,
    api: (path: string, method: "GET" | "POST", body: unknown, fallback: string) => call(route(path), { method, body, fallback }),
    openItem: (...args) => intent("openItem", args), openBeside: (...args) => intent("openBeside", args), openPlugin: (...args) => intent("openPlugin", args),
    hideDirectory: () => intent("hideDirectory", []), showToast: (...args) => intent("showToast", args), page: () => config.page,
    status: status => intent("status", [status]), interaction: ui.interaction, receipts: ui.receipts,
  };
  scope.listen(document, "molis:side-open", event => {
    event.preventDefault();
    send({ type: "page-message", message: { ...(event as CustomEvent<Record<string, unknown>>).detail, type: "molis:side-open" } });
  });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    const message = event.data;
    if (message.type === "state") {
      const prior = document.documentElement.dataset.resolvedTerminalTheme;
      document.body.hidden = !message.visible; Object.assign(document.documentElement.dataset, message.theme);
      if (prior !== document.documentElement.dataset.resolvedTerminalTheme) window.dispatchEvent(new CustomEvent("molis-work:terminal-theme-change"));
    }
    else if (message.type === "focus") window.focus();
    else if (message.type === "select") select(message.detail);
    else if (message.type === "collapse") collapsePage(root);
    else if (message.type === "model-ready") document.dispatchEvent(new CustomEvent("molis-work:model-ready"));
    else if (message.type === "dispose") scope.dispose();
  });
  const context = () => send({ type: "context", value: root.getAttribute("data-assistant-context"), expanded: root.getAttribute("data-expanded") });
  scope.observe(new MutationObserver(context), root, { attributes: true, attributeFilter: ["data-assistant-context", "data-expanded"] });
  document.addEventListener("click", event => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link || event.defaultPrevented || event.button !== 0) return;
    const href = link.getAttribute("href"); if (!href || href.startsWith("#")) return;
    event.preventDefault(); send({ type: "link", url: new URL(href, config.origin).href, download: link.hasAttribute("download") });
  });
  const load = (url: string) => new Promise<void>((resolve, reject) => {
    const script = document.createElement("script"); script.src = new URL(url, config.origin).href;
    script.onload = () => resolve(); script.onerror = () => reject(new Error(L("无法加载界面，请重试"))); document.head.append(script);
  });
  for (const asset of config.assets) await load(asset);
  await load("/assets/molis-work-plugins/" + encodeURIComponent(config.bundle) + ".js");
  const factory = globalThis.molisWorkbenchPluginFactories?.[config.bundle];
  if (!factory) throw new Error(L("无法加载界面，请重试"));
  factory(host); childNavigation(port, scope, config); context(); send({ type: "ready" });
}
