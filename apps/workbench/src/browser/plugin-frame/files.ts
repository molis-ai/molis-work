import type { UiPageFiles, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameScope, FrameUp } from "./types.js";

export function pageFiles(port: MessagePort, scope: FrameScope, request: UiRequest, copyText: (text: string) => Promise<void>): UiPageFiles<HTMLImageElement | HTMLIFrameElement> {
  const media = new Map<Element, { controller: AbortController; address?: string }>();
  let observer: MutationObserver | null = null;
  const stopWatchingIfEmpty = () => {
    if (media.size === 0 && observer) {
      observer.disconnect();
      observer = null;
    }
  };
  const release = (element: Element) => {
    const entry = media.get(element);
    media.delete(element);
    entry?.controller.abort();
    if (entry?.address) URL.revokeObjectURL(entry.address);
    stopWatchingIfEmpty();
  };
  const watchMedia = () => {
    if (observer || media.size === 0) return;
    observer = new MutationObserver(() => {
      for (const element of [...media.keys()]) if (!element.isConnected) release(element);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };
  scope.own(() => {
    for (const element of [...media.keys()]) release(element);
    stopWatchingIfEmpty();
  });
  return {
    copyText,
    async download(blob, filename) {
      const bytes = await blob.arrayBuffer(); scope.assertCurrent();
      port.postMessage({ type: "download", bytes, filename, mime: blob.type } satisfies FrameUp, [bytes]);
    },
    printDocument: html => port.postMessage({ type: "print", html } satisfies FrameUp),
    loadMedia(element, path) {
      release(element); const entry = { controller: new AbortController(), address: undefined as string | undefined }; media.set(element, entry);
      watchMedia();
      void (async () => {
        const response = await request<Response>(path, { as: "response", scope, signal: entry.controller.signal });
        if (!response.ok) throw new Error(request.text(await response.json()));
        let blob = await response.blob(); scope.assertCurrent();
        if (element instanceof HTMLIFrameElement) {
          if (await blob.slice(0, 5).text() !== "%PDF-") throw new Error("Media type refused");
          blob = new Blob([blob], { type: "application/pdf" });
        } else if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(blob.type)) throw new Error("Media type refused");
        if (media.get(element) !== entry || !element.isConnected) return;
        entry.address = URL.createObjectURL(blob); element.src = entry.address;
      })().catch(error => { if (!entry.controller.signal.aborted && element.isConnected) { element.setAttribute("title", request.text(error)); element.dispatchEvent(new Event("error")); } });
    },
  };
}

const HTML_NS = "http://www.w3.org/1999/xhtml";
const MAX_PRINT_HTML_CHARS = 5 * 1024 * 1024;
const FORBIDDEN_PRINT_TAGS = new Set([
  "meta", "base", "iframe", "frame", "frameset", "object", "embed", "applet",
  "script", "noscript", "template", "link", "portal", "noembed", "noframes",
]);
const URL_ATTRS = new Set(["src", "poster", "background", "data"]);
const HREF_ATTRS = new Set(["href", "xlink:href"]);
const activePrintCleanup = new WeakMap<FrameScope, () => void>();

export const PRINT_DOCUMENT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; frame-src 'none'; object-src 'none'; child-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'";

function escapePrintAttr(value: string): string {
  return value.replace(/[&<>"']/gu, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function isSafePrintMediaUrl(value: string): boolean {
  return /^(?:data:|blob:)/iu.test(value.trim());
}

function scrubPrintNode(node: Node): void {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 8) {
      child.parentNode?.removeChild(child);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const tag = el.localName.toLowerCase();
    if (FORBIDDEN_PRINT_TAGS.has(tag)) {
      el.remove();
      continue;
    }
    if (tag === "style") {
      if (el.namespaceURI && el.namespaceURI !== HTML_NS) {
        el.remove();
        continue;
      }
      if (el.textContent) el.textContent = el.textContent.replace(/<\/style/giu, "<\\/style");
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "http-equiv" || name === "srcdoc" || name === "formaction" || name === "action" || name === "ping") {
        el.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRS.has(name)) {
        if (!isSafePrintMediaUrl(attr.value)) el.removeAttribute(attr.name);
        continue;
      }
      if (name === "srcset") {
        const candidates = attr.value.split(",").map(part => part.trim().split(/\s+/u)[0] ?? "").filter(Boolean);
        if (!candidates.length || !candidates.every(isSafePrintMediaUrl)) el.removeAttribute(attr.name);
        continue;
      }
      if (HREF_ATTRS.has(name) && /^(?:javascript|vbscript|data):/iu.test(attr.value.trim())) {
        el.removeAttribute(attr.name);
      }
    }
    scrubPrintNode(el);
  }
}

/**
 * Strip every navigation, embedding, scripting or meta directive from plugin-supplied print HTML before placing it
 * into the scriptless print document, and prepend our restrictive CSP as the sole `<meta>` directive.
 */
export function sanitizePrintHtml(html: string): string {
  const bounded = html.slice(0, MAX_PRINT_HTML_CHARS);
  if (typeof DOMParser === "function") {
    const doc = new DOMParser().parseFromString(bounded, "text/html");
    scrubPrintNode(doc.documentElement);
    const lang = doc.documentElement.getAttribute("lang");
    const dir = doc.documentElement.getAttribute("dir");
    const htmlAttrs = (lang ? ` lang="${escapePrintAttr(lang)}"` : "") + (dir ? ` dir="${escapePrintAttr(dir)}"` : "");
    const head = doc.head ? doc.head.innerHTML : "";
    const body = doc.body ? doc.body.innerHTML : "";
    return `<!doctype html><html${htmlAttrs}><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PRINT_DOCUMENT_CSP}">${head}</head><body>${body}</body></html>`;
  }
  let stripped = bounded;
  let previous: string;
  do {
    previous = stripped;
    stripped = stripped
      .replace(/<(script|noscript|template|iframe|frame|frameset|object|applet|noembed|noframes)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "")
      .replace(/<\/?(?:meta|base|iframe|frame|frameset|object|embed|applet|script|noscript|template|link|portal|noembed|noframes)\b[^>]*>/giu, "")
      .replace(/\s+(?:on[a-z]+|http-equiv|srcdoc|formaction|action|ping)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "");
  } while (stripped !== previous);
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PRINT_DOCUMENT_CSP}"></head><body>${stripped}</body></html>`;
}

