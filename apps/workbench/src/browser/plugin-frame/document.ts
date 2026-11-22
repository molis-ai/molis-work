import { escapeHtml as escape } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { FramePack } from "./types.js";
import { appearanceRef, type AppearanceProjection } from "../appearance-view.js";

export function frameDocumentMarkup(root: HTMLElement): string | null {
  const html: unknown = JSON.parse(root.querySelector(":scope > script[data-plugin-document]")?.textContent ?? "null");
  return typeof html === "string" ? html : null;
}

/** Match the actual surface and producer already bound to this root in either representation of the same shell. */
export function renderedFrameText(page: ParentNode, root: HTMLElement): string | null {
  const selectors = root.dataset.pluginContribution ? "[data-plugin-contribution]" : "[data-work-surface], [data-directory-panel]";
  const keys = root.dataset.pluginContribution
    ? ["pluginOwner", "pluginContribution", "pluginSurface", "pluginSlot", "pluginProducer"] as const
    : ["workSurface", "directoryPanel"] as const;
  const matches = [...page.querySelectorAll<HTMLElement>(selectors)].filter(candidate =>
    !candidate.hasAttribute("data-pane-clone")
    && keys.every(key => candidate.dataset[key] === root.dataset[key]) && candidate.querySelector(":scope > script[data-plugin-document]"));
  if (matches.length !== 1) return null;
  return frameDocumentMarkup(matches[0]!);
}

const LEADING_LINK_TAG = /^\s*(<link(?=\s|>)[^>]*>)/i;
const LINK_REL_STYLESHEET = /(?:^|\s)rel=(["'])stylesheet\1(?=\s|>|\/)/i;
const LINK_HREF = /(?:^|\s)href=(["'])([^"']+)\1(?=\s|>|\/)/i;

/**
 * Hoist contiguous leading same-origin `/assets/` plugin stylesheet `<link>` tags into `<head>` (102-1).
 * Only inspects leading `<link>` tags (as prepended by `renderPluginFrameSurface`), never body text or embedded JSON,
 * requires whitespace-delimited `rel`/`href` attributes (ignoring `data-rel`/`data-href`), and rejects credentials.
 */
export function extractHeadStyleLinks(content: string, origin: string): { headLinks: string; bodyContent: string } {
  const headLinks: string[] = [];
  let cursor = 0;
  let keptLeading = "";
  while (cursor < content.length) {
    const match = LEADING_LINK_TAG.exec(content.slice(cursor));
    if (!match) break;
    const full = match[0]!;
    const tag = match[1]!;
    cursor += full.length;
    const hrefMatch = LINK_REL_STYLESHEET.test(tag) ? LINK_HREF.exec(tag) : null;
    if (!hrefMatch) {
      keptLeading += full;
      continue;
    }
    const rawHref = hrefMatch[2]!;
    let resolved: URL;
    try {
      resolved = new URL(rawHref, origin);
    } catch {
      keptLeading += full;
      continue;
    }
    if (resolved.origin !== origin || resolved.username || resolved.password || !resolved.pathname.startsWith("/assets/")) {
      keptLeading += full;
      continue;
    }
    headLinks.push(`<link rel="stylesheet" href="${escape(resolved.href)}">`);
  }
  return { headLinks: headLinks.join(""), bodyContent: keptLeading + content.slice(cursor) };
}

/** The CSP permits the registered bundle, its declared static dependencies and the shared composer on demand. No child network or nested frame. */
export function frameDocument(root: HTMLElement, pack: FramePack, challenge: string, appearance?: AppearanceProjection): string {
  const origin = location.origin;
  const script = origin + "/assets/molis-work-plugin-frame.js";
  const sources = [script, origin + "/assets/molis-work-composer.js", origin + "/desktop/pty-client.js", origin + "/assets/molis-work-plugins/" + encodeURIComponent(pack.bundle) + ".js", ...pack.assets.map(path => new URL(path, origin).href)];
  const policy = "default-src 'none'; script-src " + sources.join(" ") + "; style-src 'unsafe-inline' " + origin + "/assets/; font-src " + origin
    + "/assets/; img-src data: blob: " + origin + "/assets/; connect-src 'none'; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
  const content = frameDocumentMarkup(root);
  if (content === null) throw new Error("Missing plugin document");
  const helpJson = root.querySelector(":scope > script[data-plugin-help]")?.textContent?.trim();
  const helpTag = helpJson ? `<script type="application/json" data-mw-help-declaration>${helpJson.replaceAll("<", "\\u003c")}</script>` : "";
  const { headLinks, bodyContent } = extractHeadStyleLinks(content, origin);
  const dataset = document.documentElement.dataset;
  const device = [["theme", dataset.theme], ["resolved-theme", dataset.resolvedTheme], ["density", dataset.density],
    ["terminal-theme", dataset.terminalTheme], ["resolved-terminal-theme", dataset.resolvedTerminalTheme]];
  const snapshot = appearance?.snapshot;
  const appearanceAttrs = snapshot ? [["ui-skin", appearanceRef(snapshot.skin)], ["ui-font", appearanceRef(snapshot.font.scheme)],
    ["ui-mono", appearanceRef(snapshot.font.mono)]] : [];
  const attributes = [...device, ...appearanceAttrs].map(([name, value]) => value ? ` data-${name}="${escape(value)}"` : "").join("")
    + (document.documentElement.hasAttribute("data-craft-still") ? " data-craft-still" : "");
  const sheet = appearance?.stylesheet ? `<link rel="stylesheet" data-ui-appearance-sheet href="${escape(new URL(appearance.stylesheet, origin).href)}">` : "";
  return '<!doctype html><html lang="' + escape(document.documentElement.lang) + '"' + attributes + '><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'
    + escape(policy) + '"><meta name="molis-work-frame-parent" content="' + escape(origin) + '"><meta name="molis-work-frame-mount" content="' + escape(challenge)
    + '"><link rel="stylesheet" href="' + origin + '/assets/molis-work-plugin-base.css">' + sheet + '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--surface);color:var(--ink)}body{container:plugin-stage / inline-size}body>:is([data-work-surface],[data-ui-client-root]){position:relative;width:100%;height:100%;min-width:0}body[hidden],body>:is([data-work-surface],[data-ui-client-root])[hidden]{display:none}</style>' + headLinks + '</head><body class="immersive-workbench">'
    + (document.querySelector("svg.icon-sprite")?.outerHTML ?? "") + bodyContent + helpTag + '<script src="' + script + '"></script></body></html>';
}
