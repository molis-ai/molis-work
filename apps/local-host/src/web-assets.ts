import { createHash } from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import type { createWorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";
import { sendLocalWebJson as sendJson } from "./web-http.js";

const INTER_VARIABLE_FONT_PATH = fileURLToPath(
  new URL("../../../packages/design-system/fonts/inter-latin-variable.woff2", import.meta.url),
);
const NOTO_SANS_SC_FONT_PATH = fileURLToPath(
  new URL("../../../packages/design-system/fonts/noto-sans-sc-400.woff2", import.meta.url),
);

export function createLocalWebAssets(ports: {
  ptyClientFilePath(): string;
  renderer: Pick<ReturnType<typeof createWorkbenchRenderer>, "renderMolisWorkWorkbenchStylesheet" | "renderMolisWorkWorkbenchClientScript" | "renderMolisWorkProjectIndexStylesheet" | "renderMolisWorkOnboardingStylesheet" | "renderMolisWorkSettingsStylesheet">;
}) {
  const { ptyClientFilePath } = ports;
  const { renderMolisWorkWorkbenchStylesheet, renderMolisWorkWorkbenchClientScript, renderMolisWorkProjectIndexStylesheet, renderMolisWorkOnboardingStylesheet, renderMolisWorkSettingsStylesheet } = ports.renderer;
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
    const asset = pathname === "/assets/molis-work-workbench.css"
      ? { body: renderMolisWorkWorkbenchStylesheet(), contentType: "text/css; charset=utf-8" }
      : pathname === "/assets/molis-work-workbench.js"
        ? { body: renderMolisWorkWorkbenchClientScript(), contentType: "text/javascript; charset=utf-8" }
        : pathname === "/assets/molis-work-project-index.css"
          ? { body: renderMolisWorkProjectIndexStylesheet(), contentType: "text/css; charset=utf-8" }
          : pathname === "/assets/molis-work-onboarding.css"
            ? { body: renderMolisWorkOnboardingStylesheet(), contentType: "text/css; charset=utf-8" }
          : pathname === "/assets/molis-work-settings.css"
            ? { body: renderMolisWorkSettingsStylesheet(), contentType: "text/css; charset=utf-8" }
          : pathname === "/assets/inter-latin-variable.woff2" && fs.existsSync(INTER_VARIABLE_FONT_PATH)
            ? { body: fs.readFileSync(INTER_VARIABLE_FONT_PATH), contentType: "font/woff2" }
          : pathname === "/assets/noto-sans-sc-400.woff2" && fs.existsSync(NOTO_SANS_SC_FONT_PATH)
            ? { body: fs.readFileSync(NOTO_SANS_SC_FONT_PATH), contentType: "font/woff2" }
        : null;
    if (!asset) return false;
    const etag = `"${createHash("sha256").update(asset.body).digest("base64url")}"`;
    const headers = {
      "content-type": asset.contentType,
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
