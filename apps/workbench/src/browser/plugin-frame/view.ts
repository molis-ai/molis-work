import { childEmbeds } from "./embed.js";
import { childSurfaceSlots } from "./surface-slot-child.js";
import type { UiPageView } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameDown, FramePack, FrameScope, FrameUp } from "./types.js";
import { renderedFrameText } from "./document.js";
import { frameDocumentRevision } from "./language.js";

/** Existing row-based clients and clients that open directly by id share the shell's selection intent. */
export function pageSelection(root: HTMLElement, scope: FrameScope, row: FramePack["searchRow"]) {
  let stop = () => {};
  scope.own(() => stop());
  return (detail: unknown) => {
    const selection = detail && typeof detail === "object" ? detail : null;
    const itemId = selection && "itemId" in selection ? selection.itemId : undefined;
    const invalidation = selection && "invalidate" in selection && selection.invalidate === true && itemId === undefined;
    if (!invalidation) stop();
    root.dispatchEvent(new CustomEvent("molis-work:select-item", { detail }));
    if (!row || typeof itemId !== "string" || !itemId) return;
    const observer = new MutationObserver(check), deadline = setTimeout(() => stop(), 10000);
    stop = () => { observer.disconnect(); clearTimeout(deadline); };
    function check() {
      if (!scope.alive) { stop(); return; }
      try {
        if (JSON.parse(root.getAttribute("data-assistant-context") || "{}").object?.id === itemId) { stop(); return; }
      } catch { /* Only a valid object identity marks the requested record open. */ }
      const element = [...root.querySelectorAll<HTMLElement>(row!.selector)].find(element => element.dataset[row!.idDataset] === itemId);
      if (element) { stop(); element.click(); }
    }
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-assistant-context"] });
    queueMicrotask(check);
  };
}

/** The shell's return-to-list intent applies inside the isolated document as it does to Host surfaces. */
export function collapsePage(root: HTMLElement): void {
  if (root.dataset.expanded === "false") return;
  root.dataset.expanded = "false";
  const workspace = root.querySelector<HTMLElement>(".plugin-stage-workspace, [data-artifact-stage-workspace], [data-schedule-stage-workspace]");
  if (workspace) workspace.hidden = true;
  root.querySelectorAll(".is-selected").forEach(row => {
    row.classList.remove("is-selected");
    if (row.hasAttribute("aria-selected")) row.setAttribute("aria-selected", "false");
  });
  [root, ...root.querySelectorAll("[data-assistant-context]")].forEach(node => {
    try {
      const context = JSON.parse(node.getAttribute("data-assistant-context") ?? "null");
      if (!context?.object) return;
      delete context.object; delete context.unsaved; node.setAttribute("data-assistant-context", JSON.stringify(context));
    } catch { /* An invalid context does not describe an open record. */ }
  });
  root.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: null } }));
}

export function childView(port: MessagePort, scope: FrameScope): UiPageView<HTMLElement> {
  let sequence = 0, languageRevision = 0;
  const pending = new Map<number, { finish(html?: string, error?: Error): void; cancel(): void }>();
  const cancel = () => { for (const entry of [...pending.values()]) entry.cancel(); };
  scope.own(cancel);
  scope.listen(document, "molis-work:language-changed", () => { languageRevision++; });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "document") return;
    const entry = pending.get(event.data.id); if (!entry) return;
    entry.finish(event.data.html ?? "", event.data.error ? new Error(event.data.error) : undefined);
  });
  return { onClosing(action) { if (scope.alive) port.postMessage({ type: "on-closing", action } satisfies FrameUp); },
    embed: childEmbeds(port, scope), surfaceSlot: childSurfaceSlots(port, scope), refreshShell() { if (scope.alive) port.postMessage({ type: "refresh-shell" } satisfies FrameUp); }, readDocument: query => new Promise<string>((resolve, reject) => {
    if (!scope.alive) { reject(new Error("View closed")); return; }
    query?.signal?.throwIfAborted();
    const id = ++sequence, language = languageRevision;
    const finish = (html?: string, error?: Error) => {
      if (!pending.delete(id)) return;
      query?.signal?.removeEventListener("abort", abort);
      if (language !== languageRevision) reject(new DOMException("View changed", "AbortError"));
      else if (error) reject(error); else resolve(html ?? "");
    };
    const abort = () => { port.postMessage({ type: "document-cancel", id } satisfies FrameUp); finish(undefined, new DOMException("View changed", "AbortError")); };
    pending.set(id, { finish, cancel: abort }); query?.signal?.addEventListener("abort", abort, { once: true });
    port.postMessage({ type: "read-document", id, ...(query?.object ? { object: query.object } : {}), ...(query?.input ? { input: query.input } : {}) } satisfies FrameUp);
  }) };
}

