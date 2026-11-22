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

const LEADING_LINK_PREFIX = /^\s*<link(?=\s|>|\/)/i;

/** Quote-aware leading `<link ...>` attribute parser so `>` or `rel=` inside another attribute value never misparses. */
function parseLeadingLinkTag(content: string, start: number): { full: string; attrs: Map<string, string>; end: number } | null {
  const slice = content.slice(start);
  const prefix = LEADING_LINK_PREFIX.exec(slice);
  if (!prefix) return null;
  let i = start + slice.indexOf("<") + 5;
  const attrs = new Map<string, string>();
  while (i < content.length) {
    while (i < content.length && /\s/.test(content[i]!)) i += 1;
    if (i >= content.length) return null;
    if (content[i] === ">") return { full: content.slice(start, i + 1), attrs, end: i + 1 };
    if (content[i] === "/" && content[i + 1] === ">") return { full: content.slice(start, i + 2), attrs, end: i + 2 };
    if (content[i] === "/") {
      i += 1;
      continue;
    }
    const nameStart = i;
    while (i < content.length && !/[\s=/>]/.test(content[i]!)) i += 1;
    const name = content.slice(nameStart, i).toLowerCase();
    while (i < content.length && /\s/.test(content[i]!)) i += 1;
    let value = "";
    if (content[i] === "=") {
      i += 1;
      while (i < content.length && /\s/.test(content[i]!)) i += 1;
      const q = content[i];
      if (q === "\"" || q === "'") {
        i += 1;
        const valStart = i;
        while (i < content.length && content[i] !== q) i += 1;
        if (i >= content.length) return null;
        value = content.slice(valStart, i);
        i += 1;
      } else {
        const valStart = i;
        while (i < content.length && !/[\s>]/.test(content[i]!)) i += 1;
        value = content.slice(valStart, i);
      }
    }
    if (name && !attrs.has(name)) attrs.set(name, value);
  }
  return null;
}

/**
 * Hoist contiguous leading same-origin `/assets/` plugin stylesheet `<link>` tags into `<head>` (102-1).
 * Only inspects leading `<link>` tags (as prepended by `renderPluginFrameSurface`), never body text or embedded JSON,
 * parses real HTML attributes (ignoring `data-rel`/`data-href` or values quoted inside other attributes), and rejects credentials.
 */
export function extractHeadStyleLinks(content: string, origin: string): { headLinks: string; bodyContent: string } {
  const headLinks: string[] = [];
  let cursor = 0;
  let keptLeading = "";
  while (cursor < content.length) {
    const found = parseLeadingLinkTag(content, cursor);
    if (!found) break;
    const { full, attrs, end } = found;
    cursor = end;
    const rel = attrs.get("rel")?.trim().toLowerCase();
    const rawHref = attrs.get("href")?.trim();
    if (rel !== "stylesheet" || !rawHref) {
      keptLeading += full;
      continue;
    }
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
