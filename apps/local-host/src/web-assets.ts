import { renderPluginFrameClientScript, pluginWorkbenchClientAsset, pluginOnDemandStylesheet, renderMolisWorkCapabilitiesClientScript, renderMolisWorkCharactersClientScript, renderMolisWorkKnowledgeClientScript } from "@molis-ai/molis-work-app-workbench";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";
import { workbenchLanguageResource, type WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";
import { BASELINE_REGISTRY, baselinePackageFile } from "@molis-ai/molis-work-design-system";
import { appearanceSheet } from "./appearance-sheet.js";
import { tightenServedJs, tightenServedCss } from "./served-page-text.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { currentLocale } from "./web-locale.js";

const requireAsset = createRequire(import.meta.url);

export const APPEARANCE_STYLESHEET_HREF = "/assets/ui-skin/folio-1.css";

function bundledAppearanceFile(route: string): { body: string | Buffer; contentType: string } | null {
  switch (route) {
    case APPEARANCE_STYLESHEET_HREF: {
      const body = appearanceSheet();
      return body ? { body, contentType: "text/css; charset=utf-8" } : null;
    }
    case "/assets/inter-latin-variable.woff2":
    case "/assets/noto-sans-sc-400.woff2":
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
  renderer: Pick<WorkbenchRenderer, "renderMolisWorkWorkbenchStylesheet" | "renderMolisWorkWorkbenchClientScript" | "renderMolisWorkArrivalStylesheet" | "renderMolisWorkSettingsStylesheet">;
}) {
  const { ptyClientFilePath } = ports;
  const { renderMolisWorkWorkbenchStylesheet, renderMolisWorkWorkbenchClientScript, renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet } = ports.renderer;
  const workbenchAssets = new Map<string, { body: string | Buffer; contentType: string; etag: string }>();
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
  ): boolean {
    if (request.method !== "GET" && request.method !== "HEAD") return false;
    const language = workbenchLanguageResource(pathname);
    if (language) {
      const headers = { "content-type": "text/javascript; charset=utf-8", "cache-control": "private, max-age=31536000, immutable",
        etag: language.etag, "x-content-type-options": "nosniff" };
      const status = request.headers["if-none-match"] === language.etag ? 304 : 200;
      response.writeHead(status, headers); response.end(status === 200 && request.method === "GET" ? language.body : undefined);
      return true;
    }
    const key = pathname.endsWith(".woff2") ? pathname : currentLocale() + ":" + pathname;
    let asset = workbenchAssets.get(key);
    if (!asset) {
      const plugin = pathname.match(/^\/assets\/molis-work-plugins\/([a-z0-9-]+)\.(js|css)$/);
      const client = plugin?.[2] === "js" ? pluginWorkbenchClientAsset(plugin[1]!) : null;
      const styles = plugin?.[2] === "css" ? pluginOnDemandStylesheet(plugin[1]!) : null;
      const loaded = client ? { body: client, contentType: "text/javascript; charset=utf-8" } : styles ? { body: styles, contentType: "text/css; charset=utf-8" } : pathname === "/assets/molis-work-workbench.css"
      ? { body: renderMolisWorkWorkbenchStylesheet(), contentType: "text/css; charset=utf-8" }
      : pathname === "/assets/molis-work-plugin-frame.js"
        ? { body: renderPluginFrameClientScript(), contentType: "text/javascript; charset=utf-8" }
      : pathname === "/assets/molis-work-workbench.js"
        ? { body: renderMolisWorkWorkbenchClientScript(), contentType: "text/javascript; charset=utf-8" }
        : pathname === "/assets/molis-work-capabilities.js"
        ? { body: renderMolisWorkCapabilitiesClientScript(), contentType: "text/javascript; charset=utf-8" }
        : pathname === "/assets/molis-work-knowledge.js"
        ? { body: renderMolisWorkKnowledgeClientScript(), contentType: "text/javascript; charset=utf-8" }
        // 角色 is the Host's page since CHR-1; its client keeps the address its plugin pack had (D5, BL-378).
        : pathname === "/assets/molis-work-plugins/characters.js"
        ? { body: renderMolisWorkCharactersClientScript(), contentType: "text/javascript; charset=utf-8" }
        : pathname === "/assets/molis-work-arrival.css"
          ? { body: renderMolisWorkArrivalStylesheet(), contentType: "text/css; charset=utf-8" }
        : pathname === "/assets/molis-work-settings.css"
          ? { body: renderMolisWorkSettingsStylesheet(), contentType: "text/css; charset=utf-8" }
          : pathname === "/assets/molis-work-pages-editor.js"
            ? pagesEditorAsset()
          : bundledAppearanceFile(pathname);
      if (!loaded) return false;
      const body = loaded.contentType.startsWith("text/javascript") ? tightenServedJs(loaded.body.toString())
        : loaded.contentType.startsWith("text/css") ? tightenServedCss(loaded.body.toString()) : loaded.body;
      asset = { body, contentType: loaded.contentType, etag: `"${createHash("sha256").update(body).digest("base64url")}"` };
      workbenchAssets.set(key, asset);
    }
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

function pagesEditorAsset(): { body: Buffer; contentType: string } | null {
  try {
    const filePath = requireAsset.resolve("@molis-ai/molis-work-plugin-pages/editor");
    if (!fs.existsSync(filePath)) return null;
    return { body: fs.readFileSync(filePath), contentType: "text/javascript; charset=utf-8" };
  } catch {
    // A build without the Pages editor serves no editor (a 404), as when the file is missing.
    return null;
  }
}