/** Address and contribution come from the trusted mount; a child supplies neither. No owner document reaches the port. */
export async function readOwnPageDocument(root: HTMLElement, route: (path: string) => string,
  pluginId: string, pageId: string, scope?: FrameScope, signal?: AbortSignal): Promise<string> {
    const version = frameDocumentRevision(), language = document.documentElement.lang;
    const check = () => molisWorkRequest(route("/api/plugins/" + pluginId + "/view-revision"), { scope, signal, headers: { "x-molis-plugin-page": pageId } });
    await check();
    const source = await molisWorkRequest<string>(location.pathname + location.search, { as: "text", scope, signal });
    const rendered = new DOMParser().parseFromString(source, "text/html");
    const html = renderedFrameText(rendered, root);
    if (html === null || rendered.documentElement.lang && rendered.documentElement.lang !== language) throw new Error("View unavailable");
    await check(); scope?.assertCurrent(signal);
    if (!root.isConnected || signal?.aborted || version !== frameDocumentRevision()) throw new Error("View unavailable");
    return html;
}

function validStageInput(input: unknown): input is Readonly<Record<string, string>> {
  return Boolean(input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length <= 20
    && Object.entries(input).every(([key, value]) => /^[a-z][a-z0-9_]*$/.test(key) && key.length <= 80 && typeof value === "string" && value.length <= 2000));
}

async function readStageDocument(path: string, language: string, current: () => void, scope?: FrameScope, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await molisWorkRequest<Response>(path, { as: "response", scope, signal });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: unknown } | null;
      current();
      throw new Error(typeof body?.error === "string" && body.error !== "" ? body.error : molisWorkRequest.text(null));
    }
    if (response.headers.get("content-language") === language) return response.text();
    await response.body?.cancel();
    current();
  }
  throw new Error("View unavailable");
}

/** A parameterized page remains bound to the same owner and language before and after the read. */
export async function readInputPageDocument(root: HTMLElement, route: (path: string) => string, pluginId: string, pageId: string,
  input: Readonly<Record<string, string>>, scope?: FrameScope, signal?: AbortSignal): Promise<string> {
  if (!root.dataset.pluginProducer || !root.dataset.pluginClient || !validStageInput(input)) throw new Error("View unavailable");
  const version = frameDocumentRevision(), language = document.documentElement.lang;
  const current = () => {
    scope?.assertCurrent(signal);
    if (!root.isConnected || signal?.aborted || version !== frameDocumentRevision()) throw new Error("View unavailable");
  };
  await readOwnPageDocument(root, route, pluginId, pageId, scope, signal);
  current();
  const path = route("/api/stage/" + encodeURIComponent(root.dataset.pluginClient)) + "?" + new URLSearchParams(input);
  const html = await readStageDocument(path, language, current, scope, signal);
  await readOwnPageDocument(root, route, pluginId, pageId, scope, signal);
  current();
  return html;
}

export async function readPageDocument(port: MessagePort, id: number, root: HTMLElement, route: (path: string) => string,
  pack: FramePack, pageId: string, scope: FrameScope, object?: { id: string; surface: string }, signal?: AbortSignal, input?: Readonly<Record<string, string>>): Promise<void> {
  const version = frameDocumentRevision(), language = document.documentElement.lang;
  const current = () => { scope.assertCurrent(signal); if (version !== frameDocumentRevision()) throw new Error("View unavailable"); };
  try {
    let html: string;
    if (input !== undefined && !validStageInput(input)) throw new Error("View unavailable");

    if (object !== undefined) {
      if (!root.dataset.pluginProducer || !root.dataset.pluginClient || !object || typeof object !== "object" || Array.isArray(object)
        || Object.keys(object).some(key => !["id", "surface"].includes(key)) || typeof object.id !== "string" || !object.id || object.id.length > 256 || object.id.includes("/")
        || typeof object.surface !== "string" || !object.surface || object.surface.length > 200) throw new Error("View unavailable");
      await molisWorkRequest(route("/api/host/plugin-page-check"), { body: { object_surface: object.surface }, scope, signal, headers: { "x-molis-plugin-page": pageId } });
      const path = route("/api/stage/" + encodeURIComponent(root.dataset.pluginClient) + "/objects/" + encodeURIComponent(object.id))
        + "?" + new URLSearchParams({ ...input, surface: object.surface });
      html = await readStageDocument(path, language, current, scope, signal);
      // Re-read the exact producer after the fragment: a new half or installation cannot supply this old page's result.
      await readOwnPageDocument(root, route, pack.plugin_id, pageId, scope, signal);
    } else if (input !== undefined) {
      html = await readInputPageDocument(root, route, pack.plugin_id, pageId, input, scope, signal);
    } else {
      html = await readOwnPageDocument(root, route, pack.plugin_id, pageId, scope, signal);
    }
    current();
    // Parameterized pages also replace the trusted document used to authorize their rendered connection slots.
    if (object === undefined) {
      const payload = root.querySelector("script[data-plugin-document]");
      if (payload) payload.textContent = JSON.stringify(html).replaceAll("<", "\\u003c");
    }
    port.postMessage({ type: "document", id, html } satisfies FrameDown);
  } catch (error) {
    if (scope.alive && !signal?.aborted) port.postMessage({ type: "document", id, error: error instanceof Error ? error.message : "View unavailable" } satisfies FrameDown);
  }
}
