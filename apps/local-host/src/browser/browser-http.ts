import { browserErrors, isBrowserError } from "./errors.js";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readNativePluginJsonBody, writeNativePluginJsonResponse } from "../native-plugin-http.js";
import { localizeWebErrorMessage, readErrorWord } from "../ui-error-words.js";
import { type BrowserHost } from "./browser-host.js";
import type { BrowserSiteDecisions } from "./browser-surfaces.js";

/**
 * The browser's HTTP side (spec §3.2): files the person picks for a page's file chooser, finished downloads, and the
 * page text 交给助理 takes. Mutations pass the Host's usual local control check before they reach here.
 */
interface BrowserHttpPorts {
  readonly browsers: () => BrowserHost;
  readonly projectExists: (projectId: string) => boolean | Promise<boolean>;
  /** The person's standing decisions about sites, and how a running runtime hears a change. */
  readonly sites?: BrowserSiteDecisions;
  readonly decideSite?: (decision: { scope: string; decision: "allow" | "block" | "forget" }) => void;
}

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
const ROUTE = /^\/projects\/([^/]+)\/api\/browser\/(upload|capture|downloads\/([A-Za-z0-9-]{8,80}))$/u;

export async function handleBrowserHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: BrowserHttpPorts): Promise<boolean> {
  if (url.pathname === "/api/browser/assistant" && ports.sites) {
    // Whether the Assistant may use the side panel browser at all; its next round reads this when it starts.
    if (request.method === "GET") { writeNativePluginJsonResponse(response, { status: 200, body: { enabled: ports.sites.assistantEnabled } }); return true; }
    if (request.method === "POST") {
      const body = await readNativePluginJsonBody(request, 1_000).catch(() => ({} as Record<string, unknown>));
      if (typeof body.enabled !== "boolean") { writeNativePluginJsonResponse(response, { status: 400, body: { error: readErrorWord("common.error.invalid") } }); return true; }
      ports.sites.setAssistantEnabled(body.enabled);
      writeNativePluginJsonResponse(response, { status: 200, body: { enabled: ports.sites.assistantEnabled } });
      return true;
    }
  }
  if (url.pathname === "/api/browser/sites" && ports.sites) {
    // Sites the Assistant may use without asking, or never; read and changed only by the local person.
    if (request.method === "GET") { writeNativePluginJsonResponse(response, { status: 200, body: { sites: ports.sites.list() } }); return true; }
    if (request.method === "POST") {
      try {
        const body = await readNativePluginJsonBody(request, 10_000);
        const decision = body.decision === "allow" || body.decision === "block" || body.decision === "forget" ? body.decision : null;
        if (!decision || typeof body.scope !== "string") throw new Error(readErrorWord("common.error.invalid"));
        const sites = ports.sites.set(body.scope, decision);
        ports.decideSite?.({ scope: body.scope, decision });
        writeNativePluginJsonResponse(response, { status: 200, body: { sites } });
      } catch (error) { writeNativePluginJsonResponse(response, { status: 400, body: { error: localizeWebErrorMessage(error, "common.error.invalid") } }); }
      return true;
    }
  }
  const match = ROUTE.exec(url.pathname);
  if (!match) return false;
  const projectId = decodeURIComponent(match[1]!);
  const json = (status: number, body: unknown) => writeNativePluginJsonResponse(response, { status, body });
  if (!await ports.projectExists(projectId)) { json(404, { error: readErrorWord("common.error.not-found") }); return true; }
  const page = ports.browsers().existingPage(projectId);
  try {
    if (match[2] === "capture" && request.method === "POST") {
      if (!page) { json(409, { error: readErrorWord("common.error.browser-no-page") }); return true; }
      json(200, { capture: await page.capture() });
      return true;
    }
    if (match[2] === "upload" && request.method === "POST") {
      if (!page) { json(409, { error: readErrorWord("common.error.conflict") }); return true; }
      const body = await readNativePluginJsonBody(request, Math.ceil(MAX_UPLOAD_BYTES * 1.4));
      const files = Array.isArray(body.files) ? body.files as Array<{ name?: unknown; data?: unknown }> : [];
      if (!files.length) { json(400, { error: readErrorWord("common.error.invalid") }); return true; }
      const dir = path.join(ports.browsers().uploadsRoot, randomUUID());
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      let total = 0;
      const written = files.map(file => {
        const name = String(file.name ?? "file").replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_").slice(0, 200) || "file";
        const bytes = Buffer.from(String(file.data ?? ""), "base64");
        total += bytes.byteLength;
        if (total > MAX_UPLOAD_BYTES) throw browserErrors.load_failed(readErrorWord("common.error.browser-file-too-large"));
        const target = path.join(dir, name);
        fs.writeFileSync(target, bytes, { mode: 0o600 });
        return target;
      });
      await page.chooseFiles(String(body.chooser_id ?? ""), written);
      json(200, { chosen: written.map(file => path.basename(file)) });
      return true;
    }
    if (match[3] && request.method === "GET") {
      const download = page?.download(match[3]);
      const file = ports.browsers().downloadPath(match[3]);
      if (!download || download.state !== "completed" || !fs.existsSync(file)) { json(404, { error: readErrorWord("common.error.browser-download-missing") }); return true; }
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(download.filename)}`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      fs.createReadStream(file).pipe(response);
      return true;
    }
    json(405, { error: readErrorWord("common.error.method-not-allowed") });
    return true;
  } catch (error) {
    json(isBrowserError(error) ? 409 : 500, { error: localizeWebErrorMessage(error, isBrowserError(error) ? "common.error.conflict" : "common.error.internal") });
    return true;
  }
}
