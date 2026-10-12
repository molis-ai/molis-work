import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { renderPage } from "./page.ts";
import type { Recording } from "./facts.ts";

/** Everything the browser imports. Each is served with its types stripped; none of them touches Node. */
const MODULES = ["client", "render", "render-parts", "render-chrome", "html", "labels", "headline", "scene-state", "ui-state", "evidence-labels"];

export async function loadRecording(flavor: "assistant" | "coding"): Promise<Recording> {
  return JSON.parse(await readFile(new URL(`./recorded/${flavor}.json`, import.meta.url), "utf8")) as Recording;
}

/** An in-memory, read-only preview server. The caller starts and stops it. It reads recorded files and nothing else. */
export async function createPreviewServer(): Promise<Server> {
  const content = new Map<string, { type: string; body: string }>();
  content.set("/", { type: "text/html; charset=utf-8", body: renderPage({ assistant: await loadRecording("assistant"), coding: await loadRecording("coding") }) });
  for (const name of MODULES) {
    const source = await readFile(new URL(`./${name}.ts`, import.meta.url), "utf8");
    content.set(`/slice/${name}.ts`, { type: "text/javascript; charset=utf-8", body: stripTypeScriptTypes(source) });
  }
  return createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405); response.end(); return; }
    const route = (request.url ?? "/").split("?")[0] ?? "/";
    const asset = content.get(route);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (asset === undefined) { response.writeHead(404); response.end("Preview route not found"); return; }
    response.writeHead(200, { "Content-Type": asset.type });
    response.end(request.method === "HEAD" ? undefined : asset.body);
  });
}