export function printPageDocument(html: string, scope: FrameScope): void {
  scope.assertCurrent();
  if (html.length > MAX_PRINT_HTML_CHARS) return;
  activePrintCleanup.get(scope)?.();
  const frame = document.createElement("iframe");
  // This is a scriptless print document, not the plugin execution frame. Same-origin lets the trusted parent
  // call focus()/print(); allow-modals permits printing. Keep scripts disabled, strip all supplied <meta>/embedding
  // tags via sanitizePrintHtml, and enforce the restrictive CSP: plugin-supplied HTML must never navigate or execute
  // with the parent's origin. The plugin frame stays opaque (parent.ts).
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  let timer: ReturnType<typeof setTimeout>;
  let loaded = false;
  const cleanup = () => {
    if (activePrintCleanup.get(scope) === cleanup) activePrintCleanup.delete(scope);
    clearTimeout(timer); window.removeEventListener("afterprint", cleanup); frame.onload = null;
    try { frame.contentWindow?.removeEventListener("afterprint", cleanup); }
    catch { return; } // A navigated child may be opaque; removal still runs and releases its listeners.
    finally { frame.remove(); }
  };
  activePrintCleanup.set(scope, cleanup);
  frame.onload = () => {
    if (!frame.isConnected) return;
    if (loaded) {
      cleanup();
      return;
    }
    loaded = true;
    try {
      const href = frame.contentWindow?.location?.href;
      if (href && href !== "about:srcdoc") {
        cleanup();
        return;
      }
      frame.contentWindow?.addEventListener("afterprint", cleanup, { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print();
    }
    catch { cleanup(); }
  };
  frame.srcdoc = sanitizePrintHtml(html);
  timer = setTimeout(cleanup, 120_000);
  window.addEventListener("afterprint", cleanup, { once: true });
  scope.own(cleanup); scope.assertCurrent(); document.body.append(frame);
}
