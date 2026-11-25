import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePageFile, HomePageFilesResult } from "@molis-ai/molis-work-contracts/services/home";
import { escapeHtml as escape } from "../mainline-ui.js";
import { appearanceRef, type AppearanceProjection } from "../appearance-view.js";

const encoder = new TextEncoder();
const say = (key: string, args?: Record<string, string | number>): string => globalThis.t.text(key, args);

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, "0");
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256CspHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return `'sha256-${bytesToBase64(new Uint8Array(digest))}'`;
}

/**
 * Re-verifies every file's UTF-8 byte length and SHA-256 digest in the trusted outer shell before any markup enters `srcdoc`
 * (S-home-page-files). Throws immediately if any file is missing, extra, or tampered with.
 */
export async function verifyHomePageFiles(loaded: HomePageFilesResult): Promise<void> {
  if (loaded.files.length !== loaded.version.files.length) {
    throw new Error(say("workbench.home-pages.file-count-mismatch"));
  }
  const byPath = new Map<string, HomePageFile>(loaded.files.map(file => [file.path, file]));
  for (const meta of loaded.version.files) {
    const file = byPath.get(meta.path);
    if (!file || file.media_type !== meta.media_type) {
      throw new Error(say("workbench.home-pages.file-missing-or-type", { path: meta.path }));
    }
    const bytes = encoder.encode(file.text).byteLength;
    const digest = await sha256Hex(file.text);
    if (bytes !== meta.bytes || digest !== meta.sha256) {
      throw new Error(say("workbench.home-pages.file-verify-failed", { path: meta.path }));
    }
  }
}

