import { renderPluginFrameClientScript, pluginWorkbenchClientAsset, pluginFrameServedStylesheet, renderMolisWorkPluginBaseStylesheet as defaultPluginBaseStylesheet, renderMolisWorkCapabilitiesClientScript, renderMolisWorkCharactersClientScript, renderMolisWorkSessionsClientScript, renderMolisWorkInstalledPluginClientScript, renderMolisWorkKnowledgeClientScript, renderMolisWorkKitClientScript, renderMolisWorkWorkRecordsClientScript, renderMolisWorkAssistantSubtasksClientScript, renderMolisWorkChooserSearchClientScript } from "@molis-ai/molis-work-app-workbench";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";
import { constants, gzipSync } from "node:zlib";
import { workbenchLanguageResource, type WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";
import { BASELINE_REGISTRY, baselinePackageFile, COMPOSER_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { appearanceSheet } from "./appearance-sheet.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { tightenServedJs, tightenServedCss } from "./served-page-text.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { currentLocale } from "./web-locale.js";

const requireAsset = createRequire(import.meta.url);
type LanguageAsset = NonNullable<ReturnType<typeof workbenchLanguageResource>>;
const compressedLanguageAssets = new WeakMap<LanguageAsset, { body: Buffer; etag: string }>();

export const APPEARANCE_STYLESHEET_HREF = "/assets/ui-skin/folio-1.css";

function preferredLanguageEncoding(accepted: string | undefined): "gzip" | "identity" | null {
  const weights = new Map<string, number>();
  for (const entry of (accepted ?? "").split(",")) {
    const match = /^[\t ]*(gzip|identity|\*)(?:[\t ]*;[\t ]*q=(0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?))?[\t ]*$/iu.exec(entry);
    if (!match) continue;
    const coding = match[1]!.toLowerCase();
    // A repeated coding cannot override an explicit opt-out.
    weights.set(coding, Math.min(weights.get(coding) ?? 1, Number(match[2] ?? "1")));
  }
  const wildcard = weights.get("*"), identity = weights.get("identity");
  const gzip = weights.get("gzip") ?? wildcard ?? 0;
  // An unlisted identity is the fallback, unless the wildcard explicitly excludes it.
  if (gzip > 0 && (identity === undefined || gzip >= identity)) return "gzip";
  return (identity ?? (wildcard === 0 ? 0 : 1)) > 0 ? "identity" : null;
}

function gzipLanguageAsset(language: LanguageAsset): { body: Buffer; etag: string } {
  let asset = compressedLanguageAssets.get(language);
  if (!asset) {
    const body = gzipSync(language.body, { level: constants.Z_BEST_SPEED });
    asset = { body, etag: `"${createHash("sha256").update(body).digest("base64url")}"` };
    compressedLanguageAssets.set(language, asset);
  }
  return asset;
}

function bundledAppearanceFile(route: string): { body: string | Buffer; contentType: string } | null {
  switch (route) {
    case APPEARANCE_STYLESHEET_HREF: {
      const body = appearanceSheet();
      return body ? { body, contentType: "text/css; charset=utf-8" } : null;
    }
    case "/assets/inter-latin-variable.woff2":
    case "/assets/noto-sans-sc-400.woff2":
    case "/assets/noto-sans-sc-500-common.woff2":
    case "/assets/noto-sans-sc-600-common.woff2":
    case "/assets/folio-nunito-latin.woff2":
    case "/assets/folio-rounded-400-common.woff2":
    case "/assets/folio-rounded-400-tail.woff2":
    case "/assets/folio-rounded-500-common.woff2":
    case "/assets/folio-rounded-500-tail.woff2":
    case "/assets/folio-rounded-600-common.woff2":
    case "/assets/folio-rounded-600-tail.woff2":
    case "/assets/folio-rounded-700-common.woff2":
    case "/assets/folio-rounded-700-tail.woff2": {
      const row = BASELINE_REGISTRY.resources.find(candidate => candidate.kind === "font" && candidate.route === route);
      if (!row) return null;
      const file = baselinePackageFile(row.id);
      return fs.existsSync(file) ? { body: fs.readFileSync(file), contentType: "font/woff2" } : null;
    }
    default: return null;
  }
}

export function createLocalWebAssets(ports: {
  ptyClientFilePath(): string;
  renderer: Pick<WorkbenchRenderer, "renderMolisWorkWorkbenchStylesheet" | "renderMolisWorkWorkbenchClientScript" | "renderMolisWorkArrivalStylesheet" | "renderMolisWorkSettingsStylesheet">
    & Partial<Pick<WorkbenchRenderer, "renderMolisWorkPluginBaseStylesheet">>;
}) {
  const { ptyClientFilePath } = ports;
  const {
    renderMolisWorkWorkbenchStylesheet,
    renderMolisWorkWorkbenchClientScript,
    renderMolisWorkArrivalStylesheet,
    renderMolisWorkSettingsStylesheet,
    renderMolisWorkPluginBaseStylesheet = defaultPluginBaseStylesheet,
  } = ports.renderer;
  type Asset = { body: string | Buffer; contentType: string; etag: string };
  // An asset is compacted once per process; requests that come while it is being compacted wait for the same result.
  const workbenchAssets = new Map<string, Asset | Promise<Asset>>();
  function servePtyClient(request: IncomingMessage, response: ServerResponse): boolean {
    const filePath = ptyClientFilePath();
    if (!fs.existsSync(filePath)) {
      sendJson(response, 404, { error: "desktop pty client missing" });
      return true;
    }
    const body = fs.readFileSync(filePath);
    const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
    const headers = {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "private, max-age=0, must-revalidate",
      etag,
      "x-content-type-options": "nosniff",
    };
    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, headers);
      response.end();
      return true;
    }
    response.writeHead(200, headers);
    response.end(body);
    return true;
  }

  function serveWorkbenchAsset(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): boolean | Promise<true> {
    if (request.method !== "GET" && request.method !== "HEAD") return false;
    const language = workbenchLanguageResource(pathname);
    if (language) {
      const vary = "Accept-Encoding";
      const encoding = preferredLanguageEncoding(request.headers["accept-encoding"]);
      if (encoding === null) { response.writeHead(406, { vary }); response.end(); return true; }
      const asset = encoding === "gzip" ? gzipLanguageAsset(language) : language;
      const status = request.headers["if-none-match"] === asset.etag ? 304 : 200;
      const headers = { "content-type": "text/javascript; charset=utf-8", "cache-control": "private, max-age=31536000, immutable",
        etag: asset.etag, "x-content-type-options": "nosniff", vary,
        ...(status === 200 && encoding === "gzip" ? { "content-encoding": "gzip" } : {}),
        ...(status === 200 ? { "content-length": Buffer.byteLength(asset.body) } : {}),
      };
      response.writeHead(status, headers); response.end(status === 200 && request.method === "GET" ? asset.body : undefined);
      return true;
    }
    const key = pathname.endsWith(".woff2") ? pathname : currentLocale() + ":" + pathname;
    let asset = workbenchAssets.get(key);
    if (!asset) {
      const plugin = pathname.match(/^\/assets\/molis-work-plugins\/([a-z0-9-]+)\.(js|css)$/);
      const client = plugin?.[2] === "js" ? pluginWorkbenchClientAsset(plugin[1]!) : null;
      const styles = plugin?.[2] === "css" ? pluginFrameServedStylesheet(plugin[1]!) : null;
      const loaded = client ? { body: client, contentType: "text/javascript; charset=utf-8" } : styles ? { body: styles, contentType: "text/css; charset=utf-8" } : pathname === "/assets/molis-work-workbench.css"
      ? { body: renderMolisWorkWorkbenchStylesheet(), contentType: "text/css; charset=utf-8" }
      : pathname === "/assets/molis-work-plugin-base.css"
        ? { body: renderMolisWorkPluginBaseStylesheet(), contentType: "text/css; charset=utf-8" }
      : pathname === "/assets/molis-work-plugin-frame.js"
        ? { body: renderPluginFrameClientScript(), contentType: "text/javascript; charset=utf-8" }
      : pathname === "/assets/molis-work-workbench.js"
        ? { body: renderMolisWorkWorkbenchClientScript(), contentType: "text/javascript; charset=utf-8" }
        // The unified input's program: one file for the Workbench and every plugin frame, fetched on a document's first composer.
        : pathname === "/assets/molis-work-composer.js"
        ? { body: COMPOSER_CLIENT_SCRIPT, contentType: "text/javascript; charset=utf-8" }
        : pathname === "/assets/molis-work-capabilities.js"
        ? { body: renderMolisWorkCapabilitiesClientScript(), contentType: "text/javascript; charset=utf-8" }
        : pathname === "/assets/molis-work-knowledge.js"
        ? { body: renderMolisWorkKnowledgeClientScript(), contentType: "text/javascript; charset=utf-8" }
        // 「能力包」's program, fetched only by a page that shows it (settings-kit.ts, the user's choice 2026-11-10).
        : pathname === "/assets/molis-work-kit.js"
        ? { body: renderMolisWorkKitClientScript(), contentType: "text/javascript; charset=utf-8" }
        // Work Records settings program, fetched only by a page that shows it (settings-work-records.ts).
        : pathname === "/assets/molis-work-assistant-subtasks.js"
        ? { body: renderMolisWorkAssistantSubtasksClientScript(), contentType: "text/javascript; charset=utf-8" }
        : pathname === "/assets/molis-work-work-records.js"
        ? { body: renderMolisWorkWorkRecordsClientScript(), contentType: "text/javascript; charset=utf-8" }
        // The project list's personal search (BL-041), fetched on the first press of its button.
        : pathname === "/assets/molis-work-chooser-search.js"
        ? { body: renderMolisWorkChooserSearchClientScript(), contentType: "text/javascript; charset=utf-8" }
        // 角色 is the Host's page since CHR-1; its client keeps the address its plugin pack had (D5, BL-378; CHARACTERS_CLIENT_PATH).
        : pathname === "/assets/molis-work-plugins/characters.js"
        ? { body: renderMolisWorkCharactersClientScript(), contentType: "text/javascript; charset=utf-8" }
        // 外部会话 (`sessions`) is a Host surface loaded on demand when opened or when its Read Scope overlay is called.
        : pathname === "/assets/molis-work-plugins/sessions.js"
        ? { body: renderMolisWorkSessionsClientScript(), contentType: "text/javascript; charset=utf-8" }
        // An installed signed package's page is the platform's: one program for every package, project or Home (47-1).
        : pathname === "/assets/molis-work-plugins/installed-plugin.js"
        ? { body: renderMolisWorkInstalledPluginClientScript(), contentType: "text/javascript; charset=utf-8" }
        : pathname === "/assets/molis-work-arrival.css"
          ? { body: renderMolisWorkArrivalStylesheet(), contentType: "text/css; charset=utf-8" }
        : pathname === "/assets/molis-work-settings.css"
          ? { body: renderMolisWorkSettingsStylesheet(), contentType: "text/css; charset=utf-8" }
          : declaredPluginClientAsset(pathname) ?? bundledAppearanceFile(pathname);
      if (!loaded) return false;
      const compacting = (async (): Promise<Asset> => {
        const body = loaded.contentType.startsWith("text/javascript") ? await tightenServedJs(loaded.body.toString())
          : loaded.contentType.startsWith("text/css") ? await tightenServedCss(loaded.body.toString()) : loaded.body;
        return { body, contentType: loaded.contentType, etag: `"${createHash("sha256").update(body).digest("base64url")}"` };
      })();
      asset = compacting;
      workbenchAssets.set(key, compacting);
      void compacting.then(done => { if (workbenchAssets.get(key) === compacting) workbenchAssets.set(key, done); }, () => {
        if (workbenchAssets.get(key) === compacting) workbenchAssets.delete(key);
      });
    }
    // A compaction that failed, or a send that threw, answers this request; the failed compaction is not kept (above).
    if (asset instanceof Promise) return asset.then(ready => sendAsset(request, response, ready)).catch((error: unknown) => {
      if (!response.headersSent) sendJson(response, 500, { error: "页面资源暂时无法生成，请刷新重试" });
      else response.destroy(error instanceof Error ? error : undefined);
      return true as const;
    });
    return sendAsset(request, response, asset);
  }
  function sendAsset(request: IncomingMessage, response: ServerResponse, asset: Asset): true {
    const { etag } = asset;
    const headers = {
      "content-type": asset.contentType,
      ...(asset.contentType === "font/woff2" ? { "access-control-allow-origin": "*" } : {}),
      "cache-control": "private, max-age=0, must-revalidate",
      etag,
      "x-content-type-options": "nosniff",
    };
    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, headers);
      response.end();
      return true;
    }
    response.writeHead(200, headers);
    response.end(request.method === "HEAD" ? undefined : asset.body);
    return true;
  }
  return { servePtyClient, serveWorkbenchAsset };
}

const DECLARED_CLIENT_ASSET_SPECIFIERS = new Map<string, string>();
for (const entry of PLATFORM_PLUGIN_REGISTRATIONS) {
  const pkg = entry.project_runtime?.package_name ?? entry.runtime?.package_name;
  if (!pkg || !entry.workbench.clientAssetSpecifiers) continue;
  for (const [pathname, specifier] of Object.entries(entry.workbench.clientAssetSpecifiers)) {
    if (specifier.startsWith(pkg + "/")) DECLARED_CLIENT_ASSET_SPECIFIERS.set(pathname, specifier);
  }
}

function declaredPluginClientAsset(pathname: string): { body: Buffer; contentType: string } | null {
  const specifier = DECLARED_CLIENT_ASSET_SPECIFIERS.get(pathname);
  if (!specifier) return null;
  try {
    const filePath = requireAsset.resolve(specifier);
    if (!fs.existsSync(filePath)) return null;
    return { body: fs.readFileSync(filePath), contentType: "text/javascript; charset=utf-8" };
  } catch {
    return null;
  }
}
