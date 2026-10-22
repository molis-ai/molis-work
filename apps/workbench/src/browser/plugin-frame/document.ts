import type { FramePack } from "./types.js";

/** The CSP names only the registered bundle and its declared static dependencies. No child network or nested frame. */
export function frameDocument(root: HTMLElement, pack: FramePack): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  const origin = location.origin, script = origin + "/assets/molis-work-plugin-frame.js";
  const sources = [script, origin + "/desktop/pty-client.js", origin + "/assets/molis-work-plugins/" + encodeURIComponent(pack.bundle) + ".js", ...pack.assets.map(path => new URL(path, origin).href)];
  const policy = "default-src 'none'; script-src " + sources.join(" ") + "; style-src 'unsafe-inline' " + origin + "/assets/; font-src " + origin
    + "/assets/; img-src data: blob: " + origin + "/assets/; connect-src 'none'; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
  const content: unknown = JSON.parse(root.querySelector("[data-plugin-document]")?.textContent ?? "null");
  if (typeof content !== "string") throw new Error("Missing plugin document");
  return '<!doctype html><html lang="' + escape(document.documentElement.lang) + '"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'
    + escape(policy) + '"><link rel="stylesheet" href="' + origin + '/assets/molis-work-workbench.css"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--surface);color:var(--ink)}body>[data-work-surface]{position:relative;display:flex;width:100%;height:100%;min-width:0}body>[data-work-surface][hidden]{display:none}</style></head><body class="immersive-workbench">'
    + (document.querySelector("svg.icon-sprite")?.outerHTML ?? "") + content + '<script src="' + script + '"></script></body></html>';
}