function normalizeRelativePath(raw: string): string {
  return raw.trim().replace(/^\.\//u, "").replace(/^\/+/u, "");
}

function escapeInlineScript(code: string): string {
  return code.replace(/<\/script/giu, "<\\/script");
}

function escapeInlineStyle(css: string): string {
  return css.replace(/<\/style/giu, "<\\/style");
}

/** Fixed platform bridge injected into every generated-page opaque `srcdoc` frame (hashed into `script-src`). */
function buildBridgeScript(challenge: string, page: { page_id: string; version: number }, isPreview: boolean): string {
  const info = JSON.stringify({
    challenge,
    page,
    mode: isPreview ? "preview" : "live",
    err: {
      action: say("workbench.home-pages.action-failed"),
      script: say("workbench.home-pages.script-error"),
      async: say("workbench.home-pages.async-error"),
    },
  });
  return `(() => {
  const cfg = ${info};
  let port = null;
  let seq = 0;
  const pending = new Map();
  const readyQueue = [];
  function flush(target) {
    while (readyQueue.length) {
      const item = readyQueue.shift();
      target.postMessage(item);
    }
  }
  function rpc(type, payload) {
    const id = ++seq;
    const msg = { id, type, ...payload };
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      if (port) port.postMessage(msg);
      else readyQueue.push(msg);
    });
  }
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.type !== "molis-home-page-handshake" || data.challenge !== cfg.challenge || !event.ports || !event.ports[0]) return;
    port = event.ports[0];
    port.onmessage = (msgEvent) => {
      const msg = msgEvent.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "reply" && pending.has(msg.id)) {
        const waiter = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.ok) waiter.resolve(msg.result);
        else {
          const err = new Error(msg.message || cfg.err.action);
          err.code = msg.code || "actions.execution_failed";
          waiter.reject(err);
        }
      } else if (msg.type === "theme" && msg.dataset) {
        Object.assign(document.documentElement.dataset, msg.dataset);
      } else if (msg.type === "appearanceSheet") {
        const priors = [...document.querySelectorAll('link[data-ui-appearance-sheet]')];
        if (typeof msg.href === "string" && msg.href) {
          if (priors.length === 1 && priors[0].getAttribute("href") === msg.href) return;
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.setAttribute("data-ui-appearance-sheet", "");
          link.href = msg.href;
          document.head.appendChild(link);
          const dropPriors = () => { for (const p of priors) p.remove(); };
          if (priors.length) {
            link.addEventListener("load", dropPriors, { once: true });
            link.addEventListener("error", dropPriors, { once: true });
          }
        } else {
          for (const p of priors) p.remove();
        }
      }
    };
    port.start();
    flush(port);
    const reportSize = () => {
      const h = Math.max(220, document.documentElement.scrollHeight || document.body.scrollHeight || 320);
      port.postMessage({ type: "resize", height: Math.min(4800, h) });
    };
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(reportSize).observe(document.documentElement);
    }
    reportSize();
    port.postMessage({ type: "ready" });
  });
  window.addEventListener("error", (event) => {
    const message = event.message || cfg.err.script;
    if (port) port.postMessage({ type: "crash", message });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason && event.reason.message ? event.reason.message : String(event.reason || cfg.err.async);
    if (port) port.postMessage({ type: "crash", message: reason });
  });
  Object.defineProperty(window, "molisHomePage", {
    configurable: false,
    writable: false,
    value: Object.freeze({
      mode: cfg.mode,
      page: Object.freeze({ page_id: cfg.page.page_id, version: cfg.page.version }),
      invokeAction: (reference, input) => rpc("invokeAction", { reference, input }),
      actionAvailability: (reference) => rpc("actionAvailability", { reference }),
    }),
  });
})();`;
}

const BASE_FRAME_STYLE =
  "html,body{margin:0;padding:0;min-height:100%;background:transparent;color:var(--ink)}body{container:plugin-stage / inline-size;padding:2px 0}[hidden]{display:none!important}";

/**
 * Verifies SHA-256 of every file, parses the entry HTML, inlines ONLY declared JS/CSS files from the version manifest
 * (dropping undeclared external links/scripts/frames), and builds a strict hash-only CSP without `'unsafe-inline'`,
 * `'unsafe-eval'`, or `'unsafe-hashes'` (S-home-page-files).
 */
export async function buildHomePageSrcdoc(options: {
  readonly loaded: HomePageFilesResult;
  readonly origin: string;
  readonly challenge: string;
  readonly isPreview: boolean;
  readonly appearance?: AppearanceProjection;
}): Promise<{ html: string; csp: string; scriptHashes: string[]; styleHashes: string[] }> {
  await verifyHomePageFiles(options.loaded);

  const filesByPath = new Map<string, HomePageFile>(options.loaded.files.map(file => [file.path, file]));
  const entryFile = filesByPath.get(options.loaded.version.entry);
  if (!entryFile || entryFile.media_type !== "text/html") {
    throw new Error(say("workbench.home-pages.entry-not-html"));
  }

  const parsed = new DOMParser().parseFromString(entryFile.text, "text/html");
  // Strip forbidden elements and any CSP meta tag the draft attempted to inject.
  for (const el of [...parsed.querySelectorAll("iframe, object, embed, base, meta[http-equiv]")]) {
    el.remove();
  }

  const inlinedStyles: string[] = [BASE_FRAME_STYLE];
  const usedCss = new Set<string>();
  const usedJs = new Set<string>();
  const orderedScripts: string[] = [];

  for (const link of [...parsed.querySelectorAll("link")]) {
    const rel = (link.getAttribute("rel") ?? "").trim().toLowerCase();
    const rawHref = link.getAttribute("href");
    if (rel === "stylesheet" && rawHref) {
      const target = normalizeRelativePath(rawHref);
      const cssFile = filesByPath.get(target);
      if (cssFile && cssFile.media_type === "text/css" && !usedCss.has(cssFile.path)) {
        usedCss.add(cssFile.path);
        inlinedStyles.push(escapeInlineStyle(cssFile.text));
      }
    }
    link.remove();
  }

  for (const styleEl of [...parsed.querySelectorAll("style")]) {
    // Drop undeclared inline <style> blocks inside entry HTML; declared styles come from text/css manifest files.
    styleEl.remove();
  }

  for (const scriptEl of [...parsed.querySelectorAll("script")]) {
    const rawSrc = scriptEl.getAttribute("src");
    if (rawSrc) {
      const target = normalizeRelativePath(rawSrc);
      const jsFile = filesByPath.get(target);
      if (jsFile && jsFile.media_type === "text/javascript" && !usedJs.has(jsFile.path)) {
        usedJs.add(jsFile.path);
        orderedScripts.push(escapeInlineScript(jsFile.text));
      }
    }
    // Remove both external and undeclared inline <script> elements; only manifest JS files are hashed and emitted below.
    scriptEl.remove();
  }

  // Append any remaining declared CSS/JS files in manifest order.
  for (const file of options.loaded.files) {
    if (file.media_type === "text/css" && !usedCss.has(file.path)) {
      usedCss.add(file.path);
      inlinedStyles.push(escapeInlineStyle(file.text));
    } else if (file.media_type === "text/javascript" && !usedJs.has(file.path)) {
      usedJs.add(file.path);
      orderedScripts.push(escapeInlineScript(file.text));
    }
  }

  const bridgeScript = buildBridgeScript(
    options.challenge,
    { page_id: options.loaded.version.page_id, version: options.loaded.version.version },
    options.isPreview,
  );
  const normalizeLineEndings = (text: string): string => text.replace(/\r\n?/gu, "\n");
  const allScripts = [bridgeScript, ...orderedScripts].map(normalizeLineEndings);
  const normalizedStyles = inlinedStyles.map(normalizeLineEndings);
  const scriptHashes = await Promise.all(allScripts.map(sha256CspHash));
  const styleHashes = await Promise.all(normalizedStyles.map(sha256CspHash));

  const baseCssUrl = `${options.origin}/assets/molis-work-plugin-base.css`;
  const shellSheetHref =
    options.appearance?.stylesheet ??
    document.querySelector<HTMLLinkElement>("link[data-ui-appearance-sheet]")?.getAttribute("href") ??
    null;
  const appearanceCssUrl = shellSheetHref ? new URL(shellSheetHref, options.origin).href : null;
  const uiSkinOrigin = `${options.origin}/assets/ui-skin/`;
  const styleSources = [
    baseCssUrl,
    uiSkinOrigin,
    ...(appearanceCssUrl && !appearanceCssUrl.startsWith(uiSkinOrigin) ? [appearanceCssUrl] : []),
    ...styleHashes,
  ];
  const csp = [
    "default-src 'none'",
    `script-src ${scriptHashes.join(" ")}`,
    `style-src ${styleSources.join(" ")}`,
    `font-src ${options.origin}/assets/`,
    `img-src data: blob: ${options.origin}/assets/`,
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

  const dataset = document.documentElement.dataset;
  const deviceAttrs: Array<[string, string | undefined]> = [
    ["theme", dataset.theme],
    ["resolved-theme", dataset.resolvedTheme],
    ["density", dataset.density],
    ["terminal-theme", dataset.terminalTheme],
    ["resolved-terminal-theme", dataset.resolvedTerminalTheme],
  ];
  const snapshot = options.appearance?.snapshot;
  const appearanceAttrs: Array<[string, string | undefined]> = snapshot
    ? [
        ["ui-skin", appearanceRef(snapshot.skin)],
        ["ui-font", appearanceRef(snapshot.font.scheme)],
        ["ui-mono", appearanceRef(snapshot.font.mono)],
      ]
    : [
        ["ui-skin", dataset.uiSkin],
        ["ui-font", dataset.uiFont],
        ["ui-mono", dataset.uiMono],
      ];
  const htmlAttrs = [...deviceAttrs, ...appearanceAttrs]
    .filter(([, value]) => Boolean(value))
    .map(([name, value]) => ` data-${name}="${escape(value!)}"`)
    .join("") + (document.documentElement.hasAttribute("data-craft-still") ? " data-craft-still" : "");

  const appearanceLink = appearanceCssUrl
    ? `<link rel="stylesheet" data-ui-appearance-sheet href="${escape(appearanceCssUrl)}">`
    : "";
  const wrapRawTag = (tag: "style" | "script", text: string): string => {
    const el = parsed.createElement(tag);
    el.textContent = text;
    return el.outerHTML;
  };
  const styleTags = normalizedStyles.map(text => wrapRawTag("style", text)).join("");
  const scriptTags = allScripts.map(text => wrapRawTag("script", text)).join("");
  const sprite = document.querySelector("svg.icon-sprite")?.outerHTML ?? "";
  const bodyHtml = parsed.body?.innerHTML ?? "";

  const html =
    `<!doctype html><html lang="${escape(document.documentElement.lang || "zh")}"${htmlAttrs}>` +
    `<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escape(csp)}">` +
    `<link rel="stylesheet" href="${escape(baseCssUrl)}">${appearanceLink}${styleTags}</head>` +
    `<body class="immersive-workbench">${sprite}${bodyHtml}${scriptTags}</body></html>`;

  return { html, csp, scriptHashes, styleHashes };
}

export interface MountedHomePageFrame {
  readonly iframe: HTMLIFrameElement;
  readonly csp: string;
  dispose(): void;
}

/**
 * Mounts a verified generated-page version into an opaque `sandbox="allow-scripts allow-forms"` iframe with a strict
 * hash-only CSP and MessageChannel gateway. The child frame NEVER sees `pageSessionId` or any Host control token.
 */
export async function mountHomePageFrame(options: {
  readonly container: HTMLElement;
  readonly loaded: HomePageFilesResult;
  readonly pageSessionId: string;
  readonly isPreview: boolean;
  readonly routePrefix: string;
  readonly headers: () => Record<string, string>;
  readonly appearance?: AppearanceProjection;
  readonly signal?: AbortSignal;
  readonly onCrash?: (reason: string) => void;
  readonly onReady?: () => void;
}): Promise<MountedHomePageFrame> {
  const challenge = crypto.randomUUID();
  const built = await buildHomePageSrcdoc({
    loaded: options.loaded,
    origin: location.origin,
    challenge,
    isPreview: options.isPreview,
    appearance: options.appearance,
  });

  options.signal?.throwIfAborted();
  const iframe = document.createElement("iframe");
  iframe.className = "home-generated-frame";
  iframe.setAttribute("sandbox", "allow-scripts allow-forms");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("title", options.loaded.version.title);
  iframe.dataset.homePageFrame = `${options.loaded.version.page_id}@${options.loaded.version.version}`;
  iframe.dataset.homePageMode = options.isPreview ? "preview" : "live";

  const channel = new MessageChannel();
  const abort = new AbortController();
  let disposed = false;

  channel.port1.onmessage = async (event: MessageEvent<Record<string, unknown>>) => {
    if (disposed) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "resize" && typeof msg.height === "number" && Number.isFinite(msg.height)) {
      iframe.style.height = `${Math.max(220, Math.min(4800, Math.ceil(msg.height)))}px`;
      return;
    }
    if (msg.type === "ready") {
      options.onReady?.();
      return;
    }
    if (msg.type === "crash") {
      options.onCrash?.(typeof msg.message === "string" ? msg.message : say("workbench.home-pages.crashed-in-sandbox"));
      return;
    }
    if ((msg.type === "invokeAction" || msg.type === "actionAvailability") && typeof msg.id === "number") {
      try {
        const body =
          msg.type === "actionAvailability"
            ? { mode: "availability", reference: msg.reference as ActionReference }
            : { reference: msg.reference as ActionReference, input: msg.input };
        const res = await globalThis.molisWorkRequest<Response>(`${options.routePrefix}/api/home-pages/actions`, {
          as: "response",
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...options.headers(),
            "x-molis-home-page": options.pageSessionId,
          },
          body,
          signal: abort.signal,
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          channel.port1.postMessage({
            type: "reply",
            id: msg.id,
            ok: false,
            code: typeof data.code === "string" ? data.code : "actions.execution_failed",
            message: typeof data.error === "string" ? data.error : typeof data.message === "string" ? data.message : say("workbench.home-pages.action-denied"),
          });
        } else {
          channel.port1.postMessage({ type: "reply", id: msg.id, ok: true, result: data });
        }
      } catch (error) {
        if (!disposed) {
          channel.port1.postMessage({
            type: "reply",
            id: msg.id,
            ok: false,
            code: "actions.execution_failed",
            message: error instanceof Error ? error.message : say("workbench.home-pages.action-request-failed"),
          });
        }
      }
    }
  };
  channel.port1.start();

  let lastAppearanceHref =
    document.querySelector<HTMLLinkElement>("link[data-ui-appearance-sheet]")?.getAttribute("href") ?? null;
  const syncAppearanceSheet = () => {
    if (disposed) return;
    const raw = document.querySelector<HTMLLinkElement>("link[data-ui-appearance-sheet]")?.getAttribute("href") ?? null;
    if (raw === lastAppearanceHref) return;
    lastAppearanceHref = raw;
    channel.port1.postMessage({
      type: "appearanceSheet",
      href: raw ? new URL(raw, location.origin).href : null,
    });
  };
  const themeObserver = new MutationObserver(() => {
    if (disposed) return;
    const ds = document.documentElement.dataset;
    channel.port1.postMessage({
      type: "theme",
      dataset: {
        theme: ds.theme ?? "",
        resolvedTheme: ds.resolvedTheme ?? "",
        density: ds.density ?? "",
        uiSkin: ds.uiSkin ?? "",
        uiFont: ds.uiFont ?? "",
        uiMono: ds.uiMono ?? "",
      },
    });
    syncAppearanceSheet();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-resolved-theme", "data-density", "data-ui-skin", "data-ui-font", "data-ui-mono"],
  });
  const headObserver = new MutationObserver(syncAppearanceSheet);
  if (document.head) headObserver.observe(document.head, { childList: true, attributes: true, subtree: true, attributeFilter: ["href"] });

  // Assign srcdoc BEFORE attaching to DOM so an initial about:blank load cannot consume the { once: true } handshake!
  iframe.srcdoc = built.html;
  iframe.addEventListener(
    "load",
    () => {
      if (disposed) return;
      iframe.contentWindow?.postMessage({ type: "molis-home-page-handshake", challenge }, "*", [channel.port2]);
    },
    { once: true },
  );

  options.container.replaceChildren(iframe);

  return {
    iframe,
    csp: built.csp,
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      themeObserver.disconnect();
      headObserver.disconnect();
      try { channel.port1.close(); } catch { /* ignore */ }
      iframe.remove();
      void globalThis.molisWorkRequest(`${options.routePrefix}/api/home-pages/session/${encodeURIComponent(options.pageSessionId)}`, {
        method: "DELETE", keepalive: true,
        headers: options.headers(),
      }).catch(() => undefined);
    },
  };
}
