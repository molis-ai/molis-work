import type { UiPageFiles, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameScope, FrameUp } from "./types.js";

export function pageFiles(port: MessagePort, scope: FrameScope, request: UiRequest, copyText: (text: string) => Promise<void>): UiPageFiles<HTMLImageElement | HTMLIFrameElement> {
  const media = new Map<Element, { controller: AbortController; address?: string }>();
  const release = (element: Element) => {
    const entry = media.get(element); media.delete(element); entry?.controller.abort();
    if (entry?.address) URL.revokeObjectURL(entry.address);
  };
  scope.own(() => { for (const element of media.keys()) release(element); });
  scope.observe(new MutationObserver(() => { for (const element of media.keys()) if (!element.isConnected) release(element); }), document.body, { childList: true, subtree: true });
  return {
    copyText,
    async download(blob, filename) {
      const bytes = await blob.arrayBuffer(); scope.assertCurrent();
      port.postMessage({ type: "download", bytes, filename, mime: blob.type } satisfies FrameUp, [bytes]);
    },
    printDocument: html => port.postMessage({ type: "print", html } satisfies FrameUp),
    loadMedia(element, path) {
      release(element); const entry = { controller: new AbortController(), address: undefined as string | undefined }; media.set(element, entry);
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
      })().catch(error => { if (!entry.controller.signal.aborted && element.isConnected) element.setAttribute("title", request.text(error)); });
    },
  };
}

export function printPageDocument(html: string, scope: FrameScope): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin allow-modals"); frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); };
  frame.srcdoc = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data: blob:; form-action \'none\'">' + html;
  document.body.append(frame); scope.own(() => frame.remove());
  window.addEventListener("afterprint", () => frame.remove(), { once: true });
}
