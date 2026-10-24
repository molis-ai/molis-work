import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { childPlacement } from "./placement.js";
import { childReviews } from "./review-slots.js";
import { createUiFailureView, createUiRequest } from "@molis-ai/molis-work-ui-host";
import type { SearchReferencesResponse } from "@molis-ai/molis-work-contracts/services/search";
import type { UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";
import { childMessages } from "./messages.js";
import { pageFiles } from "./files.js";
import { childTerminal } from "./terminal.js";
import { pageConfirmBox } from "./confirm-box.js";
import { pageDialogs } from "./dialogs.js";
import { childView, collapsePage, pageSelection } from "./view.js";
import { childDrafts } from "./drafts.js";
import { childNavigation } from "./navigation.js";
import { childTodo } from "./todo.js";
import { childWorkspaces } from "./workspaces.js";
import { childModal } from "./modal.js";
import { childPresentation } from "./presentation.js";
import { childCopy } from "./clipboard.js";
import { childNativeFiles } from "./native-files.js";
import { pageEventSource } from "./events.js";
import { createFrameFetch } from "./fetch.js";
import { childContext } from "./context-child.js";
import type { FrameConfig, FrameDown, FrameUp, Translate } from "./types.js";

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
    return globalThis.molisFrameFillMessage(config.messages[key] ?? key, values);
  };
  bindStorage(port, config);
  const call = createUiRequest({ fetch: fetchThroughPort, origin: config.origin, token: () => "", newKey: () => crypto.randomUUID(), translate: L });
  const view = createUiFailureView({ createElement: tag => document.createElement(tag), translate: L,
    copy: text => copyText(text), setTimeout, clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>) });
  view.install(document);
  globalThis.molisWorkRequest = Object.assign(call, { text: view.text, show: view.show, toast: view.toast });
  globalThis.molisWorkControlHeaders = call.headers;
  const root = document.querySelector<HTMLElement>("[data-work-surface]") ?? document.body;
  root.style.setProperty("--stage-title", config.stage.title); root.style.setProperty("--stage-desc", config.stage.description);
  root.hidden = false; document.body.toggleAttribute("data-todo-available", config.todoAvailable); document.body.dataset.projectId = config.projectId; document.body.dataset.routePrefix = config.routePrefix;
  const route = (path: string) => config.routePrefix + path;
  const ui = globalThis.molisFrameUi(L), scope = ui.mountPluginClient(document.body);
  if (!scope) throw new Error("Cannot mount plugin document");
  childTodo(port, scope, L);
  childContext(port, scope, root); ui.surfaceFocus({ translate: L, surfaceOnly: true });
  globalThis.EventSource = pageEventSource(scope, config.origin);
  const copyText = childCopy(port, scope);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: copyText } });
  Object.assign(globalThis, { molisWorkOpenExternalUrl: async (url: string) => send({ type: "link", url: new URL(url, config.origin).href, download: false }) });
  const terminal = globalThis.molisPageTerminal = childTerminal(port, scope, config.origin);
  const select = pageSelection(root, scope, config.searchRow);
  const intent = (name: Extract<FrameUp, { type: "ui" }>["name"], args: unknown[]) => send({ type: "ui", name, args });
  const host = { root, scope, translate: L, mountPluginClient: ui.mountPluginClient, side: config.side,
    ...pageDialogs(scope, L), confirmBox: pageConfirmBox(scope, L), drafts: childDrafts(port, scope),
    reviews: childReviews(port, scope), view: childView(port, scope), workspaces: childWorkspaces(port, scope),
    ...pageFiles(port, scope, globalThis.molisWorkRequest, copyText),
    ...(config.nativeFiles ? { nativeFiles: childNativeFiles(port, scope) } : {}),
    terminal,
    messages: childMessages(port),
    invokeAction: <Output = unknown>(reference: ActionReference, input: unknown) => call<Output>(route("/api/host/plugin-page-actions"), { body: { reference, input }, scope }),
    pluginId: config.pluginId, pluginRoute: (path: string) => route("/api/plugins/" + config.pluginId + path),
    projectId: () => config.projectId, projectTitle: () => config.projectTitle, route, headers: call.headers,
    // What a page says when the Host's router refused its read for who-may-read reasons (403 `actions.*`); empty for any other failure.
    readRefusal: (status: number, code: unknown) => status === 403 && String(code).startsWith("actions.") ? L(code === "actions.plugin_disabled" ? "这个项目停用了这个插件，所以显示不了。到插件市场重新添加后就能打开。" : "没有权限读取这里的内容，所以显示不了。授权在设置里管理。") : "",
    api: (path: string, method: "GET" | "POST", body: unknown, fallback = L("来源操作失败")) => call(route(path), { method, body, fallback }),
    openItem: (...args: unknown[]) => intent("openItem", args), openBeside: (...args: unknown[]) => intent("openBeside", args), openPlugin: (...args: unknown[]) => intent("openPlugin", args),
    hideDirectory: () => intent("hideDirectory", []), showToast: (...args: unknown[]) => intent("showToast", args), page: () => config.page,
    status: (status: unknown) => intent("status", [status]), interaction: (element: HTMLElement, options: { onSubmit?: () => void }) => ui.interaction(element, {
      references: (source: string, query: string) => call<SearchReferencesResponse>(route("/api/host/plugin-page-actions"), {
        body: { reference: { capability_id: "search.references", version: 1 }, input: { kinds: source.split(","), query, limit: 8 } }, scope,
      }).then(found => ({ items: found.candidates.map(item => ({ value: item.kind + " " + item.id, label: item.label, meta: item.plugin_title })) })),
      ...options,
    }), receipts: ui.receipts,
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
      if (prior !== document.documentElement.dataset.resolvedTerminalTheme) dispatchEvent(new CustomEvent("molis-work:terminal-theme-change"));
    }
    else if (message.type === "focus") scope.frame(() => { if (scope.visible) dispatchEvent(new Event("focus")); });
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
  childPresentation(port, scope); childModal(port, scope); factory(host satisfies UiPluginClientHost<HTMLElement, HTMLDialogElement, HTMLImageElement | HTMLIFrameElement>); childPlacement(port, scope); childNavigation(port, scope, config); context(); send({ type: "ready" });
}
