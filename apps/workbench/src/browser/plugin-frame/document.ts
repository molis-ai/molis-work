import { escapeHtml as escape } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { FramePack } from "./types.js";
import { appearanceRef, type AppearanceProjection } from "../appearance-view.js";

/** The CSP names only the registered bundle and its declared static dependencies. No child network or nested frame. */
export function frameDocument(root: HTMLElement, pack: FramePack, challenge: string, appearance?: AppearanceProjection): string {
  const origin = location.origin, script = origin + "/assets/molis-work-plugin-frame.js";
  const sources = [script, origin + "/desktop/pty-client.js", origin + "/assets/molis-work-plugins/" + encodeURIComponent(pack.bundle) + ".js", ...pack.assets.map(path => new URL(path, origin).href)];
  const policy = "default-src 'none'; script-src " + sources.join(" ") + "; style-src 'unsafe-inline' " + origin + "/assets/; font-src " + origin
    + "/assets/; img-src data: blob: " + origin + "/assets/; connect-src 'none'; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
  const content: unknown = JSON.parse(root.querySelector("[data-plugin-document]")?.textContent ?? "null");
  if (typeof content !== "string") throw new Error("Missing plugin document");
  const dataset = document.documentElement.dataset;
  const device = [["theme", dataset.theme], ["resolved-theme", dataset.resolvedTheme], ["density", dataset.density],
    ["terminal-theme", dataset.terminalTheme], ["resolved-terminal-theme", dataset.resolvedTerminalTheme]];
  const snapshot = appearance?.snapshot;
  const appearanceAttrs = snapshot ? [["ui-skin", appearanceRef(snapshot.skin)], ["ui-font", appearanceRef(snapshot.font.scheme)],
    ["ui-mono", appearanceRef(snapshot.font.mono)]] : [];
  const attributes = [...device, ...appearanceAttrs].map(([name, value]) => value ? ` data-${name}="${escape(value)}"` : "").join("");
  const sheet = appearance?.stylesheet ? `<link rel="stylesheet" data-ui-appearance-sheet href="${escape(new URL(appearance.stylesheet, origin).href)}">` : "";
  return '<!doctype html><html lang="' + escape(document.documentElement.lang) + '"' + attributes + '><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'
    + escape(policy) + '"><meta name="molis-work-frame-parent" content="' + escape(origin) + '"><meta name="molis-work-frame-mount" content="' + escape(challenge)
    + '"><link rel="stylesheet" href="' + origin + '/assets/molis-work-workbench.css">' + sheet + '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--surface);color:var(--ink)}body{container:plugin-stage / inline-size}body>:is([data-work-surface],[data-ui-client-root]){position:relative;width:100%;height:100%;min-width:0}body[hidden],body>:is([data-work-surface],[data-ui-client-root])[hidden]{display:none}</style></head><body class="immersive-workbench">'
    + (document.querySelector("svg.icon-sprite")?.outerHTML ?? "") + content + '<script src="' + script + '"></script></body></html>';
}
